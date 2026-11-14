"use server";

import { revalidatePath } from "next/cache";
import { applyUserImport, previewUserImport, MAX_IMPORT_BYTES, type ImportLineOutcome, type ImportSummary, type UserImportPreview } from "@/modules/user-import";
import { ApplicationError } from "@/server/errors";

// The import of people from the administration (SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 items 2 and 3; SF-245):
// the file goes to the preview, which comes back with its text and digest; applying sends that same text. Nothing
// travels in the address.

export type UserImportState =
  | { step: "idle" }
  | { step: "preview"; preview: UserImportPreview; fileName: string }
  | { step: "applied"; importId: string; summary: ImportSummary; lines: ImportLineOutcome[]; previewed: ImportSummary }
  | { step: "error"; message: string };

const ERROR_MESSAGES = {
  missing: "Escolha um arquivo CSV.",
  tooLarge: "O arquivo passa de 200 KB.",
  changed: "O arquivo mudou desde a prévia. Envie-o de novo para uma nova prévia.",
  refused: "O arquivo não pode ser aplicado. Envie-o de novo para ver os problemas.",
  access: "Só o administrador importa usuários.",
  unexpected: "Não foi possível concluir a importação. Nada foi gravado; tente de novo.",
} as const;

function errorOf(error: ApplicationError): UserImportState {
  if (error.code === "CONFLICT") return { step: "error", message: ERROR_MESSAGES.changed };
  if (error.code === "VALIDATION_ERROR") return { step: "error", message: ERROR_MESSAGES.refused };
  if (error.code === "UNAUTHENTICATED" || error.code === "FORBIDDEN") return { step: "error", message: ERROR_MESSAGES.access };
  return { step: "error", message: ERROR_MESSAGES.unexpected };
}

export async function previewUserImportAction(_previous: UserImportState, formData: FormData): Promise<UserImportState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { step: "error", message: ERROR_MESSAGES.missing };
  if (file.size > MAX_IMPORT_BYTES) return { step: "error", message: ERROR_MESSAGES.tooLarge };
  try {
    return { step: "preview", preview: await previewUserImport(new Uint8Array(await file.arrayBuffer())), fileName: file.name };
  } catch (error) {
    if (error instanceof ApplicationError) return errorOf(error);
    throw error;
  }
}

export async function applyUserImportAction(_previous: UserImportState, formData: FormData): Promise<UserImportState> {
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const previewed = { create: Number(field("create")), skip: Number(field("skip")), error: Number(field("error")) };
  try {
    const result = await applyUserImport({ content: field("content"), digest: field("digest") });
    revalidatePath("/admin");
    return { step: "applied", importId: result.importId, summary: result.summary, lines: result.lines, previewed };
  } catch (error) {
    if (error instanceof ApplicationError) return errorOf(error);
    throw error;
  }
}
