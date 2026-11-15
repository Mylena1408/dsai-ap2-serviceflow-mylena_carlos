import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import * as metrics from "./application/report-metrics";
import { createPrismaReportCountsReader } from "./infrastructure/prisma-report-counts";
import * as generation from "./application/generate-reports";
import { createPrismaReportGenerationStore, type ReportWrittenHook } from "./infrastructure/prisma-report-generation";
import * as reading from "./application/read-reports";
import { createPrismaPeriodicReportReader } from "./infrastructure/prisma-report-reader";
import * as settings from "./application/report-settings";
import { createPrismaReportSettingsReader, createPrismaReportSettingsStore } from "./infrastructure/prisma-report-settings";
import type { ReportPeriod } from "./domain/periodic-report";

// Periodic reports (SPEC 2026-11-09-comunicacao-e-calendarios, part C): the periods, the numbers and who reads them
// (SF-246), the numbers of a period (SF-247), the job's generation (SF-248), the page (SF-249), the notice written
// with each report (SF-250, by a hook the job gives) and the administrator's activation (SF-251).
export {
  MAX_REPORT_TAGS,
  PERIODIC_REPORT_KINDS,
  PERIODIC_REPORT_KIND_LABELS,
  buildReportMetrics,
  canReadReport,
  latestCompletePeriod,
  periodLabel,
  periodicReportMetricsSchema,
  reportScopes,
} from "./domain/periodic-report";
export type { PeriodicReportCounts, PeriodicReportKind, PeriodicReportMetrics, ReportPeriod, ReportViewer } from "./domain/periodic-report";
export { reportRange } from "./application/report-metrics";
export type { ReportRange } from "./application/report-metrics";

/** The numbers of a period for a sector, or the organization when `sectorId` is null (5.1 item 1; SF-247). */
export function computeReportMetrics(sectorId: string | null, period: ReportPeriod, database: PrismaClient = prisma) {
  return metrics.computeReportMetrics(sectorId, period, createPrismaReportCountsReader(database));
}

export type { PeriodicReportGenerationSummary } from "./application/generate-reports";

export type { ReportWrittenHook } from "./infrastructure/prisma-report-generation";

/**
 * The daily job's step (5.1 item 2; SF-248): the most recent complete period of each kind on. `onWritten` writes the
 * notices of each new report in its transaction (5.1 item 4; SF-250).
 */
export function generatePeriodicReports(
  options: { onWritten?: ReportWrittenHook } = {},
  database: PrismaClient = prisma,
): Promise<generation.PeriodicReportGenerationSummary> {
  return generation.generatePeriodicReports(createPrismaReportGenerationStore(database, options.onWritten));
}

export { LATEST_REPORTS, REPORT_LIST_SIZE } from "./application/read-reports";
export type { PeriodicReportDetail, PeriodicReportList, PeriodicReportSummary, ReportScopeFilter } from "./application/read-reports";

/** The page "Relatórios" (5.1 item 3; SF-249): the reports of the reader's scope. */
export function listPeriodicReports(raw: { scope?: string } = {}, database: PrismaClient = prisma): Promise<reading.PeriodicReportList> {
  return reading.listPeriodicReports(raw, createPrismaPeriodicReportReader(database));
}

export function getPeriodicReport(reportId: unknown, database: PrismaClient = prisma): Promise<reading.PeriodicReportDetail> {
  return reading.getPeriodicReport(reportId, createPrismaPeriodicReportReader(database));
}

/** The block of "Análises" (7 item 3; SF-259): the latest reports of the scope shown. */
export function latestPeriodicReports(raw: { sectorId?: string | null } = {}, database: PrismaClient = prisma): Promise<reading.PeriodicReportSummary[]> {
  return reading.latestPeriodicReports(raw, createPrismaPeriodicReportReader(database));
}

/** The manager's link only with a report of their sector (CA-REL-01). */
export function hasPeriodicReports(database: PrismaClient = prisma): Promise<boolean> {
  return reading.hasPeriodicReports(createPrismaPeriodicReportReader(database));
}

export type { PeriodicReportSettings } from "./application/report-settings";

/** The administrator's activation (5.3 item 3; SF-251): whether each kind is on. */
export function getPeriodicReportSettings(database: PrismaClient = prisma): Promise<settings.PeriodicReportSettings> {
  return settings.getPeriodicReportSettings(createPrismaReportSettingsReader(database));
}

/** Turns a kind on or off, in the audit trail; `{ kind, enabled: "true" | "false" }`. */
export function setPeriodicReportEnabled(input: unknown, database: PrismaClient = prisma): Promise<{ changed: boolean }> {
  return settings.setPeriodicReportEnabled(input, createPrismaReportSettingsStore(database));
}
