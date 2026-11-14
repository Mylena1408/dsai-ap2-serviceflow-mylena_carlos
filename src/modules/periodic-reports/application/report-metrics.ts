import { addDays, startOfZonedDay } from "@/shared/time";
import { buildReportMetrics, type PeriodicReportCounts, type PeriodicReportMetrics, type ReportPeriod } from "../domain/periodic-report";

// The numbers of a period (SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 1 and 5.3 item 2; SF-247): counted by
// the database with the definitions of "Análises" and the dashboard, then kept as they are at that moment.

/** The instants of a period: from the first day's midnight to the midnight after the last day, in the organization's zone. */
export interface ReportRange extends ReportPeriod {
  from: Date;
  before: Date;
}

export interface PeriodicReportCountsReader {
  /** For a sector, or for the organization when `sectorId` is null. */
  counts(sectorId: string | null, range: ReportRange): Promise<PeriodicReportCounts>;
}

export function reportRange(period: ReportPeriod): ReportRange {
  return { ...period, from: startOfZonedDay(period.firstDay), before: startOfZonedDay(addDays(period.lastDay, 1)) };
}

export async function computeReportMetrics(sectorId: string | null, period: ReportPeriod, reader: PeriodicReportCountsReader): Promise<PeriodicReportMetrics> {
  return buildReportMetrics(await reader.counts(sectorId, reportRange(period)));
}
