"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSpace, setSpaceActive, updateSpace } from "@/modules/spaces";
import { ApplicationError } from "@/server/errors";

// The registration of spaces (SPEC 2026-11-16-professores-e-tecnicos, part C item 1; P5 and P6), from the
// administration's section "Espaços" and from the page "Serviços do setor".

const PAGES: Record<string, string> = { admin: "/admin?section=spaces", sector: "/sector-services" };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function pageOf(formData: FormData): string {
  return PAGES[field(formData, "area")] ?? PAGES.admin!;
}

function separator(page: string): string {
  return page.includes("?") ? "&" : "?";
}

function data(formData: FormData) {
  return {
    name: field(formData, "name"),
    kind: field(formData, "kind"),
    sectorId: field(formData, "sectorId"),
    capacity: field(formData, "capacity"),
    location: field(formData, "location"),
    resources: field(formData, "resources"),
    confirmation: field(formData, "confirmation"),
  };
}

async function run(formData: FormData, work: () => Promise<unknown>, notice: string): Promise<never> {
  const page = pageOf(formData);
  try {
    await work();
  } catch (error) {
    if (error instanceof ApplicationError) {
      const code = error.code === "CONFLICT" ? "name" : error.code === "VALIDATION_ERROR" ? "invalid" : error.code === "NOT_FOUND" ? "missing" : "denied";
      redirect(`${page}${separator(page)}spaceError=${code}#espacos`);
    }
    throw error;
  }
  revalidatePath("/admin");
  revalidatePath("/sector-services");
  redirect(`${page}${separator(page)}spaceNotice=${notice}#espacos`);
}

export async function createSpaceAction(formData: FormData): Promise<never> {
  return run(formData, () => createSpace(data(formData)), "created");
}

export async function updateSpaceAction(formData: FormData): Promise<never> {
  return run(formData, () => updateSpace(field(formData, "spaceId"), data(formData)), "updated");
}

export async function setSpaceActiveAction(formData: FormData): Promise<never> {
  const active = field(formData, "isActive") === "true";
  return run(formData, () => setSpaceActive(field(formData, "spaceId"), active), active ? "activated" : "deactivated");
}
