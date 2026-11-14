import { beforeEach, describe, expect, it, vi } from "vitest";

const authorization = vi.hoisted(() => ({ requireConfigurationAdministrator: vi.fn() }));
vi.mock("@/server/authorization", () => authorization);

import { IMPORT_HISTORY_SIZE, exportUserImportReport, listUserImports, type UserImportHistoryReader } from "@/modules/user-import/application/import-history";
import { buildImportReportCsv, importReportFileName, reportReasons } from "@/modules/user-import";
import { csvField } from "@/modules/reports";
import { AuthorizationError, NotFoundError, ValidationError } from "@/server/errors";

// SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 4 (SF-244; CA-IMP-03 for the history and the error report).

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);

const REPORT = [
  { line: 4, outcome: "skip" as const, reasons: ["email_exists" as const], role: "solicitante", sector: "" },
  { line: 5, outcome: "error" as const, reasons: ["role_invalid" as const, "sector_unknown" as const], role: "=chefe()", sector: "TI; Rede" },
];

function reader(found: { createdAt: Date; report: typeof REPORT } | null = { createdAt: new Date("2026-11-14T18:30:00.000Z"), report: REPORT }) {
  return {
    list: vi.fn(async () => []),
    report: vi.fn(async () => found),
  } satisfies UserImportHistoryReader;
}

beforeEach(() => {
  vi.clearAllMocks();
  authorization.requireConfigurationAdministrator.mockResolvedValue({ id: "admin-1", role: "ADMIN", sectorId: null, isActive: true });
});

describe("the error report in CSV", () => {
  it("has the fixed columns, one row per line left out, with the reasons by their texts", () => {
    expect(buildImportReportCsv(REPORT, csvField)).toBe(
      BOM +
        ["Linha;Resultado;Motivos;Perfil;Setor", "4;Ignorada;e-mail já existe;solicitante;", "5;Com erro;perfil desconhecido, setor não encontrado entre os ativos;'=chefe();\"TI; Rede\""].join(CRLF) +
        CRLF,
    );
  });

  it("is only the header for an import without lines left out", () => {
    expect(buildImportReportCsv([], csvField)).toBe(`${BOM}Linha;Resultado;Motivos;Perfil;Setor${CRLF}`);
  });

  it("names the reasons and the file by the import's moment in the organization's time zone", () => {
    expect(reportReasons({ reasons: ["email_repeated", "name_missing"] })).toBe("e-mail repetido no arquivo, nome vazio");
    expect(importReportFileName(new Date("2026-11-14T18:30:00.000Z"))).toBe("serviceflow-importacao-2026-11-14-1530.csv");
  });
});

describe("the history and the export", () => {
  it("lists the 50 most recent for the administrator", async () => {
    const source = reader();
    await listUserImports(source);
    expect(source.list).toHaveBeenCalledWith(IMPORT_HISTORY_SIZE);
    expect(IMPORT_HISTORY_SIZE).toBe(50);
  });

  it("exports the report of an import", async () => {
    const csv = await exportUserImportReport(ID, reader(), csvField);
    expect(csv.fileName).toBe("serviceflow-importacao-2026-11-14-1530.csv");
    expect(csv.content).toContain("5;Com erro;");
  });

  it("refuses a missing import, an invalid id and anyone but the administrator", async () => {
    await expect(exportUserImportReport(ID, reader(null), csvField)).rejects.toThrow(NotFoundError);
    const source = reader();
    await expect(exportUserImportReport("x", source, csvField)).rejects.toThrow(ValidationError);
    expect(source.report).not.toHaveBeenCalled();
    authorization.requireConfigurationAdministrator.mockRejectedValue(new AuthorizationError());
    await expect(listUserImports(source)).rejects.toThrow(AuthorizationError);
    await expect(exportUserImportReport(ID, source, csvField)).rejects.toThrow(AuthorizationError);
    expect(source.list).not.toHaveBeenCalled();
  });
});
