import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  classifyImportRows,
  decodeImportFile,
  importKey,
  parseCsv,
  parseImportRole,
  readImportFile,
  summarizeImport,
  type ImportFacts,
  type ImportRow,
} from "@/modules/user-import";

// SPEC 2026-11-09-comunicacao-e-calendarios, 4.3 items 1 and 2 (SF-241; the rules of CA-IMP-02): the CSV format and
// each line's outcome.

const BOM = String.fromCharCode(0xfeff);
const bytes = (text: string) => new TextEncoder().encode(text);
const SECTOR = "11111111-1111-4111-8111-111111111111";

describe("parseCsv", () => {
  it("reads ';' and ',' by the header, with quotes, separators and line breaks inside quotes", () => {
    expect(parseCsv('nome;email\r\n"Silva; Ana";ana@x.test\r\n"Diz ""oi""";b@x.test\r\n')).toEqual({
      ok: true,
      separator: ";",
      records: [
        { line: 1, fields: ["nome", "email"] },
        { line: 2, fields: ["Silva; Ana", "ana@x.test"] },
        { line: 3, fields: ['Diz "oi"', "b@x.test"] },
      ],
    });
    const comma = parseCsv('nome,email\n"Duas\nlinhas",c@x.test\nFim,d@x.test');
    expect(comma).toMatchObject({ ok: true, separator: "," });
    expect(comma.ok && comma.records.map(({ line, fields }) => [line, fields[0]])).toEqual([
      [1, "nome"],
      [2, "Duas\nlinhas"],
      [4, "Fim"],
    ]);
  });

  it("ignores the byte order mark and blank lines, and keeps empty fields", () => {
    const parsed = parseCsv(`${BOM}nome;email\n\nAna;\n\n`);
    expect(parsed.ok && parsed.records).toEqual([
      { line: 1, fields: ["nome", "email"] },
      { line: 3, fields: ["Ana", ""] },
    ]);
  });

  it("refuses a quote that is never closed, naming its line", () => {
    expect(parseCsv('nome;email\nAna;ana@x.test\n"Bia;b@x.test\n')).toEqual({ ok: false, error: "unterminated_quote", line: 3 });
  });

  it("keeps cells a spreadsheet would read as formulas as plain text", () => {
    const parsed = parseCsv("nome;email\n=1+1;@cmd\n");
    expect(parsed.ok && parsed.records[1]!.fields).toEqual(["=1+1", "@cmd"]);
  });
});

describe("the file (4.3 item 1)", () => {
  const header = "nome;email;perfil;setor";

  it("accepts up to 200 KB of UTF-8 and refuses more or another encoding", () => {
    expect(decodeImportFile(new Uint8Array(MAX_IMPORT_BYTES)).ok).toBe(true);
    expect(decodeImportFile(new Uint8Array(MAX_IMPORT_BYTES + 1))).toEqual({ ok: false, error: "too_big" });
    expect(decodeImportFile(Uint8Array.of(0x6e, 0x6f, 0x6d, 0xe9))).toEqual({ ok: false, error: "not_utf8" });
  });

  it("reads the four columns in any order, by name without case or accents, trimming the values", () => {
    const result = readImportFile(bytes(`Setor, E-mail ,PERFIL,Nome\nCentral , ana@x.test,Atendente, Ana Souza \n`));
    expect(result).toEqual({
      ok: true,
      rows: [{ line: 2, fieldCountMismatch: false, values: { nome: "Ana Souza", email: "ana@x.test", perfil: "Atendente", setor: "Central" } }],
    });
  });

  it.each([
    ["an empty file", "", "no_header"],
    ["a missing column", "nome;email;perfil\nAna;a@x.test;gestor", "missing_column"],
    ["a repeated column", "nome;email;email;perfil;setor\n", "repeated_column"],
    ["an unknown column, such as a password", "nome;email;perfil;setor;senha\nAna;a@x.test;gestor;TI;123", "unknown_column"],
    ["a header without people", `${header}\n\n`, "no_rows"],
    ["an open quote", `${header}\n"Ana;a@x.test;gestor;TI`, "unterminated_quote"],
  ])("refuses %s", (_label, text, error) => {
    expect(readImportFile(bytes(text))).toMatchObject({ ok: false, error });
  });

  it("accepts 500 lines of people and refuses 501", () => {
    const lines = (count: number) => [header, ...Array.from({ length: count }, (_, index) => `P${index};p${index}@x.test;solicitante;`)].join("\n");
    expect(readImportFile(bytes(lines(MAX_IMPORT_ROWS))).ok).toBe(true);
    expect(readImportFile(bytes(lines(MAX_IMPORT_ROWS + 1)))).toEqual({ ok: false, error: "too_many_rows" });
  });

  it("marks a line with a different number of fields", () => {
    const result = readImportFile(bytes(`${header}\nAna;a@x.test;solicitante\n`));
    expect(result.ok && result.rows[0]).toMatchObject({ fieldCountMismatch: true, values: { setor: "" } });
  });
});

