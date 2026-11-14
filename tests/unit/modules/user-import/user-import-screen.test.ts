import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(admin)/admin/_sections/user-import/actions", () => ({ previewUserImportAction: vi.fn(), applyUserImportAction: vi.fn() }));

import { IMPORT_LINE_ERROR_LABELS, buildImportModelCsv, classifyImportRows, readImportText } from "@/modules/user-import";
import { csvField } from "@/modules/reports";
import { LinesTable, appliedText, outcomeText, summaryText } from "@/app/(admin)/admin/_sections/user-import/user-import";
import { UserImportSection } from "@/app/(admin)/admin/_sections/user-import/user-import-section";

// SPEC 2026-11-09-comunicacao-e-calendarios, part B (SF-245; CA-IMP-02 on the screen): the model and the screen pieces.

const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);

describe("the model of the file", () => {
  it("has the header and two examples, the attendant with a sector that does not exist", () => {
    expect(buildImportModelCsv(csvField)).toBe(
      BOM + ["nome;email;perfil;setor", "Maria Exemplo;maria.exemplo@exemplo.test;solicitante;", "João Exemplo;joao.exemplo@exemplo.test;atendente;Nome de um setor ativo"].join(CRLF) + CRLF,
    );
  });

  it("imported without changes, creates the requester and refuses the attendant's line", () => {
    const read = readImportText(buildImportModelCsv(csvField));
    expect(read.ok).toBe(true);
    const lines = classifyImportRows(read.ok ? read.rows : [], { existingEmails: new Set(), activeSectors: [{ id: "s", name: "Central" }] });
    expect(lines.map((line) => (line.outcome === "error" ? line.errors : line.outcome))).toEqual(["create", ["sector_unknown"]]);
  });
});

describe("the texts of the screen", () => {
  it("tells the totals of the preview and of the application", () => {
    expect(summaryText({ create: 1, skip: 2, error: 0 })).toBe("1 pessoa a criar, 2 ignoradas (e-mail já existe) e 0 linhas com erro.");
    expect(appliedText({ create: 2, skip: 1, error: 1 })).toBe("2 pessoas criadas, 1 ignorada e 1 linha com erro.");
  });

  it("tells each line's outcome, with every reason of an error", () => {
    const values = { nome: "Ana", email: "a@x.test", perfil: "chefe", setor: "" };
    expect(outcomeText({ line: 2, values, outcome: "create", person: { name: "Ana", email: "a@x.test", role: "REQUESTER", sectorId: null } }, IMPORT_LINE_ERROR_LABELS)).toBe(
      "Criar",
    );
    expect(outcomeText({ line: 2, values, outcome: "skip", reason: "email_exists" }, IMPORT_LINE_ERROR_LABELS)).toBe("Ignorar: e-mail já existe");
    expect(outcomeText({ line: 2, values, outcome: "error", errors: ["role_invalid", "name_missing"] }, IMPORT_LINE_ERROR_LABELS)).toBe(
      "Erro: perfil desconhecido, nome vazio",
    );
  });

  it("shows each line with its values, a dash for an empty one, escaping what was typed", () => {
    const html = renderToStaticMarkup(
      createElement(LinesTable, {
        caption: "Linhas do arquivo",
        lineErrors: IMPORT_LINE_ERROR_LABELS,
        lines: [{ line: 3, values: { nome: "<b>Ana</b>", email: "", perfil: "chefe", setor: "" }, outcome: "error", errors: ["email_invalid", "role_invalid"] }],
      }),
    );
    expect(html).toContain("<caption>Linhas do arquivo</caption>");
    expect(html).toContain("<td>3</td><td>&lt;b&gt;Ana&lt;/b&gt;</td><td>—</td><td>chefe</td><td>—</td><td>Erro: e-mail inválido, perfil desconhecido</td>");
  });
});

describe("the section \"Importar usuários\"", () => {
  it("offers the model, says people enter inactive and without a password, and lists the history with each report", () => {
    const html = renderToStaticMarkup(
      createElement(UserImportSection, {
        history: [{ id: "imp-1", createdAt: new Date("2026-11-14T18:30:00.000Z"), actorName: "Marina Alves", createdCount: 2, skippedCount: 1, errorCount: 0 }],
      }),
    );
    expect(html).toContain('href="/api/user-imports/model.csv"');
    expect(html).toContain("As pessoas entram inativas e sem senha");
    expect(html).toContain("<td>14/11/2026 15:30</td><td>Marina Alves</td><td>2</td><td>1</td><td>0</td>");
    expect(html).toContain('href="/api/user-imports/imp-1/report.csv"');
  });

  it("explains an empty history", () => {
    expect(renderToStaticMarkup(createElement(UserImportSection, { history: [] }))).toContain("Nenhuma importação ainda.");
  });
});
