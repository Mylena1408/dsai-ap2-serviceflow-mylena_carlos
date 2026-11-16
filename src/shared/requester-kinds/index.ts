// SPEC 2026-11-16-tipos-de-solicitante (SF-276): the kinds of requester and the audiences of a service, shared by the
// users, the services, the catalog, the queue and the reports. A student is internal (the requester as before); the
// general public is external only as to the services it may ask for (decision T3).

export const REQUESTER_KINDS = ["STUDENT", "PUBLIC"] as const;
export type RequesterKind = (typeof REQUESTER_KINDS)[number];

export const SERVICE_AUDIENCES = ["STUDENTS", "PUBLIC", "BOTH"] as const;
export type ServiceAudience = (typeof SERVICE_AUDIENCES)[number];

/** Decision T4: a requester without a kind is a student. */
export const DEFAULT_REQUESTER_KIND: RequesterKind = "STUDENT";
/** Decision T5: a service without an audience is for both. */
export const DEFAULT_SERVICE_AUDIENCE: ServiceAudience = "BOTH";

export const REQUESTER_KIND_LABELS: Record<RequesterKind, string> = {
  STUDENT: "Aluno",
  PUBLIC: "Público geral",
};

export const SERVICE_AUDIENCE_LABELS: Record<ServiceAudience, string> = {
  STUDENTS: "Alunos",
  PUBLIC: "Público geral",
  BOTH: "Alunos e público geral",
};

/** The catalog's subsection for each kind (section 4.2 item 1). */
export const CATALOG_SECTION_TITLES: Record<RequesterKind, string> = {
  STUDENT: "Serviços para alunos",
  PUBLIC: "Serviços para o público geral",
};

export function isRequesterKind(value: unknown): value is RequesterKind {
  return typeof value === "string" && (REQUESTER_KINDS as readonly string[]).includes(value);
}

export function isServiceAudience(value: unknown): value is ServiceAudience {
  return typeof value === "string" && (SERVICE_AUDIENCES as readonly string[]).includes(value);
}

/** The audiences a person of this kind may ask for: their own and both (rule 2). */
export function audiencesFor(kind: RequesterKind): ServiceAudience[] {
  return kind === "PUBLIC" ? ["PUBLIC", "BOTH"] : ["STUDENTS", "BOTH"];
}

/** Whether a service with this audience is offered to a person of this kind (rule 2). */
export function isOfferedTo(audience: ServiceAudience, kind: RequesterKind): boolean {
  return audiencesFor(kind).includes(audience);
}

function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * The kind written in the CSV import (decision T7): "aluno" or "público geral", without minding accents, case or extra
 * spaces; also "publico" alone. An empty cell is null (the import decides the default); anything else is undefined.
 */
export function requesterKindFromText(text: string | undefined): RequesterKind | null | undefined {
  const value = plain(text ?? "");
  if (value === "") return null;
  if (value === "aluno" || value === "aluna" || value === "estudante") return "STUDENT";
  if (value === "publico geral" || value === "publico") return "PUBLIC";
  return undefined;
}
