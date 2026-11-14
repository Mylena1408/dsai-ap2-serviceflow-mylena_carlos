import { describe, expect, it, vi } from "vitest";
import { computeReportMetrics, reportRange, type PeriodicReportCountsReader } from "@/modules/periodic-reports/application/report-metrics";

// SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 1 (SF-247): the instants of a period and the numbers kept.

describe("reportRange", () => {
  it("runs from the first day's midnight to the midnight after the last day, in São Paulo (UTC-3)", () => {
    expect(reportRange({ firstDay: "2026-11-09", lastDay: "2026-11-15" })).toEqual({
      firstDay: "2026-11-09",
      lastDay: "2026-11-15",
      from: new Date("2026-11-09T03:00:00.000Z"),
      before: new Date("2026-11-16T03:00:00.000Z"),
    });
  });

  it("crosses a month and a year", () => {
    expect(reportRange({ firstDay: "2026-12-01", lastDay: "2026-12-31" }).before).toEqual(new Date("2027-01-01T03:00:00.000Z"));
  });
});

describe("computeReportMetrics", () => {
  it("asks the counts of the scope and the range, and keeps them as the report's numbers", async () => {
    const reader: PeriodicReportCountsReader = {
      counts: vi.fn(async () => ({
        opened: 4,
        completed: 2,
        cancelled: 0,
        completedWithDueDate: 2,
        completedOnTime: 1,
        medianResolutionMs: 7_200_000,
        ratingCount: 0,
        ratingSum: 0,
        minutesLogged: 30,
        tags: [],
      })),
    };
    const metrics = await computeReportMetrics("s1", { firstDay: "2026-11-01", lastDay: "2026-11-30" }, reader);
    expect(reader.counts).toHaveBeenCalledWith("s1", expect.objectContaining({ from: new Date("2026-11-01T03:00:00.000Z"), before: new Date("2026-12-01T03:00:00.000Z") }));
    expect(metrics).toMatchObject({ opened: 4, onTimePercentage: 50, medianResolutionHours: 2, ratingAverage: null, minutesLogged: 30 });
  });
});
