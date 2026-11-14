import { z } from "zod";
import { addDays, isoWeekdayOf } from "@/shared/time";

// Periodic reports (SPEC 2026-11-09-comunicacao-e-calendarios, part C; decisions K3 and K7; SF-246): the periods, the
// numbers kept for each one and who reads which report. Days are the organization's calendar days ("YYYY-MM-DD").

export const PERIODIC_REPORT_KINDS = ["WEEKLY", "MONTHLY"] as const;
export type PeriodicReportKind = (typeof PERIODIC_REPORT_KINDS)[number];

export const PERIODIC_REPORT_KIND_LABELS: Record<PeriodicReportKind, string> = { WEEKLY: "Semanal", MONTHLY: "Mensal" };

/** 5.1 item 1: at most the five tags most used in the period. */
export const MAX_REPORT_TAGS = 5;

export interface ReportPeriod {
  firstDay: string;
  lastDay: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The first day of the month of a day. */
function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** The first day of the month before. */
function previousMonthStart(day: string): string {
  const [year, month] = day.split("-").map(Number) as [number, number];
  return month === 1 ? `${year - 1}-12-01` : `${year}-${pad(month - 1)}-01`;
}

/**
 * 5.1 item 2 (decision K7): the most recent complete period on `today`: the week before (Monday to Sunday), or the
 * month before. On a Monday, the week before is the one that just ended; on the 1st, the month that just ended.
 */
export function latestCompletePeriod(kind: PeriodicReportKind, today: string): ReportPeriod {
  if (kind === "WEEKLY") {
    const thisMonday = addDays(today, 1 - isoWeekdayOf(today));
    const firstDay = addDays(thisMonday, -7);
    return { firstDay, lastDay: addDays(firstDay, 6) };
  }
  const thisMonth = monthStart(today);
  return { firstDay: previousMonthStart(thisMonth), lastDay: addDays(thisMonth, -1) };
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "Semana de 03/11 a 09/11/2026" or "Novembro de 2026". */
export function periodLabel(kind: PeriodicReportKind, period: ReportPeriod): string {
  const [year, month, day] = period.firstDay.split("-");
  if (kind === "MONTHLY") {
    const name = MONTHS[Number(month) - 1]!;
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${year}`;
  }
  const [lastYear, lastMonth, lastDay] = period.lastDay.split("-");
  return `Semana de ${day}/${month} a ${lastDay}/${lastMonth}/${lastYear}`;
}

/** The numbers of a period (5.1 item 1), as kept: never a request, a person or a text. */
export const periodicReportMetricsSchema = z
  .object({
    opened: z.number().int().min(0),
    completed: z.number().int().min(0),
    cancelled: z.number().int().min(0),
    completedWithDueDate: z.number().int().min(0),
    completedOnTime: z.number().int().min(0),
    /** Null without completed requests with a due date. */
    onTimePercentage: z.number().int().min(0).max(100).nullable(),
    /** From the opening to the completion, in hours with one decimal; null without completed requests. */
    medianResolutionHours: z.number().min(0).nullable(),
    ratingCount: z.number().int().min(0),
    /** One decimal; null without ratings. */
    ratingAverage: z.number().min(1).max(5).nullable(),
    minutesLogged: z.number().int().min(0),
    topTags: z.array(z.object({ name: z.string(), count: z.number().int().min(1) }).strict()).max(MAX_REPORT_TAGS),
  })
  .strict();

export type PeriodicReportMetrics = z.output<typeof periodicReportMetricsSchema>;

/** What the database counts for a period and a scope. */
export interface PeriodicReportCounts {
  opened: number;
  completed: number;
  cancelled: number;
  completedWithDueDate: number;
  completedOnTime: number;
  /** Null without completed requests. */
  medianResolutionMs: number | null;
  ratingCount: number;
  ratingSum: number;
  minutesLogged: number;
  tags: ReadonlyArray<{ name: string; count: number }>;
}

const oneDecimal = (value: number) => Math.round(value * 10) / 10;
const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

/** 5.1 item 1: the numbers kept, from the counts of the moment (5.3 item 2). */
export function buildReportMetrics(counts: PeriodicReportCounts): PeriodicReportMetrics {
  return {
    opened: counts.opened,
    completed: counts.completed,
    cancelled: counts.cancelled,
    completedWithDueDate: counts.completedWithDueDate,
    completedOnTime: counts.completedOnTime,
    onTimePercentage: counts.completedWithDueDate === 0 ? null : Math.round((counts.completedOnTime / counts.completedWithDueDate) * 100),
    medianResolutionHours: counts.medianResolutionMs === null ? null : oneDecimal(counts.medianResolutionMs / 3_600_000),
    ratingCount: counts.ratingCount,
    ratingAverage: counts.ratingCount === 0 ? null : oneDecimal(counts.ratingSum / counts.ratingCount),
    minutesLogged: counts.minutesLogged,
    topTags: counts.tags
      .filter((tag) => tag.count > 0)
      .map(({ name, count }) => ({ name, count }))
      .sort((left, right) => right.count - left.count || collator.compare(left.name, right.name))
      .slice(0, MAX_REPORT_TAGS),
  };
}

/** Who reads the reports (5.1 item 3). */
export interface ReportViewer {
  role: "ADMIN" | "MANAGER" | "ATTENDANT" | "REQUESTER";
  sectorId: string | null;
}

/** 5.1 item 3: the administrator reads every report and the organization's; a manager, their sector's; nobody else. */
export function canReadReport(viewer: ReportViewer, report: { sectorId: string | null }): boolean {
  if (viewer.role === "ADMIN") return true;
  return viewer.role === "MANAGER" && viewer.sectorId !== null && report.sectorId === viewer.sectorId;
}

/** The scopes generated for a period: the organization (null) and each active sector. */
export function reportScopes(activeSectorIds: readonly string[]): Array<string | null> {
  return [null, ...activeSectorIds];
}
