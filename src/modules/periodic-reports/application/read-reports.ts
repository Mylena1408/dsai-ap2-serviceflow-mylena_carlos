import { requireCurrentActor } from "@/server/authorization";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { validateInput } from "@/server/validation";
import { entityIdSchema } from "@/shared/validation";
import {
  canReadReport,
  periodicReportMetricsSchema,
  type PeriodicReportKind,
  type PeriodicReportMetrics,
  type ReportPeriod,
  type ReportViewer,
} from "../domain/periodic-report";

// Reading the periodic reports (SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 3; SF-249): the administrator reads
// every report and the organization's, with a scope filter; a manager, their sector's; nobody else has the page. A
// report of another scope, or one that does not exist, is "not found".

export const REPORT_LIST_SIZE = 100;

export interface PeriodicReportSummary extends ReportPeriod {
  id: string;
  kind: PeriodicReportKind;
  sectorId: string | null;
  /** Null for the organization's report. */
  sectorName: string | null;
  generatedAt: Date;
}

export interface PeriodicReportDetail extends PeriodicReportSummary {
  metrics: PeriodicReportMetrics;
}

/** "all", the organization's ("organization") or one sector's (its id). */
export type ReportScopeFilter = "all" | "organization" | string;

export interface PeriodicReportReader {
  list(filter: { sectorId: string | null | undefined }, limit: number): Promise<PeriodicReportSummary[]>;
  find(reportId: string): Promise<(PeriodicReportSummary & { metrics: unknown }) | null>;
  /** Every sector, active or not (a report outlives a deactivation), for the administrator's filter. */
  sectors(): Promise<Array<{ id: string; name: string }>>;
}

export interface PeriodicReportList {
  audience: "organization" | "sector";
  reports: PeriodicReportSummary[];
  /** The administrator's filter and the sectors to choose from; empty for a manager. */
  scope: ReportScopeFilter;
  sectors: Array<{ id: string; name: string }>;
}

function viewerOf(actor: { role: ReportViewer["role"]; sectorId: string | null }): ReportViewer {
  if (actor.role !== "ADMIN" && actor.role !== "MANAGER") throw new AuthorizationError();
  if (actor.role === "MANAGER" && !actor.sectorId) throw new AuthorizationError();
  return { role: actor.role, sectorId: actor.sectorId };
}

export async function listPeriodicReports(raw: { scope?: string }, reader: PeriodicReportReader): Promise<PeriodicReportList> {
  const viewer = viewerOf(await requireCurrentActor());
  if (viewer.role === "MANAGER") {
    return { audience: "sector", reports: await reader.list({ sectorId: viewer.sectorId }, REPORT_LIST_SIZE), scope: viewer.sectorId!, sectors: [] };
  }
  const sectors = await reader.sectors();
  const requested = raw.scope ?? "all";
  // An unknown sector shows every report, as the other screens' filters do.
  const scope: ReportScopeFilter = requested === "organization" || sectors.some(({ id }) => id === requested) ? requested : "all";
  const sectorId = scope === "all" ? undefined : scope === "organization" ? null : scope;
  return { audience: "organization", reports: await reader.list({ sectorId }, REPORT_LIST_SIZE), scope, sectors };
}

export async function getPeriodicReport(reportId: unknown, reader: PeriodicReportReader): Promise<PeriodicReportDetail> {
  const viewer = viewerOf(await requireCurrentActor());
  const id = validateInput(entityIdSchema, reportId);
  const found = await reader.find(id);
  if (!found || !canReadReport(viewer, found)) throw new NotFoundError();
  const { metrics, ...summary } = found;
  return { ...summary, metrics: periodicReportMetricsSchema.parse(metrics) };
}

/** For the manager's navigation: whether there is a report of their sector (5.1 item 3; CA-REL-01). */
export async function hasPeriodicReports(reader: PeriodicReportReader): Promise<boolean> {
  const actor = await requireCurrentActor();
  if (actor.role !== "MANAGER" || !actor.sectorId) return false;
  return (await reader.list({ sectorId: actor.sectorId }, 1)).length > 0;
}

/** SPEC 2026-11-09-comunicacao-e-calendarios, 7 item 3 (SF-259): how many reports the block of "Análises" shows. */
export const LATEST_REPORTS = 5;

/**
 * The latest reports of the scope "Análises" is showing (7 item 3; CA-COM-02): a manager's sector whatever is asked;
 * for the administrator, the sector chosen in the filter or, without one, the organization's. Anyone else reads
 * none, so the block does not appear.
 */
export async function latestPeriodicReports(raw: { sectorId?: string | null }, reader: PeriodicReportReader): Promise<PeriodicReportSummary[]> {
  const actor = await requireCurrentActor();
  if (actor.role === "MANAGER" && actor.sectorId) return reader.list({ sectorId: actor.sectorId }, LATEST_REPORTS);
  if (actor.role === "ADMIN") return reader.list({ sectorId: raw.sectorId ?? null }, LATEST_REPORTS);
  return [];
}
