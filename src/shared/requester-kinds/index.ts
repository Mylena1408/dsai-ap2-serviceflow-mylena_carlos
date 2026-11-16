// SPEC 2026-11-16-tipos-de-solicitante (SF-276): the kinds of requester, shared by the users, the services, the catalog,
// the queue and the reports. A student is internal (the requester as before); the general public is external only as
// to the services it may ask for (decision T3). SPEC 2026-11-16-professores-e-tecnicos (SF-285; P1 and P2): also a
// professor and an administrative technician, and each service is offered to a list of kinds.

export const REQUESTER_KINDS = ["STUDENT", "PROFESSOR", "TECHNICIAN", "PUBLIC"] as const;
export type RequesterKind = (typeof REQUESTER_KINDS)[number];

/** Decision T4: a requester without a kind is a student. */
export const DEFAULT_REQUESTER_KIND: RequesterKind = "STUDENT";
/** Decision P1: a service without a list is offered to every kind (the old "both", for everyone). */
export const DEFAULT_OFFERED_TO: readonly RequesterKind[] = REQUESTER_KINDS;

export const REQUESTER_KIND_LABELS: Record<RequesterKind, string> = {
  STUDENT: "Aluno",
  PROFESSOR: "Professor",
  TECHNICIAN: "Técnico-administrativo",
  PUBLIC: "Público geral",
};

/** The plural of each kind, for "Oferecido a" (P1). */
export const OFFERED_TO_LABELS: Record<RequesterKind, string> = {
  STUDENT: "Alunos",
  PROFESSOR: "Professores",
  TECHNICIAN: "Técnicos-administrativos",
  PUBLIC: "Público geral",
};

/** The catalog's subsection for each kind (tipos de solicitante, 4.2 item 1; professores e técnicos, P2). */
export const CATALOG_SECTION_TITLES: Record<RequesterKind, string> = {
  STUDENT: "Serviços para alunos",
  PROFESSOR: "Serviços para professores",
  TECHNICIAN: "Serviços para técnicos-administrativos",
  PUBLIC: "Serviços para o público geral",
};

export function isRequesterKind(value: unknown): value is RequesterKind {
  return typeof value === "string" && (REQUESTER_KINDS as readonly string[]).includes(value);
}

/** Rule 4.2.2: the kinds of a list without repetition, in the order of REQUESTER_KINDS. */
export function normalizeOfferedTo(kinds: readonly RequesterKind[]): RequesterKind[] {
  return REQUESTER_KINDS.filter((kind) => kinds.includes(kind));
}

/** Whether a service offered to these kinds is offered to a person of this kind (rule 2). */
export function isOfferedTo(offeredTo: readonly RequesterKind[] | undefined, kind: RequesterKind): boolean {
  return (offeredTo ?? DEFAULT_OFFERED_TO).includes(kind);
}

/** "Todos os tipos" or the kinds in words: "Alunos e Professores". */
export function offeredToLabel(offeredTo: readonly RequesterKind[] | undefined): string {
  const kinds = normalizeOfferedTo(offeredTo ?? DEFAULT_OFFERED_TO);
  if (kinds.length === REQUESTER_KINDS.length) return "Todos os tipos";
  const names = kinds.map((kind) => OFFERED_TO_LABELS[kind]);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

/** The audience of the configuration files of versions 1 to 4 (P4), converted as the migration did (P1). */
export const LEGACY_SERVICE_AUDIENCES = ["STUDENTS", "PUBLIC", "BOTH"] as const;
export type LegacyServiceAudience = (typeof LEGACY_SERVICE_AUDIENCES)[number];

export function offeredToFromLegacy(audience: LegacyServiceAudience): RequesterKind[] {
  if (audience === "STUDENTS") return ["STUDENT"];
  if (audience === "PUBLIC") return ["PUBLIC"];
  return [...REQUESTER_KINDS];
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
 * spaces; also "publico" alone. SPEC 2026-11-16-professores-e-tecnicos (P3): "professor" and "técnico" (or
 * "técnico-administrativo"). An empty cell is null (the import decides the default); anything else is undefined.
 */
export function requesterKindFromText(text: string | undefined): RequesterKind | null | undefined {
  const value = plain(text ?? "");
  if (value === "") return null;
  if (value === "aluno" || value === "aluna" || value === "estudante") return "STUDENT";
  if (value === "professor" || value === "professora" || value === "docente") return "PROFESSOR";
  if (["tecnico", "tecnica", "tecnico-administrativo", "tecnica-administrativa", "tecnico administrativo", "tecnica administrativa"].includes(value)) {
    return "TECHNICIAN";
  }
  if (value === "publico geral" || value === "publico") return "PUBLIC";
  return undefined;
}
