import {
  PERIODIC_REPORT_KINDS,
  latestCompletePeriod,
  reportScopes,
  type PeriodicReportKind,
  type PeriodicReportMetrics,
  type ReportPeriod,
} from "../domain/periodic-report";
import { computeReportMetrics, type PeriodicReportCountsReader } from "./report-metrics";

// Generating the periodic reports in the daily job (SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 2 and 5.3
// items 1 to 3; SF-248): for each kind on, the most recent complete period, for the organization and each active
// sector that does not have it yet, with the numbers of that moment. A report written meanwhile by another run is
// left as it is.

export interface PeriodicReportGenerationStore extends PeriodicReportCountsReader {
  /** The organization's calendar day of the database's instant. */
  today(): Promise<string>;
  enabledKinds(): Promise<PeriodicReportKind[]>;
  activeSectorIds(): Promise<string[]>;
  /** The scopes (null for the organization) that already have the report of this kind and period. */
  existingScopes(kind: PeriodicReportKind, period: ReportPeriod): Promise<Array<string | null>>;
  /** Writes the report unless the same one exists; true when written. */
  insert(report: { kind: PeriodicReportKind; period: ReportPeriod; sectorId: string | null; metrics: PeriodicReportMetrics }): Promise<boolean>;
}

export interface PeriodicReportGenerationSummary {
  /** The kinds on and their period. */
  periods: Array<{ kind: PeriodicReportKind } & ReportPeriod>;
  generated: number;
  /** Already there before, or written by another run meanwhile. */
  alreadyThere: number;
}

export async function generatePeriodicReports(store: PeriodicReportGenerationStore): Promise<PeriodicReportGenerationSummary> {
  const enabled = new Set(await store.enabledKinds());
  const summary: PeriodicReportGenerationSummary = { periods: [], generated: 0, alreadyThere: 0 };
  // 5.3 item 3: nothing on, nothing read or written.
  if (enabled.size === 0) return summary;

  const [today, sectorIds] = await Promise.all([store.today(), store.activeSectorIds()]);
  for (const kind of PERIODIC_REPORT_KINDS.filter((item) => enabled.has(item))) {
    const period = latestCompletePeriod(kind, today);
    summary.periods.push({ kind, ...period });
    const existing = new Set(await store.existingScopes(kind, period));
    for (const sectorId of reportScopes(sectorIds)) {
      if (existing.has(sectorId)) {
        summary.alreadyThere += 1;
        continue;
      }
      const metrics = await computeReportMetrics(sectorId, period, store);
      if (await store.insert({ kind, period, sectorId, metrics })) summary.generated += 1;
      else summary.alreadyThere += 1;
    }
  }
  return summary;
}
