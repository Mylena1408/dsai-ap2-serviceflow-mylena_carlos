import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainSector, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 3 (SF-249; CA-REL-03): reading the reports from the database.

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { buildReportMetrics, getPeriodicReport, hasPeriodicReports, listPeriodicReports } from "@/modules/periodic-reports";

type Person = { id: string; name: string; role: Role; sectorId: string | null };
const as = (person: Person) => session.getCurrentUser.mockResolvedValue({ ...person, isActive: true, email: `${person.id}@example.test` });
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const METRICS = buildReportMetrics({ opened: 3, completed: 1, cancelled: 0, completedWithDueDate: 0, completedOnTime: 0, medianResolutionMs: 3_600_000, ratingCount: 0, ratingSum: 0, minutesLogged: 0, tags: [] });

async function scenario() {
  const ti = await prisma.sector.create({ data: { name: "TI Relatórios" } });
  const rh = await prisma.sector.create({ data: { name: "RH Relatórios" } });
  const write = (kind: "WEEKLY" | "MONTHLY", first: string, last: string, sectorId: string | null) =>
    prisma.periodicReport.create({ data: { kind, periodStart: day(first), periodEnd: day(last), sectorId, generatedAt: new Date(), metrics: METRICS } });
  const tiWeek = await write("WEEKLY", "2026-11-09", "2026-11-15", ti.id);
  await write("WEEKLY", "2026-11-09", "2026-11-15", null);
  await write("WEEKLY", "2026-11-09", "2026-11-15", rh.id);
  await write("WEEKLY", "2026-11-02", "2026-11-08", ti.id);
  await write("MONTHLY", "2026-10-01", "2026-10-31", ti.id);
  return { ti, rh, tiWeek };
}

describe("reading the reports (SF-249)", () => {
  it("the administrator lists every report, newest period first, the organization before the sectors by name", async () => {
    const { ti } = await scenario();
    const admin = await createDomainUser({ role: "ADMIN" });
    as(admin);
    const list = await listPeriodicReports();
    expect(list.reports.map(({ kind, firstDay, sectorName }) => `${kind} ${firstDay} ${sectorName ?? "organização"}`)).toEqual([
      "WEEKLY 2026-11-09 organização",
      "WEEKLY 2026-11-09 RH Relatórios",
      "WEEKLY 2026-11-09 TI Relatórios",
      "WEEKLY 2026-11-02 TI Relatórios",
      "MONTHLY 2026-10-01 TI Relatórios",
    ]);
    expect((await listPeriodicReports({ scope: "organization" })).reports).toHaveLength(1);
    expect((await listPeriodicReports({ scope: ti.id })).reports).toHaveLength(3);
  });

  it("a manager lists and opens only their sector's reports", async () => {
    const { ti, rh, tiWeek } = await scenario();
    const gabi = await createDomainUser({ role: "MANAGER", sectorId: ti.id });
    as({ ...gabi, role: "MANAGER" });
    const list = await listPeriodicReports({ scope: rh.id });
    expect(list.reports.every(({ sectorId }) => sectorId === ti.id)).toBe(true);
    expect(list.reports).toHaveLength(3);
    expect(await getPeriodicReport(tiWeek.id)).toMatchObject({ sectorName: "TI Relatórios", metrics: { opened: 3, medianResolutionHours: 1 } });
    expect(await hasPeriodicReports()).toBe(true);

    const rhReport = await prisma.periodicReport.findFirstOrThrow({ where: { sectorId: rh.id } });
    await expect(getPeriodicReport(rhReport.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const organization = await prisma.periodicReport.findFirstOrThrow({ where: { sectorId: null } });
    await expect(getPeriodicReport(organization.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a manager of a sector without reports has no link; an attendant has no page", async () => {
    await scenario();
    const other = await createDomainSector();
    const fred = await createDomainUser({ role: "MANAGER", sectorId: other.id });
    as({ ...fred, role: "MANAGER" });
    expect(await hasPeriodicReports()).toBe(false);
    expect((await listPeriodicReports()).reports).toEqual([]);

    const ana = await createDomainUser({ role: "ATTENDANT", sectorId: other.id });
    as({ ...ana, role: "ATTENDANT" });
    await expect(listPeriodicReports()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
