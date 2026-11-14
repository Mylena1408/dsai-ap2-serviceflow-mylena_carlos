import { describe, expect, it, vi } from "vitest";
import { generatePeriodicReports, type PeriodicReportGenerationStore } from "@/modules/periodic-reports/application/generate-reports";
import type { PeriodicReportKind } from "@/modules/periodic-reports";

// SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 2 and 5.3 items 1 to 3 (SF-248; CA-REL-01 and CA-REL-02).

const COUNTS = {
  opened: 1,
  completed: 0,
  cancelled: 0,
  completedWithDueDate: 0,
  completedOnTime: 0,
  medianResolutionMs: null,
  ratingCount: 0,
  ratingSum: 0,
  minutesLogged: 0,
  tags: [],
};

function store(enabled: PeriodicReportKind[], existing: Array<string | null> = [], written = true) {
  return {
    today: vi.fn(async () => "2026-11-16"),
    enabledKinds: vi.fn(async () => enabled),
    activeSectorIds: vi.fn(async () => ["s1", "s2"]),
    existingScopes: vi.fn(async () => existing),
    insert: vi.fn<PeriodicReportGenerationStore["insert"]>(async () => written),
    counts: vi.fn(async () => COUNTS),
  } satisfies PeriodicReportGenerationStore;
}

describe("generatePeriodicReports", () => {
  it("with nothing on, reads and writes nothing (CA-REL-01)", async () => {
    const source = store([]);
    expect(await generatePeriodicReports(source)).toEqual({ periods: [], generated: 0, alreadyThere: 0 });
    for (const method of ["today", "activeSectorIds", "existingScopes", "insert", "counts"] as const) {
      expect(source[method]).not.toHaveBeenCalled();
    }
  });

  it("generates the most recent week for the organization and each active sector, with their numbers", async () => {
    const source = store(["WEEKLY"]);
    expect(await generatePeriodicReports(source)).toEqual({
      periods: [{ kind: "WEEKLY", firstDay: "2026-11-09", lastDay: "2026-11-15" }],
      generated: 3,
      alreadyThere: 0,
    });
    expect(source.insert.mock.calls.map(([report]) => report.sectorId)).toEqual([null, "s1", "s2"]);
    expect(source.insert.mock.calls[0]![0]).toMatchObject({ kind: "WEEKLY", period: { firstDay: "2026-11-09" }, metrics: { opened: 1 } });
    expect(source.counts).toHaveBeenCalledTimes(3);
  });

  it("generates both kinds when both are on, each with its period", async () => {
    const source = store(["MONTHLY", "WEEKLY"]);
    const summary = await generatePeriodicReports(source);
    expect(summary.periods).toEqual([
      { kind: "WEEKLY", firstDay: "2026-11-09", lastDay: "2026-11-15" },
      { kind: "MONTHLY", firstDay: "2026-10-01", lastDay: "2026-10-31" },
    ]);
    expect(summary.generated).toBe(6);
  });

  it("skips the scopes that already have the report, without counting them again (5.3 item 1)", async () => {
    const source = store(["WEEKLY"], [null, "s1"]);
    expect(await generatePeriodicReports(source)).toMatchObject({ generated: 1, alreadyThere: 2 });
    expect(source.counts).toHaveBeenCalledTimes(1);
    expect(source.insert.mock.calls.map(([report]) => report.sectorId)).toEqual(["s2"]);
  });

  it("a report written by another run meanwhile counts as already there", async () => {
    expect(await generatePeriodicReports(store(["WEEKLY"], [], false))).toMatchObject({ generated: 0, alreadyThere: 3 });
  });
});
