import { describe, expect, it, vi } from "vitest";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainRequest, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 2 and 5.3 items 1 to 3 (SF-248; CA-REL-01 and CA-REL-02): the
// daily job's generation against the real database.

vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { generatePeriodicReports, latestCompletePeriod } from "@/modules/periodic-reports";
import { runDailyJob } from "@/server/jobs";
import { zonedDayOf, startOfZonedDay, addDays } from "@/shared/time";

async function setting(kind: "WEEKLY" | "MONTHLY", isEnabled: boolean) {
  const admin = await createDomainUser({ role: "ADMIN" });
  await prisma.periodicReportSetting.upsert({
    where: { kind },
    create: { kind, isEnabled, updatedAt: new Date(), updatedById: admin.id },
    update: { isEnabled, updatedAt: new Date(), updatedById: admin.id },
  });
}

/** A request opened in the middle of the week that the job reports today. */
async function requestInLastWeek() {
  const sector = await createDomainSector();
  const category = await createDomainCategory();
  const service = await createDomainService({ categoryId: category.id, sectorId: sector.id });
  const rita = await createDomainUser({ role: "REQUESTER" });
  const week = latestCompletePeriod("WEEKLY", zonedDayOf(new Date()));
  const created = await createDomainRequest({ requesterId: rita.id, serviceId: service.id, sectorId: sector.id });
  await prisma.request.update({ where: { id: created.id }, data: { createdAt: new Date(startOfZonedDay(addDays(week.firstDay, 2)).getTime() + 12 * 3_600_000) } });
  return { sector, week, requestId: created.id };
}

const scopesNow = async () => 1 + (await prisma.sector.count({ where: { isActive: true } }));

describe("generating the periodic reports (SF-248)", () => {
  it("with no kind on, the job generates nothing (CA-REL-01)", async () => {
    await requestInLastWeek();
    await setting("WEEKLY", false);
    expect(await generatePeriodicReports({}, prisma)).toEqual({ periods: [], generated: 0, alreadyThere: 0, notices: 0 });
    expect(await prisma.periodicReport.count()).toBe(0);
  });

  it("generates the last week once for the organization and each active sector, with the numbers of the moment", async () => {
    const { sector, week, requestId } = await requestInLastWeek();
    const inactive = await createDomainSector(false);
    await setting("WEEKLY", true);
    const scopes = await scopesNow();

    const first = await generatePeriodicReports({}, prisma);
    expect(first).toMatchObject({ periods: [{ kind: "WEEKLY", ...week }], generated: scopes, alreadyThere: 0 });
    const reports = await prisma.periodicReport.findMany({ where: { kind: "WEEKLY" } });
    expect(reports).toHaveLength(scopes);
    expect(reports.some(({ sectorId }) => sectorId === inactive.id)).toBe(false);
    const mine = reports.find(({ sectorId }) => sectorId === sector.id)!;
    expect(mine.periodStart.toISOString().slice(0, 10)).toBe(week.firstDay);
    expect(mine.metrics).toMatchObject({ opened: 1, completed: 0 });

    // Run again: nothing new. Later changes do not touch the kept numbers (5.3 item 2).
    await prisma.request.update({ where: { id: requestId }, data: { createdAt: new Date("2020-01-01T12:00:00.000Z") } });
    expect(await generatePeriodicReports({}, prisma)).toMatchObject({ generated: 0, alreadyThere: scopes });
    expect((await prisma.periodicReport.findUniqueOrThrow({ where: { id: mine.id } })).metrics).toMatchObject({ opened: 1 });
  });

  it("three runs at once keep one report per scope (5.3 item 1)", async () => {
    await requestInLastWeek();
    await setting("WEEKLY", true);
    const scopes = await scopesNow();
    const runs = await Promise.all([generatePeriodicReports({}, prisma), generatePeriodicReports({}, prisma), generatePeriodicReports({}, prisma)]);
    expect(runs.reduce((sum, run) => sum + run.generated, 0)).toBe(scopes);
    expect(await prisma.periodicReport.count({ where: { kind: "WEEKLY" } })).toBe(scopes);
  });

  it("is a step of the daily job", async () => {
    await requestInLastWeek();
    await setting("MONTHLY", true);
    const summary = await runDailyJob();
    expect(summary.periodicReports).toMatchObject({ status: "ok", result: { periods: [{ kind: "MONTHLY" }] } });
    expect(await prisma.periodicReport.count({ where: { kind: "MONTHLY", sectorId: null } })).toBe(1);
  });
});
