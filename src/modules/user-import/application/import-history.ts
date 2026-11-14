import { requireConfigurationAdministrator } from "@/server/authorization";
import { NotFoundError } from "@/server/errors";
import { validateInput } from "@/server/validation";
import { entityIdSchema } from "@/shared/validation";
import { buildImportReportCsv, importReportFileName } from "../domain/report-csv";
import type { ImportReportEntry } from "../domain/user-import";

// The history of the imports and the error report (SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 4; SF-244):
// only the administrator; the 50 most recent imports; each one's report in CSV.

export const IMPORT_HISTORY_SIZE = 50;

export interface UserImportHistoryItem {
  id: string;
  createdAt: Date;
  actorName: string;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
}

export interface UserImportHistoryReader {
  /** The most recent first. */
  list(limit: number): Promise<UserImportHistoryItem[]>;
  report(importId: string): Promise<{ createdAt: Date; report: ImportReportEntry[] } | null>;
}

export async function listUserImports(reader: UserImportHistoryReader): Promise<UserImportHistoryItem[]> {
  await requireConfigurationAdministrator();
  return reader.list(IMPORT_HISTORY_SIZE);
}

export async function exportUserImportReport(
  importId: unknown,
  reader: UserImportHistoryReader,
  field: (value: string) => string,
): Promise<{ content: string; fileName: string }> {
  await requireConfigurationAdministrator();
  const id = validateInput(entityIdSchema, importId);
  const found = await reader.report(id);
  if (!found) throw new NotFoundError();
  return { content: buildImportReportCsv(found.report, field), fileName: importReportFileName(found.createdAt) };
}
