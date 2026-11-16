import { describe, expect, it } from "vitest";
import {
  CATALOG_SECTION_TITLES,
  DEFAULT_OFFERED_TO,
  DEFAULT_REQUESTER_KIND,
  OFFERED_TO_LABELS,
  REQUESTER_KINDS,
  REQUESTER_KIND_LABELS,
  isOfferedTo,
  isRequesterKind,
  normalizeOfferedTo,
  offeredToFromLegacy,
  offeredToLabel,
  requesterKindFromText,
} from "@/shared/requester-kinds";
import { requesterKindOf } from "@/modules/users/application/user-schemas";

// SPEC 2026-11-16-tipos-de-solicitante, rules 1 to 3 and decisions T4 and T7 (SF-276); SPEC
// 2026-11-16-professores-e-tecnicos, P1 to P4 (SF-285). Since P1, a service is offered to a list of kinds instead of
// "only students", "only general public" or "both" (an exception registered in that SPEC, section 11).

describe("kinds and what a service is offered to (P1)", () => {
  it("has four kinds, in the order the screens list them", () => {
    expect(REQUESTER_KINDS).toEqual(["STUDENT", "PROFESSOR", "TECHNICIAN", "PUBLIC"]);
  });

  it("a person sees a service only when the list has their kind", () => {
    expect(isOfferedTo(["STUDENT"], "STUDENT")).toBe(true);
    expect(isOfferedTo(["STUDENT"], "PUBLIC")).toBe(false);
    expect(isOfferedTo(["PROFESSOR", "TECHNICIAN"], "TECHNICIAN")).toBe(true);
    expect(isOfferedTo(["PROFESSOR", "TECHNICIAN"], "STUDENT")).toBe(false);
    // A service without the list (an older double) is offered to every kind.
    for (const kind of REQUESTER_KINDS) expect(isOfferedTo(undefined, kind)).toBe(true);
  });

  it("keeps a list without repetition and in order (rule 4.2.2)", () => {
    expect(normalizeOfferedTo(["PUBLIC", "STUDENT", "PUBLIC"])).toEqual(["STUDENT", "PUBLIC"]);
    expect(normalizeOfferedTo([])).toEqual([]);
  });

  it("converts the old audience as the migration did: only students, only public, both = every kind", () => {
    expect(offeredToFromLegacy("STUDENTS")).toEqual(["STUDENT"]);
    expect(offeredToFromLegacy("PUBLIC")).toEqual(["PUBLIC"]);
    expect(offeredToFromLegacy("BOTH")).toEqual(["STUDENT", "PROFESSOR", "TECHNICIAN", "PUBLIC"]);
  });

  it("the defaults keep everything as before: a student, a service for everyone (T4 and P1)", () => {
    expect(DEFAULT_REQUESTER_KIND).toBe("STUDENT");
    expect(DEFAULT_OFFERED_TO).toEqual(REQUESTER_KINDS);
    expect(requesterKindOf("REQUESTER", undefined)).toBe("STUDENT");
    expect(requesterKindOf("REQUESTER", "PUBLIC")).toBe("PUBLIC");
    expect(requesterKindOf("REQUESTER", "PROFESSOR")).toBe("PROFESSOR");
    expect(requesterKindOf("ATTENDANT", "PUBLIC")).toBeNull();
  });
});

describe("the screens' words (P2)", () => {
  it("names each kind, its plural and its catalog subsection", () => {
    expect(REQUESTER_KIND_LABELS).toEqual({
      STUDENT: "Aluno",
      PROFESSOR: "Professor",
      TECHNICIAN: "Técnico-administrativo",
      PUBLIC: "Público geral",
    });
    expect(OFFERED_TO_LABELS.TECHNICIAN).toBe("Técnicos-administrativos");
    expect(CATALOG_SECTION_TITLES).toEqual({
      STUDENT: "Serviços para alunos",
      PROFESSOR: "Serviços para professores",
      TECHNICIAN: "Serviços para técnicos-administrativos",
      PUBLIC: "Serviços para o público geral",
    });
    expect(isRequesterKind("PROFESSOR")).toBe(true);
    expect(isRequesterKind("TEACHER")).toBe(false);
  });

  it("says who a service is offered to in words", () => {
    expect(offeredToLabel(undefined)).toBe("Todos os tipos");
    expect(offeredToLabel(["PUBLIC", "STUDENT", "PROFESSOR", "TECHNICIAN"])).toBe("Todos os tipos");
    expect(offeredToLabel(["STUDENT"])).toBe("Alunos");
    expect(offeredToLabel(["STUDENT", "PROFESSOR"])).toBe("Alunos e Professores");
    expect(offeredToLabel(["TECHNICIAN", "STUDENT", "PROFESSOR"])).toBe("Alunos, Professores e Técnicos-administrativos");
  });
});

describe("the kind written in the CSV import (T7 and P3)", () => {
  it("reads aluno and público geral without minding accents, case or spaces; empty is null; anything else is undefined", () => {
    expect(requesterKindFromText("aluno")).toBe("STUDENT");
    expect(requesterKindFromText("  ALUNA ")).toBe("STUDENT");
    expect(requesterKindFromText("Público   Geral")).toBe("PUBLIC");
    expect(requesterKindFromText("publico")).toBe("PUBLIC");
    expect(requesterKindFromText("")).toBeNull();
    expect(requesterKindFromText(undefined)).toBeNull();
    expect(requesterKindFromText("visitante")).toBeUndefined();
  });

  it("reads professor and técnico in their usual forms", () => {
    expect(requesterKindFromText("Professor")).toBe("PROFESSOR");
    expect(requesterKindFromText("professora")).toBe("PROFESSOR");
    expect(requesterKindFromText("DOCENTE")).toBe("PROFESSOR");
    expect(requesterKindFromText("técnico")).toBe("TECHNICIAN");
    expect(requesterKindFromText("Técnica-Administrativa")).toBe("TECHNICIAN");
    expect(requesterKindFromText("tecnico administrativo")).toBe("TECHNICIAN");
  });
});
