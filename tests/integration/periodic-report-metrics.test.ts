import { describe, expect, it } from "vitest";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainRequest, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";
import { computeReportMetrics } from "@/modules/periodic-reports";

// SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 1 (SF-247): the numbers of a period counted in the database, with
// the definitions of "Análises", for a sector and for the organization.

const PERIOD = { firstDay: "2026-11-09", lastDay: "2026-11-15" };
const IN = new Date("2026-11-10T15:00:00.000Z");
const BEFORE = new Date("2026-11-08T15:00:00.000Z");
const HOUR = 3_600_000;

async function scenario() {
  const ti = await createDomainSector();
  const rh = await createDomainSector();
  const category = await createDomainCategory();
  const service = await createDomainService({ categoryId: category.id, sectorId: ti.id });
  const rhService = await createDomainService({ categoryId: category.id, sectorId: rh.id });
  const ana = await createDomainUser({ role: "ATTENDANT", sectorId: ti.id });
  const rita = await createDomainUser({ role: "REQUESTER" });

  const request = async (data: Record<string, unknown>, sectorId = ti.id, serviceId = service.id) => {
    const created = await createDomainRequest({ requesterId: rita.id, serviceId, sectorId });
    return prisma.request.update({ where: { id: created.id }, data });
  };

  // Opened in the period: two completed (one on time after 2 hours, one late after 6), one cancelled, one open.
  const onTime = await request({ createdAt: IN, status: "COMPLETED", completedAt: new Date(IN.getTime() + 2 * HOUR), slaHoursSnapshot: 8, dueAt: new Date(IN.getTime() + 8 * HOUR), completedLate: false });
  await request({ createdAt: IN, status: "COMPLETED", completedAt: new Date(IN.getTime() + 6 * HOUR), slaHoursSnapshot: 4, dueAt: new Date(IN.getTime() + 4 * HOUR), completedLate: true });
  await request({ createdAt: IN, status: "CANCELLED", cancelledAt: new Date(IN.getTime() + HOUR) });
  const open = await request({ createdAt: IN });
  // Opened before the period and completed in it, without a due date: completed, not opened, not "with due date".
  await request({ createdAt: BEFORE, status: "COMPLETED", completedAt: IN, completedLate: null });
  // Another sector, in the period: only the organization counts it.
  await request({ createdAt: IN }, rh.id, rhService.id);

  await prisma.requestSatisfaction.create({ data: { requestId: onTime.id, requesterId: rita.id, rating: 4, ratedAt: IN, completedAtSnapshot: onTime.completedAt! } });
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
  await prisma.requestTimeEntry.create({ data: { requestId: onTime.id, userId: ana.id, workedOn: day("2026-11-10"), minutes: 90 } });
  await prisma.requestTimeEntry.create({ data: { requestId: onTime.id, userId: ana.id, workedOn: day("2026-11-16"), minutes: 500 } });
  await prisma.requestTimeEntry.create({ data: { requestId: onTime.id, userId: ana.id, workedOn: day("2026-11-11"), minutes: 500, deletedAt: IN } });

  const tag = await prisma.sectorTag.create({ data: { sectorId: ti.id, name: "Rede", color: "blue" } });
  for (const requestId of [onTime.id, open.id]) await prisma.requestTag.create({ data: { requestId, tagId: tag.id, addedById: ana.id, addedAt: IN } });

  return { ti, rh };
}

describe("the numbers of a period (SF-247)", () => {
  it("counts a sector's requests with the definitions of 'Análises'", async () => {
    const { ti } = await scenario();
    expect(await computeReportMetrics(ti.id, PERIOD, prisma)).toEqual({
      opened: 4,
      completed: 3,
      cancelled: 1,
      completedWithDueDate: 2,
      completedOnTime: 1,
      onTimePercentage: 50,
      medianResolutionHours: 6,
      ratingCount: 1,
      ratingAverage: 4,
      minutesLogged: 90,
      topTags: [{ name: "Rede", count: 2 }],
    });
  });

  it("the organization counts every sector, naming each tag with its sector", async () => {
    const { ti, rh } = await scenario();
    const organization = await computeReportMetrics(null, PERIOD, prisma);
    expect(organization.opened).toBeGreaterThanOrEqual(5);
    expect(organization.topTags).toContainEqual({ name: `Rede (${(await prisma.sector.findUniqueOrThrow({ where: { id: ti.id } })).name})`, count: 2 });
    expect((await computeReportMetrics(rh.id, PERIOD, prisma)).opened).toBe(1);
  });

  it("a period without requests has zeros and no share, median or average", async () => {
    const { ti } = await scenario();
    expect(await computeReportMetrics(ti.id, { firstDay: "2026-10-01", lastDay: "2026-10-31" }, prisma)).toEqual({
      opened: 0,
      completed: 0,
      cancelled: 0,
      completedWithDueDate: 0,
      completedOnTime: 0,
      onTimePercentage: null,
      medianResolutionHours: null,
      ratingCount: 0,
      ratingAverage: null,
      minutesLogged: 0,
      topTags: [],
    });
  });
});
