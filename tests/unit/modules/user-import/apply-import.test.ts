import { beforeEach, describe, expect, it, vi } from "vitest";

const authorization = vi.hoisted(() => ({ requireConfigurationAdministrator: vi.fn() }));
vi.mock("@/server/authorization", () => authorization);

import { applyUserImport, type UserImportTransaction } from "@/modules/user-import/application/apply-import";
import { importDigest } from "@/modules/user-import/application/preview-import";
import { IMPORTED_PASSWORD_HASH, importReport } from "@/modules/user-import";
import { AuthorizationError, ConflictError } from "@/server/errors";

// SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 3 and 4.3 items 3 and 4 (SF-243; decision K1; CA-IMP-03).

const SECTOR = "11111111-1111-4111-8111-111111111111";
const admin = { id: "admin-1", role: "ADMIN", sectorId: null, isActive: true };
const CR = String.fromCharCode(13);

const FILE = [
  "nome;email;perfil;setor",
  "Ana Nova;ana@x.test;solicitante;",
  "Diego;diego@x.test;atendente;Central",
  "Já Existe;ja@x.test;solicitante;",
  "Sem Setor;sem@x.test;gestor;",
].join("\n");

function transaction(existing: string[] = []) {
  const calls: string[] = [];
  let next = 0;
  const value = {
    audited: vi.fn(async (meta: { action: string; entityType: string }, change: () => Promise<{ id: string }>) => {
      calls.push(`${meta.action}:${meta.entityType}`);
      return change();
    }),
    existingEmails: vi.fn(async (emails: readonly string[]) => existing.filter((email) => emails.includes(email))),
    activeSectors: vi.fn(async () => [{ id: SECTOR, name: "Central" }]),
    createUser: vi.fn<(person: unknown) => Promise<{ id: string }>>(async () => ({ id: `user-${(next += 1)}` })),
    recordImport: vi.fn(async () => ({ id: "import-1" })),
  };
  return { value: value as unknown as UserImportTransaction & typeof value, calls };
}

const storeOf = (tx: UserImportTransaction) => ({ run: <T>(work: (t: UserImportTransaction) => Promise<T>) => work(tx) });

beforeEach(() => {
  vi.clearAllMocks();
  authorization.requireConfigurationAdministrator.mockResolvedValue(admin);
});

describe("applyUserImport", () => {
  it("creates each valid line inactive with the unusable password, audited, then records and audits the import", async () => {
    const { value, calls } = transaction(["ja@x.test"]);
    const result = await applyUserImport({ content: FILE, digest: importDigest(FILE) }, storeOf(value));

    expect(value.createUser.mock.calls.map(([person]) => person)).toEqual([
      { name: "Ana Nova", email: "ana@x.test", role: "REQUESTER", sectorId: null, passwordHash: IMPORTED_PASSWORD_HASH, isActive: false },
      { name: "Diego", email: "diego@x.test", role: "ATTENDANT", sectorId: SECTOR, passwordHash: IMPORTED_PASSWORD_HASH, isActive: false },
    ]);
    expect(calls).toEqual(["CREATED:USER", "CREATED:USER", "IMPORTED:USER_IMPORT"]);
    expect(value.recordImport).toHaveBeenCalledWith({
      actorId: admin.id,
      createdCount: 2,
      skippedCount: 1,
      errorCount: 1,
      report: [
        { line: 4, outcome: "skip", reasons: ["email_exists"], role: "solicitante", sector: "" },
        { line: 5, outcome: "error", reasons: ["sector_required"], role: "gestor", sector: "" },
      ],
    });
    expect(result).toMatchObject({ importId: "import-1", summary: { create: 2, skip: 1, error: 1 } });
  });

  it("accepts the text sent back by a form with CRLF line breaks", async () => {
    const { value } = transaction();
    await applyUserImport({ content: FILE.split("\n").join(CR + "\n"), digest: importDigest(FILE) }, storeOf(value));
    expect(value.createUser).toHaveBeenCalledTimes(3);
  });

  it("refuses a text that is not the previewed one, before the transaction", async () => {
    const { value } = transaction();
    await expect(applyUserImport({ content: `${FILE}\nOutra;o@x.test;solicitante;`, digest: importDigest(FILE) }, storeOf(value))).rejects.toThrow(
      ConflictError,
    );
    expect(value.existingEmails).not.toHaveBeenCalled();
  });

  it("records an import with no line created", async () => {
    const content = "nome;email;perfil;setor\nJá Existe;ja@x.test;solicitante;";
    const { value, calls } = transaction(["ja@x.test"]);
    const result = await applyUserImport({ content, digest: importDigest(content) }, storeOf(value));
    expect(value.createUser).not.toHaveBeenCalled();
    expect(calls).toEqual(["IMPORTED:USER_IMPORT"]);
    expect(result.summary).toEqual({ create: 0, skip: 1, error: 0 });
  });

  it("refuses anyone but the administrator", async () => {
    authorization.requireConfigurationAdministrator.mockRejectedValue(new AuthorizationError());
    const { value } = transaction();
    await expect(applyUserImport({ content: FILE, digest: importDigest(FILE) }, storeOf(value))).rejects.toThrow(AuthorizationError);
    expect(value.createUser).not.toHaveBeenCalled();
  });
});

describe("importReport", () => {
  it("never keeps a name or an e-mail", () => {
    const report = importReport([
      { line: 2, values: { nome: "Ana", email: "ana@x.test", perfil: "solicitante", setor: "" }, outcome: "create", person: { name: "Ana", email: "ana@x.test", role: "REQUESTER", sectorId: null } },
      { line: 3, values: { nome: "Bia", email: "bia@x.test", perfil: "chefe", setor: "TI" }, outcome: "error", errors: ["role_invalid"] },
    ]);
    expect(report).toEqual([{ line: 3, outcome: "error", reasons: ["role_invalid"], role: "chefe", sector: "TI" }]);
    expect(JSON.stringify(report)).not.toMatch(/Bia|bia@x\.test/);
  });
});
