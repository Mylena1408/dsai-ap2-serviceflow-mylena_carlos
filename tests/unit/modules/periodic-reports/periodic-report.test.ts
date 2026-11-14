import { describe, expect, it } from "vitest";
import {
  MAX_REPORT_TAGS,
  buildReportMetrics,
  canReadReport,
  latestCompletePeriod,
  periodLabel,
  periodicReportMetricsSchema,
  reportScopes,
  type PeriodicReportCounts,
} from "@/modules/periodic-reports";

// SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 and 5.3 (SF-246; decision K7; the rules of CA-REL-02 and CA-REL-03).

describe("latestCompletePeriod (decision K7)", () => {
  it.each([
    ["on a Monday, the week that just ended", "2026-11-16", { firstDay: "2026-11-09", lastDay: "2026-11-15" }],
    ["on a Sunday, the week before the current one", "2026-11-15", { firstDay: "2026-11-02", lastDay: "2026-11-08" }],
    ["across a month", "2026-12-02", { firstDay: "2026-11-23", lastDay: "2026-11-29" }],
    ["across a year", "2027-01-04", { firstDay: "2026-12-28", lastDay: "2027-01-03" }],
  ])("weekly %s", (_label, today, period) => {
    expect(latestCompletePeriod("WEEKLY", today)).toEqual(period);
  });

  it.each([
    ["on the 1st, the month that just ended", "2026-12-01", { firstDay: "2026-11-01", lastDay: "2026-11-30" }],
    ["in the middle of a month, the month before", "2026-11-14", { firstDay: "2026-10-01", lastDay: "2026-10-31" }],
    ["in January, December of the year before", "2027-01-01", { firstDay: "2026-12-01", lastDay: "2026-12-31" }],
    ["in March of a leap year, February with 29 days", "2028-03-05", { firstDay: "2028-02-01", lastDay: "2028-02-29" }],
  ])("monthly %s", (_label, today, period) => {
    expect(latestCompletePeriod("MONTHLY", today)).toEqual(period);
  });

  it("names the periods", () => {
    expect(periodLabel("WEEKLY", { firstDay: "2026-11-09", lastDay: "2026-11-15" })).toBe("Semana de 09/11 a 15/11/2026");
    expect(periodLabel("MONTHLY", { firstDay: "2026-03-01", lastDay: "2026-03-31" })).toBe("Março de 2026");
  });
});

const counts = (overrides: Partial<PeriodicReportCounts> = {}): PeriodicReportCounts => ({
  opened: 12,
  completed: 8,
  cancelled: 1,
  completedWithDueDate: 6,
  completedOnTime: 5,
  medianResolutionMs: 3.25 * 3_600_000,
  ratingCount: 3,
  ratingSum: 13,
  minutesLogged: 540,
  tags: [
    { name: "Rede", count: 2 },
    { name: "Urgente", count: 5 },
    { name: "Acesso", count: 2 },
    { name: "Folha", count: 1 },
    { name: "Backup", count: 1 },
    { name: "Impressora", count: 1 },
    { name: "Vazia", count: 0 },
  ],
  ...overrides,
});

describe("buildReportMetrics (5.1 item 1)", () => {
  it("keeps the counts, the on-time share, the median in hours, the rating average and the five tags most used", () => {
    const metrics = buildReportMetrics(counts());
    expect(metrics).toEqual({
      opened: 12,
      completed: 8,
      cancelled: 1,
      completedWithDueDate: 6,
      completedOnTime: 5,
      onTimePercentage: 83,
      medianResolutionHours: 3.3,
      ratingCount: 3,
      ratingAverage: 4.3,
      minutesLogged: 540,
      topTags: [
        { name: "Urgente", count: 5 },
        { name: "Acesso", count: 2 },
        { name: "Rede", count: 2 },
        { name: "Backup", count: 1 },
        { name: "Folha", count: 1 },
      ],
    });
    expect(metrics.topTags).toHaveLength(MAX_REPORT_TAGS);
    expect(periodicReportMetricsSchema.safeParse(metrics).success).toBe(true);
  });

  it("has no share, median or average without the data for them", () => {
    const metrics = buildReportMetrics(
      counts({ completed: 0, completedWithDueDate: 0, completedOnTime: 0, medianResolutionMs: null, ratingCount: 0, ratingSum: 0, tags: [] }),
    );
    expect(metrics).toMatchObject({ onTimePercentage: null, medianResolutionHours: null, ratingAverage: null, topTags: [] });
    expect(periodicReportMetricsSchema.safeParse(metrics).success).toBe(true);
  });

  it("the kept numbers never carry anything else", () => {
    expect(periodicReportMetricsSchema.safeParse({ ...buildReportMetrics(counts()), requestIds: ["r1"] }).success).toBe(false);
  });
});

describe("who reads a report (5.1 item 3)", () => {
  const sector = { sectorId: "s1" };
  const organization = { sectorId: null };

  it("the administrator reads every report and the organization's", () => {
    expect(canReadReport({ role: "ADMIN", sectorId: null }, sector)).toBe(true);
    expect(canReadReport({ role: "ADMIN", sectorId: null }, organization)).toBe(true);
  });

  it("a manager reads only their sector's", () => {
    expect(canReadReport({ role: "MANAGER", sectorId: "s1" }, sector)).toBe(true);
    expect(canReadReport({ role: "MANAGER", sectorId: "s2" }, sector)).toBe(false);
    expect(canReadReport({ role: "MANAGER", sectorId: "s1" }, organization)).toBe(false);
    expect(canReadReport({ role: "MANAGER", sectorId: null }, organization)).toBe(false);
  });

  it("an attendant and a requester read none", () => {
    expect(canReadReport({ role: "ATTENDANT", sectorId: "s1" }, sector)).toBe(false);
    expect(canReadReport({ role: "REQUESTER", sectorId: null }, organization)).toBe(false);
  });

  it("generates the organization's report and one per active sector", () => {
    expect(reportScopes(["s1", "s2"])).toEqual([null, "s1", "s2"]);
  });
});