describe("roles and keys", () => {
  it.each([
    ["administrador", "ADMIN"],
    ["Gestor", "MANAGER"],
    ["ATENDENTE", "ATTENDANT"],
    ["solicitante", "REQUESTER"],
    ["MANAGER", "MANAGER"],
    [" requester ", "REQUESTER"],
    ["chefe", null],
    ["", null],
  ])("%j is %s", (value, role) => {
    expect(parseImportRole(value)).toBe(role);
  });

  it("compares names without case, accents or spaces at the ends", () => {
    expect(importKey("  Serviços GERAIS ")).toBe(importKey("servicos gerais"));
  });
});

describe("classifyImportRows (4.3 item 2)", () => {
  const facts: ImportFacts = {
    existingEmails: new Set(["ja@x.test"]),
    activeSectors: [{ id: SECTOR, name: "Central de Serviços" }],
  };
  let line = 1;
  const row = (values: Partial<ImportRow["values"]>, fieldCountMismatch = false): ImportRow => {
    line += 1;
    return { line, fieldCountMismatch, values: { nome: "Ana Souza", email: "ana@x.test", perfil: "solicitante", setor: "", ...values } };
  };

  it("creates valid people, with the sector found by name and the e-mail in lower case", () => {
    const outcomes = classifyImportRows(
      [row({ email: "ANA@X.test" }), row({ nome: "Diego", email: "diego@x.test", perfil: "Atendente", setor: "central de servicos" })],
      facts,
    );
    expect(outcomes.map((outcome) => (outcome.outcome === "create" ? outcome.person : outcome))).toEqual([
      { name: "Ana Souza", email: "ana@x.test", role: "REQUESTER", sectorId: null },
      { name: "Diego", email: "diego@x.test", role: "ATTENDANT", sectorId: SECTOR },
    ]);
  });

  it("skips an e-mail already in use", () => {
    expect(classifyImportRows([row({ email: "JA@x.test" })], facts)[0]).toMatchObject({ outcome: "skip", reason: "email_exists" });
  });

  it("lists every error of a line", () => {
    expect(classifyImportRows([row({ nome: "", email: "não-é-email", perfil: "chefe", setor: "Central de Serviços" }, true)], facts)[0]).toMatchObject({
      outcome: "error",
      // With an unknown role the sector is only looked up, and this one exists.
      errors: ["field_count", "name_missing", "email_invalid", "role_invalid"],
    });
  });

  it.each([
    ["a name of 121 characters", { nome: "n".repeat(121) }, ["name_too_long"]],
    ["an attendant without a sector", { perfil: "atendente" }, ["sector_required"]],
    ["a manager of an unknown sector", { perfil: "gestor", setor: "Arquivo" }, ["sector_unknown"]],
    ["a requester with a sector", { setor: "Central de Serviços" }, ["sector_not_allowed"]],
    ["an administrator with a sector", { perfil: "administrador", setor: "Central de Serviços" }, ["sector_not_allowed"]],
  ])("refuses %s", (_label, values, errors) => {
    expect(classifyImportRows([row(values)], facts)[0]).toMatchObject({ outcome: "error", errors });
  });

  it("accepts a name of exactly 120 characters, and a formula-looking name as text", () => {
    const outcomes = classifyImportRows([row({ nome: "n".repeat(120) }), row({ nome: "=SOMA(A1)", email: "f@x.test" })], facts);
    expect(outcomes.map(({ outcome }) => outcome)).toEqual(["create", "create"]);
  });

  it("an e-mail repeated in the file is valid the first time and an error after, even if the first one has other errors", () => {
    const outcomes = classifyImportRows([row({ email: "rep@x.test" }), row({ email: "REP@x.test" }), row({ email: "dup@x.test", perfil: "chefe" }), row({ email: "dup@x.test" })], facts);
    expect(outcomes.map((outcome) => (outcome.outcome === "error" ? outcome.errors : outcome.outcome))).toEqual([
      "create",
      ["email_repeated"],
      ["role_invalid"],
      ["email_repeated"],
    ]);
    expect(summarizeImport(outcomes)).toEqual({ create: 1, skip: 0, error: 3 });
  });

  it("an existing e-mail repeated in the file is skipped once and an error after", () => {
    const outcomes = classifyImportRows([row({ email: "ja@x.test" }), row({ email: "ja@x.test" })], facts);
    expect(outcomes.map(({ outcome }) => outcome)).toEqual(["skip", "error"]);
  });
});
