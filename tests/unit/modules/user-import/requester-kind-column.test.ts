import { describe, expect, it } from "vitest";
import { IMPORT_LINE_ERROR_LABELS, classifyImportRows, readImportText } from "@/modules/user-import";

// SPEC 2026-11-16-tipos-de-solicitante, decision T7 (SF-277; CA-TIP-01): the optional "tipo" column of the import.

const facts = { existingEmails: new Set<string>(), activeSectors: [{ id: "s1", name: "Secretaria" }] };

function classify(text: string) {
  const read = readImportText(text);
  if (!read.ok) throw new Error(read.error);
  return classifyImportRows(read.rows, facts);
}

describe("the tipo column", () => {
  it("is optional: a file without it reads as before and its requesters are students by the database's rule", () => {
    const [line] = classify("nome;email;perfil;setor\nAna;ana@x.test;solicitante;");
    expect(line).toMatchObject({ outcome: "create", person: { name: "Ana", email: "ana@x.test", role: "REQUESTER", sectorId: null } });
    expect(line!.outcome === "create" && line!.person.requesterKind).toBe(undefined);
  });

  it("gives each requester the kind written, without minding accents or case; empty is a student", () => {
    const lines = classify(
      "nome;email;perfil;setor;tipo\nAna;ana@x.test;solicitante;;aluno\nBia;bia@x.test;solicitante;;PUBLICO GERAL\nCaio;caio@x.test;solicitante;;",
    );
    expect(lines.map((line) => (line.outcome === "create" ? line.person.requesterKind ?? "padrão" : line.outcome))).toEqual([
      "STUDENT",
      "PUBLIC",
      "padrão",
    ]);
  });

  it("refuses an unknown kind and a kind for another role, naming the error", () => {
    const lines = classify(
      "nome;email;perfil;setor;tipo\nAna;ana@x.test;solicitante;;professor\nDiego;diego@x.test;atendente;Secretaria;aluno\nEva;eva@x.test;atendente;Secretaria;",
    );
    expect(lines.map((line) => (line.outcome === "error" ? line.errors : line.outcome))).toEqual([["kind_invalid"], ["kind_not_allowed"], "create"]);
    expect(IMPORT_LINE_ERROR_LABELS.kind_invalid).toBe("tipo desconhecido (use aluno ou público geral)");
    expect(IMPORT_LINE_ERROR_LABELS.kind_not_allowed).toBe("só o solicitante tem tipo");
  });

  it("accepts the header \"tipo de solicitante\" too", () => {
    const [line] = classify("nome;email;perfil;setor;Tipo de solicitante\nAna;ana@x.test;solicitante;;público geral");
    expect(line!.outcome === "create" && line!.person.requesterKind).toBe("PUBLIC");
  });
});
