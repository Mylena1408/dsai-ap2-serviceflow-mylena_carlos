import { describe, expect, it } from "vitest";
import {
  CATALOG_SECTION_TITLES,
  DEFAULT_REQUESTER_KIND,
  DEFAULT_SERVICE_AUDIENCE,
  REQUESTER_KIND_LABELS,
  SERVICE_AUDIENCE_LABELS,
  audiencesFor,
  isOfferedTo,
  isRequesterKind,
  isServiceAudience,
  requesterKindFromText,
} from "@/shared/requester-kinds";
import { requesterKindOf } from "@/modules/users/application/user-schemas";

// SPEC 2026-11-16-tipos-de-solicitante, rules 1 to 3 and decisions T4, T5 and T7 (SF-276).

describe("kinds and audiences", () => {
  it("a student sees the services for students and for both; the general public, its own and both", () => {
    expect(audiencesFor("STUDENT")).toEqual(["STUDENTS", "BOTH"]);
    expect(audiencesFor("PUBLIC")).toEqual(["PUBLIC", "BOTH"]);
    expect(isOfferedTo("BOTH", "PUBLIC")).toBe(true);
    expect(isOfferedTo("STUDENTS", "PUBLIC")).toBe(false);
    expect(isOfferedTo("PUBLIC", "STUDENT")).toBe(false);
    expect(isOfferedTo("STUDENTS", "STUDENT")).toBe(true);
  });

  it("the defaults keep everything as before: a student, a service for both (T4 and T5)", () => {
    expect(DEFAULT_REQUESTER_KIND).toBe("STUDENT");
    expect(DEFAULT_SERVICE_AUDIENCE).toBe("BOTH");
    expect(requesterKindOf("REQUESTER", undefined)).toBe("STUDENT");
    expect(requesterKindOf("REQUESTER", "PUBLIC")).toBe("PUBLIC");
    expect(requesterKindOf("ATTENDANT", "PUBLIC")).toBeNull();
  });

  it("names each kind and audience in the screens' words", () => {
    expect(REQUESTER_KIND_LABELS).toEqual({ STUDENT: "Aluno", PUBLIC: "Público geral" });
    expect(SERVICE_AUDIENCE_LABELS).toEqual({ STUDENTS: "Alunos", PUBLIC: "Público geral", BOTH: "Alunos e público geral" });
    expect(CATALOG_SECTION_TITLES).toEqual({ STUDENT: "Serviços para alunos", PUBLIC: "Serviços para o público geral" });
    expect(isRequesterKind("PUBLIC")).toBe(true);
    expect(isRequesterKind("TEACHER")).toBe(false);
    expect(isServiceAudience("BOTH")).toBe(true);
    expect(isServiceAudience(3)).toBe(false);
  });
});

describe("the kind written in the CSV import (T7)", () => {
  it("reads aluno and público geral without minding accents, case or spaces; empty is null; anything else is undefined", () => {
    expect(requesterKindFromText("aluno")).toBe("STUDENT");
    expect(requesterKindFromText("  ALUNA ")).toBe("STUDENT");
    expect(requesterKindFromText("Público   Geral")).toBe("PUBLIC");
    expect(requesterKindFromText("publico")).toBe("PUBLIC");
    expect(requesterKindFromText("")).toBeNull();
    expect(requesterKindFromText(undefined)).toBeNull();
    expect(requesterKindFromText("professor")).toBeUndefined();
  });
});
