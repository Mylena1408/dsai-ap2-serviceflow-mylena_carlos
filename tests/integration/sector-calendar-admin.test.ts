import { describe, expect, it, vi } from "vitest";
import { prisma } from "./fixtures";
import { createDomainSector, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 6.1 and 6.3 items 1 and 2 (decision K9; SF-253; CA-CAL-02): configuring a
// sector's calendar against the real database, with the audit trail.

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import {
  clearSectorHours,
  createSectorHoliday,
  deleteSectorHoliday,
  getSectorCalendarView,
  loadSectorBusinessCalendar,
  saveSectorHours,
} from "@/modules/calendar";

type Person = { id: string; email: string; role: "ADMIN" | "MANAGER" | "ATTENDANT"; sectorId: string | null };
const as = (person: Person) => session.getCurrentUser.mockResolvedValue({ ...person, name: "Pessoa", isActive: true });

describe("configuring a sector's calendar (SF-253)", () => {
  it("a manager sets their sector's hours and holidays, goes back to the organization's, all in the audit trail (CA-CAL-02)", async () => {
    const sector = await createDomainSector();
    const gabi = await createDomainUser({ role: "MANAGER", sectorId: sector.id });
    as({ id: gabi.id, email: gabi.email, role: "MANAGER", sectorId: sector.id });

    expect(await getSectorCalendarView()).toMatchObject({ sector: { id: sector.id }, hours: null, holidays: [] });
    await saveSectorHours(sector.id, { weekdays: ["1", "2", "3", "4", "5", "6"], startTime: "07:00", endTime: "19:00" });
    await saveSectorHours(sector.id, { weekdays: ["1", "2", "3", "4", "5", "6"], startTime: "07:00", endTime: "13:00" });
    const { id: holidayId } = await createSectorHoliday(sector.id, { day: "2026-11-20", name: "Feriado local", yearly: true });
    await expect(createSectorHoliday(sector.id, { day: "2026-11-20", name: "Outro", yearly: false })).rejects.toMatchObject({ code: "CONFLICT" });

    const view = await getSectorCalendarView();
    expect(view.hours).toEqual({ weekdays: [1, 2, 3, 4, 5, 6], startMinute: 420, endMinute: 780 });
    expect(view.holidays).toEqual([{ id: holidayId, day: "2026-11-20", name: "Feriado local", yearly: true }]);
    expect((await loadSectorBusinessCalendar(prisma, sector.id)).calendar).toMatchObject({ weekdays: [1, 2, 3, 4, 5, 6], endMinute: 780 });

    expect(await clearSectorHours(sector.id)).toEqual({ changed: true });
    expect(await clearSectorHours(sector.id)).toEqual({ changed: false });
    await deleteSectorHoliday(holidayId);
    expect(await prisma.sectorCalendar.count()).toBe(0);
    expect(await prisma.sectorHoliday.count()).toBe(0);

    const entries = await prisma.auditEntry.findMany({
      where: { entityType: { in: ["SECTOR_CALENDAR", "SECTOR_HOLIDAY"] } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    expect(entries.map(({ entityType, action, actorId }) => `${entityType} ${action} ${actorId === gabi.id}`)).toEqual([
      "SECTOR_CALENDAR CREATED true",
      "SECTOR_CALENDAR UPDATED true",
      "SECTOR_HOLIDAY CREATED true",
      "SECTOR_CALENDAR DELETED true",
      "SECTOR_HOLIDAY DELETED true",
    ]);
    expect(entries[1]!.changes).toEqual([{ field: "endTime", before: "19:00", after: "13:00" }]);
    // The removals keep what was there.
    expect(entries[3]!.changes).toEqual(expect.arrayContaining([{ field: "startTime", before: "07:00", after: null }]));
    expect(entries[4]!.changes).toEqual(expect.arrayContaining([{ field: "name", before: "Feriado local", after: null }]));
  });

  it("a manager cannot touch another sector; the administrator configures any active one", async () => {
    const mine = await createDomainSector();
    const other = await createDomainSector();
    const inactive = await createDomainSector(false);
    const gabi = await createDomainUser({ role: "MANAGER", sectorId: mine.id });
    const admin = await createDomainUser({ role: "ADMIN" });

    as({ id: admin.id, email: admin.email, role: "ADMIN", sectorId: null });
    const { id: otherHoliday } = await createSectorHoliday(other.id, { day: "2026-12-24", name: "Véspera", yearly: true });
    await saveSectorHours(other.id, { weekdays: ["1"], startTime: "08:00", endTime: "12:00" });
    await expect(saveSectorHours(inactive.id, { weekdays: ["1"], startTime: "08:00", endTime: "12:00" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const view = await getSectorCalendarView(other.id);
    expect(view.sectors.map(({ id }) => id)).not.toContain(inactive.id);
    expect(view.sector?.id).toBe(other.id);

    as({ id: gabi.id, email: gabi.email, role: "MANAGER", sectorId: mine.id });
    await expect(saveSectorHours(other.id, { weekdays: ["1"], startTime: "08:00", endTime: "18:00" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createSectorHoliday(other.id, { day: "2026-12-25", name: "Natal", yearly: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteSectorHoliday(otherHoliday)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(clearSectorHours(other.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getSectorCalendarView(other.id)).sector?.id).toBe(mine.id);
    expect(await prisma.sectorHoliday.count({ where: { sectorId: other.id } })).toBe(1);
    expect(await prisma.sectorCalendar.count({ where: { sectorId: other.id } })).toBe(1);

    const ana = await createDomainUser({ role: "ATTENDANT", sectorId: mine.id });
    as({ id: ana.id, email: ana.email, role: "ATTENDANT", sectorId: mine.id });
    await expect(getSectorCalendarView()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(saveSectorHours(mine.id, { weekdays: ["1"], startTime: "08:00", endTime: "18:00" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
