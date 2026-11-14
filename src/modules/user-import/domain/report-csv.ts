import { zonedDateTimeOf } from "@/shared/time";
import { IMPORT_LINE_ERROR_LABELS, type ImportReportEntry } from "./user-import";

// The error report of an import in CSV (SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 4; SF-244): fixed
// columns, one row per line of the file left out, never a name or an e-mail; written as the system's other CSVs.

export const IMPORT_REPORT_COLUMNS = ["Linha", "Resultado", "Motivos", "Perfil", "Setor"] as const;

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const LINE_END = String.fromCharCode(13, 10);

export const IMPORT_OUTCOME_LABELS: Record<ImportReportEntry["outcome"], string> = { skip: "Ignorada", error: "Com erro" };

/** The reasons of a line, by their texts. */
export function reportReasons(entry: Pick<ImportReportEntry, "reasons">): string {
  return entry.reasons.map((reason) => (reason === "email_exists" ? "e-mail já existe" : IMPORT_LINE_ERROR_LABELS[reason])).join(", ");
}

/** `field` is the system's CSV field (a formula-looking value gets an apostrophe; separators are quoted). */
export function buildImportReportCsv(entries: readonly ImportReportEntry[], field: (value: string) => string): string {
  const rows = [
    IMPORT_REPORT_COLUMNS.map(field).join(";"),
    ...entries.map((entry) => [String(entry.line), IMPORT_OUTCOME_LABELS[entry.outcome], reportReasons(entry), entry.role, entry.sector].map(field).join(";")),
  ];
  return BYTE_ORDER_MARK + rows.join(LINE_END) + LINE_END;
}

/** "serviceflow-importacao-2026-11-14-1530.csv", by the import's moment in the organization's time zone. */
export function importReportFileName(createdAt: Date): string {
  const [day, time] = zonedDateTimeOf(createdAt).split(" ");
  return `serviceflow-importacao-${day}-${time!.replace(":", "")}.csv`;
}

/**
 * The model of the file (4.1 item 1; SF-245): the header and two examples. The attendant's sector does not exist, so a
 * model imported without changes shows how an error looks, and that line is never created.
 */
export const IMPORT_MODEL_FILE_NAME = "serviceflow-modelo-importacao-usuarios.csv";

export function buildImportModelCsv(field: (value: string) => string): string {
  const rows = [
    ["nome", "email", "perfil", "setor"],
    ["Maria Exemplo", "maria.exemplo@exemplo.test", "solicitante", ""],
    ["João Exemplo", "joao.exemplo@exemplo.test", "atendente", "Nome de um setor ativo"],
  ];
  return BYTE_ORDER_MARK + rows.map((row) => row.map(field).join(";")).join(LINE_END) + LINE_END;
}
