// Periodic reports (SPEC 2026-11-09-comunicacao-e-calendarios, part C): the periods, the numbers and who reads them
// (SF-246). The numbers of a period (SF-247), the job (SF-248), the page (SF-249), the notice (SF-250) and the
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
