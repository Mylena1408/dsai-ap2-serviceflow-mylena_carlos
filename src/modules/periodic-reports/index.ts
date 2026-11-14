import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import * as metrics from "./application/report-metrics";
import { createPrismaReportCountsReader } from "./infrastructure/prisma-report-counts";
import type { ReportPeriod } from "./domain/periodic-report";

// Periodic reports (SPEC 2026-11-09-comunicacao-e-calendarios, part C): the periods, the numbers and who reads them
// (SF-246) and the numbers of a period (SF-247). The job (SF-248), the page (SF-249), the notice (SF-250) and the
// activation (SF-251) come next.
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
