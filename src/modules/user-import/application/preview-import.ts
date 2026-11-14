import { createHash } from "node:crypto";
import { requireConfigurationAdministrator } from "@/server/authorization";
import {
  classifyImportRows,
  decodeImportFile,
  normalizeImportText,
  readImportText,
  summarizeImport,
  type ImportFacts,
  type ImportFileError,
  type ImportLineOutcome,
  type ImportRow,
  type ImportSummary,
} from "../domain/user-import";

// The preview of an import (SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 2 and 4.3; SF-242): only the
// administrator; each line with its outcome against the database of the moment; nothing is written. The text and its
// SHA-256 digest go back, so the application (SF-243) checks it is the same file and evaluates it again.

export interface UserImportReader {
  /** The e-mails of the list already in use, in lower case (the column ignores case). */
  existingEmails(emails: readonly string[]): Promise<string[]>;
  activeSectors(): Promise<Array<{ id: string; name: string }>>;
}

export type UserImportPreview =
  | { ok: false; error: ImportFileError; line?: number }
  | { ok: true; content: string; digest: string; lines: ImportLineOutcome[]; summary: ImportSummary };

export const importDigest = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");

/** What the database says for these rows, now. */
export async function importFacts(rows: readonly ImportRow[], reader: UserImportReader): Promise<ImportFacts> {
  const emails = [...new Set(rows.map(({ values }) => values.email.toLocaleLowerCase("pt-BR")).filter((email) => email !== ""))];
  const [existing, activeSectors] = await Promise.all([emails.length > 0 ? reader.existingEmails(emails) : Promise.resolve([]), reader.activeSectors()]);
  return { existingEmails: new Set(existing.map((email) => email.toLocaleLowerCase("pt-BR"))), activeSectors };
}

/** Evaluates a text already decoded: the preview and the application share it. */
export async function evaluateImportText(content: string, reader: UserImportReader): Promise<UserImportPreview> {
  const read = readImportText(content);
  if (!read.ok) return read;
  const lines = classifyImportRows(read.rows, await importFacts(read.rows, reader));
  return { ok: true, content, digest: importDigest(content), lines, summary: summarizeImport(lines) };
}

export async function previewUserImport(file: Uint8Array, reader: UserImportReader): Promise<UserImportPreview> {
  await requireConfigurationAdministrator();
  const decoded = decodeImportFile(file);
  if (!decoded.ok) return decoded;
  return evaluateImportText(normalizeImportText(decoded.text), reader);
}
