import { describe, expect, it } from "vitest";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainRequest, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";
import { loadSectorBusinessCalendar } from "@/modules/calendar";
import { createPrismaAuditScope } from "@/modules/audit";

// SPEC 2026-11-09-comunicacao-e-calendarios, part D, 6.1 and 6.3 (SF-252; CA-CAL-01 and CA-CAL-04): the sector
// calendars against the real database.

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function scenario() {
  const sector = await createDomainSector();
  const admin = await createDomainUser({ role: "ADMIN" });
  return { sector, admin };
}

describe("the sector calendars in the database (SF-252)", () => {
  it("a sector without its own calendar reads exactly the organization's (CA-CAL-01)", async () => {
    const { sector, admin } = await scenario();
    await prisma.businessHoliday.create({ data: { day: day("2026-12-25"), name: "Natal", yearly: true, createdById: admin.id } });
    const organization = await loadSectorBusinessCalendar(prisma, null);
    const read = await loadSectorBusinessCalendar(prisma, sector.id);
    expect(read.calendar).toEqual(organization.calendar);
    expect(read.parts).toEqual({ hours: null, holidays: [] });
    expect(organization.calendar.holidays).toEqual([{ day: "2026-12-25", yearly: true }]);
  });

  it("reads the sector's hours and adds its holidays to the organization's", async () => {
    const { sector, admin } = await scenario();
    await prisma.businessHoliday.create({ data: { day: day("2026-12-25"), name: "Natal", yearly: true, createdById: admin.id } });
    await prisma.sectorCalendar.create({ data: { sectorId: sector.id, weekdays: [6, 1, 2], startMinute: 420, endMinute: 1140, updatedAt: new Date(), updatedById: admin.id } });
    await prisma.sectorHoliday.create({ data: { sectorId: sector.id, day: day("2026-11-20"), name: "Consciência Negra", createdById: admin.id } });
    const { calendar, parts } = await loadSectorBusinessCalendar(prisma, sector.id);
    expect(parts!.hours).toEqual({ weekdays: [1, 2, 6], startMinute: 420, endMinute: 1140 });
    expect(calendar).toMatchObject({ weekdays: [1, 2, 6], startMinute: 420, endMinute: 1140, timeZone: "America/Sao_Paulo" });
    expect(calendar.holidays).toEqual([
      { day: "2026-12-25", yearly: true },
      { day: "2026-11-20", yearly: false },
    ]);
  });

  it("refuses an invalid window, a bad holiday name, a second holiday on the same day and a second calendar (CA-CAL-04)", async () => {
    const { sector, admin } = await scenario();
    const calendar = (weekdays: number[], startMinute: number, endMinute: number) =>
      prisma.sectorCalendar.create({ data: { sectorId: sector.id, weekdays, startMinute, endMinute, updatedAt: new Date(), updatedById: admin.id } });
    for (const [weekdays, start, end] of [[[], 480, 1080], [[8], 480, 1080], [[1], 1080, 480], [[1], 480, 1441]] as const) {
      await expect(calendar([...weekdays], start, end)).rejects.toThrow(/SectorCalendar_check/);
    }
    await calendar([1, 2, 3, 4, 5], 480, 1080);
    await expect(calendar([1], 480, 1080)).rejects.toMatchObject({ code: "P2002" });

    const holiday = (name: string) => prisma.sectorHoliday.create({ data: { sectorId: sector.id, day: day("2026-11-20"), name, createdById: admin.id } });
    await expect(holiday(" Feriado")).rejects.toThrow(/SectorHoliday_name_check/);
    await expect(holiday("x".repeat(81))).rejects.toThrow(/SectorHoliday_name_check/);
    await holiday("Feriado");
    await expect(holiday("Outro")).rejects.toMatchObject({ code: "P2002" });
    // The same day in another sector is fine.
    const other = await createDomainSector();
    await prisma.sectorHoliday.create({ data: { sectorId: other.id, day: day("2026-11-20"), name: "Feriado", createdById: admin.id } });
  });

  it("only a request in business hours names the sector of its calendar; the ones already open have none", async () => {
    const { sector } = await scenario();
    const category = await createDomainCategory();
    const service = await createDomainService({ categoryId: category.id, sectorId: sector.id });
    const rita = await createDomainUser({ role: "REQUESTER" });
    const request = await createDomainRequest({ requesterId: rita.id, serviceId: service.id, sectorId: sector.id });
    expect((await prisma.request.findUniqueOrThrow({ where: { id: request.id } })).slaCalendarSectorId).toBeNull();
    await expect(prisma.request.update({ where: { id: request.id }, data: { slaCalendarSectorId: sector.id } })).rejects.toThrow(
      /Request_slaCalendarSectorId_check/,
    );
    await prisma.request.update({ where: { id: request.id }, data: { slaBusinessHours: true, slaCalendarSectorId: sector.id } });
  });

  it("the audit trail names the sector's calendar and holiday by the sector", async () => {
    const { sector, admin } = await scenario();
    const actor = { id: admin.id, role: "ADMIN" as const };
    await prisma.$transaction(async (transaction) => {
      const audit = createPrismaAuditScope(transaction);
      await audit.audited({ actor, action: "CREATED", entityType: "SECTOR_CALENDAR" }, () =>
        transaction.sectorCalendar.create({
          data: { sectorId: sector.id, weekdays: [1, 2, 3], startMinute: 480, endMinute: 1020, updatedAt: new Date(), updatedById: admin.id },
          select: { id: true },
        }),
      );
      await audit.audited({ actor, action: "CREATED", entityType: "SECTOR_HOLIDAY" }, () =>
        transaction.sectorHoliday.create({ data: { sectorId: sector.id, day: day("2026-11-20"), name: "Feriado local", createdById: admin.id }, select: { id: true } }),
      );
    });
    const entries = await prisma.auditEntry.findMany({ where: { entityType: { in: ["SECTOR_CALENDAR", "SECTOR_HOLIDAY"] } }, orderBy: { occurredAt: "asc" } });
    expect(entries.map(({ entityType, entityLabel }) => [entityType, entityLabel])).toEqual([
      ["SECTOR_CALENDAR", `Calendário de ${sector.name}`],
      ["SECTOR_HOLIDAY", `Feriado local (${sector.name})`],
    ]);
    expect(entries[0]!.changes).toEqual(
      expect.arrayContaining([
        { field: "weekdays", before: null, after: ["Segunda-feira", "Terça-feira", "Quarta-feira"] },
        { field: "startTime", before: null, after: "08:00" },
        { field: "endTime", before: null, after: "17:00" },
      ]),
    );
    expect(entries[1]!.changes).toEqual(expect.arrayContaining([{ field: "day", before: null, after: "2026-11-20" }]));
  });
});
