import { beforeEach, describe, expect, it, vi } from "vitest";

const authorization = vi.hoisted(() => ({ requireConfigurationAdministrator: vi.fn() }));
vi.mock("@/server/authorization", () => authorization);

import { importDigest, previewUserImport, type UserImportReader } from "@/modules/user-import/application/preview-import";
import { MAX_IMPORT_BYTES, normalizeImportText, readImportText } from "@/modules/user-import";
import { AuthorizationError } from "@/server/errors";

// SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 2 and 4.3 (SF-242; CA-IMP-02): the preview, without writing.

const SECTOR = "11111111-1111-4111-8111-111111111111";
const bytes = (text: string) => new TextEncoder().encode(text);
const CR = String.fromCharCode(13);

function reader(existing: string[] = []): UserImportReader & { [key: string]: ReturnType<typeof vi.fn> } {
  return {
    existingEmails: vi.fn(async (emails: readonly string[]) => existing.filter((email) => emails.includes(email.toLowerCase()))),
    activeSectors: vi.fn(async () => [{ id: SECTOR, name: "Central" }]),
  };
}

const FILE = ["nome;email;perfil;setor", "Ana;ana@x.test;solicitante;", "Bia;JA@x.test;atendente;Central", "Caio;caio;gestor;"].join("\n");

beforeEach(() => {
  vi.clearAllMocks();
  authorization.requireConfigurationAdministrator.mockResolvedValue({ id: "admin-1", role: "ADMIN", sectorId: null, isActive: true });
});

describe("previewUserImport", () => {
  it("gives each line its outcome against the database, with the totals, the text and its digest", async () => {
    const source = reader(["Ja@x.test"]);
    const preview = await previewUserImport(bytes(FILE), source);
    expect(source.existingEmails).toHaveBeenCalledWith(["ana@x.test", "ja@x.test", "caio"]);
    expect(preview).toMatchObject({ ok: true, content: FILE, digest: importDigest(FILE), summary: { create: 1, skip: 1, error: 1 } });
    expect(preview.ok && preview.lines.map((line) => [line.line, line.outcome])).toEqual([
      [2, "create"],
      [3, "skip"],
      [4, "error"],
    ]);
    expect(preview.ok && preview.lines[2]).toMatchObject({ errors: ["email_invalid", "sector_required"], values: { nome: "Caio" } });
  });

  it("keeps the text with LF line breaks, so the form sends back the same digest", async () => {
    const withCrlf = FILE.split("\n").join(CR + "\n");
    const preview = await previewUserImport(bytes(withCrlf), reader());
    expect(preview).toMatchObject({ ok: true, content: FILE, digest: importDigest(FILE) });
    expect(normalizeImportText(`a${CR}b${CR}\nc`)).toBe("a\nb\nc");
  });

  it("refuses a whole file with its reason and line, without asking the database", async () => {
    const source = reader();
    expect(await previewUserImport(bytes("nome;email;perfil;setor;senha\nAna;a@x.test;gestor;Central;123"), source)).toEqual({
      ok: false,
      error: "unknown_column",
      line: 1,
    });
    expect(await previewUserImport(Uint8Array.of(0x6e, 0xe9), source)).toEqual({ ok: false, error: "not_utf8" });
    expect(await previewUserImport(new Uint8Array(MAX_IMPORT_BYTES + 1), source)).toEqual({ ok: false, error: "too_big" });
    expect(source.existingEmails).not.toHaveBeenCalled();
    expect(source.activeSectors).not.toHaveBeenCalled();
  });

  it("does not ask for e-mails when no line has one", async () => {
    const source = reader();
    const preview = await previewUserImport(bytes("nome;email;perfil;setor\nAna;;solicitante;"), source);
    expect(source.existingEmails).not.toHaveBeenCalled();
    expect(preview).toMatchObject({ ok: true, summary: { create: 0, skip: 0, error: 1 } });
  });

  it("refuses anyone but the administrator before reading", async () => {
    authorization.requireConfigurationAdministrator.mockRejectedValue(new AuthorizationError());
    const source = reader();
    await expect(previewUserImport(bytes(FILE), source)).rejects.toThrow(AuthorizationError);
    expect(source.activeSectors).not.toHaveBeenCalled();
  });
});

describe("readImportText", () => {
  it("applies the same 200 KB limit to a text sent back by the form", () => {
    expect(readImportText("x".repeat(MAX_IMPORT_BYTES + 1))).toEqual({ ok: false, error: "too_big" });
  });
});
