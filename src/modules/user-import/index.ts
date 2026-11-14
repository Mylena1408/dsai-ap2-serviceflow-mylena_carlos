import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import * as preview from "./application/preview-import";
import { createPrismaUserImportReader } from "./infrastructure/prisma-user-import";

// Importing people from a CSV file (SPEC 2026-11-09-comunicacao-e-calendarios, part B): the format and the rules
// (SF-241) and the preview (SF-242). The application (SF-243) and the history (SF-244) come next.
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
