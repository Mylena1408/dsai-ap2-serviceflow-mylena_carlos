// Importing people from a CSV file (SPEC 2026-11-09-comunicacao-e-calendarios, part B): the format and the rules
// (SF-241). The preview (SF-242), the application (SF-243) and the history (SF-244) come next.
export { detectSeparator, parseCsv } from "./domain/csv";
export type { CsvError, CsvRecord, CsvResult } from "./domain/csv";
export {
  IMPORT_COLUMNS,
  IMPORT_FILE_ERROR_LABELS,
  IMPORT_LINE_ERROR_LABELS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_NAME_LENGTH,
  MAX_IMPORT_ROWS,
  classifyImportRows,
  decodeImportFile,
  importKey,
  parseImportRole,
  readImportFile,
  summarizeImport,
} from "./domain/user-import";
export type {
  ImportColumn,
  ImportFacts,
  ImportFileError,
  ImportFileResult,
  ImportLineError,
  ImportLineOutcome,
  ImportPerson,
  ImportRole,
  ImportRow,
  ImportSummary,
} from "./domain/user-import";
