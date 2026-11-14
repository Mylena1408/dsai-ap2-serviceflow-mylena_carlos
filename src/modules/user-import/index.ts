import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import * as preview from "./application/preview-import";
import { createPrismaUserImportReader } from "./infrastructure/prisma-user-import";
import * as apply from "./application/apply-import";
import { createPrismaUserImportStore } from "./infrastructure/prisma-user-import-store";
import { csvField } from "@/modules/reports";
import * as history from "./application/import-history";
import { createPrismaUserImportHistoryReader } from "./infrastructure/prisma-user-import-history";

// Importing people from a CSV file (SPEC 2026-11-09-comunicacao-e-calendarios, part B): the format and the rules
// (SF-241), the preview (SF-242), the application (SF-243) and the history with the error report (SF-244).
export { detectSeparator, parseCsv } from "./domain/csv";
export type { CsvError, CsvRecord, CsvResult } from "./domain/csv";
export {
  IMPORTED_PASSWORD_HASH,
  IMPORT_COLUMNS,
  IMPORT_FILE_ERROR_LABELS,
  IMPORT_LINE_ERROR_LABELS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_NAME_LENGTH,
  MAX_IMPORT_ROWS,
  classifyImportRows,
  decodeImportFile,
  importKey,
  importReport,
  normalizeImportText,
  parseImportRole,
  readImportFile,
  readImportText,
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
  ImportReportEntry,
  ImportRole,
  ImportRow,
  ImportSummary,
} from "./domain/user-import";
export { importDigest } from "./application/preview-import";
export type { UserImportPreview } from "./application/preview-import";

/** The preview of an import (4.1 item 2; SF-242): nothing is written. */
export function previewUserImport(file: Uint8Array, database: PrismaClient = prisma): Promise<preview.UserImportPreview> {
  return preview.previewUserImport(file, createPrismaUserImportReader(database));
}

export type { UserImportConfirmation, UserImportResult } from "./application/apply-import";

/** Applying a previewed import (4.1 item 3; SF-243): inactive people without a usable password, audited. */
export function applyUserImport(confirmation: apply.UserImportConfirmation, database: PrismaClient = prisma): Promise<apply.UserImportResult> {
  return apply.applyUserImport(confirmation, createPrismaUserImportStore(database));
}

export { IMPORT_OUTCOME_LABELS, IMPORT_REPORT_COLUMNS, buildImportReportCsv, importReportFileName, reportReasons } from "./domain/report-csv";
export { IMPORT_HISTORY_SIZE } from "./application/import-history";
export type { UserImportHistoryItem } from "./application/import-history";

/** The 50 most recent imports (4.1 item 4; SF-244). */
export function listUserImports(database: PrismaClient = prisma): Promise<history.UserImportHistoryItem[]> {
  return history.listUserImports(createPrismaUserImportHistoryReader(database));
}

/** The error report of an import, in CSV (4.1 item 4; SF-244). */
export function exportUserImportReport(importId: unknown, database: PrismaClient = prisma): Promise<{ content: string; fileName: string }> {
  return history.exportUserImportReport(importId, createPrismaUserImportHistoryReader(database), csvField);
}
