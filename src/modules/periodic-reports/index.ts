import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import * as metrics from "./application/report-metrics";
import { createPrismaReportCountsReader } from "./infrastructure/prisma-report-counts";
import * as generation from "./application/generate-reports";
import { createPrismaReportGenerationStore } from "./infrastructure/prisma-report-generation";
import type { ReportPeriod } from "./domain/periodic-report";

// Periodic reports (SPEC 2026-11-09-comunicacao-e-calendarios, part C): the periods, the numbers and who reads them
// (SF-246), the numbers of a period (SF-247) and the job's generation (SF-248). The page (SF-249), the notice (SF-250)
// and the activation (SF-251) come next.
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

/** The daily job's step (5.1 item 2; SF-248): the most recent complete period of each kind on. */
export function generatePeriodicReports(database: PrismaClient = prisma): Promise<generation.PeriodicReportGenerationSummary> {
  return generation.generatePeriodicReports(createPrismaReportGenerationStore(database));
}
