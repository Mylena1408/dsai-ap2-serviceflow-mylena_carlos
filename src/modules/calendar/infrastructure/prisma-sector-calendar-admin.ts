import type { Prisma, PrismaClient } from "@prisma/client";
import { createPrismaAuditScope } from "@/modules/audit";
import { runSerializableTransaction } from "@/server/db/serializable-transaction";
import type { SectorCalendarReader, SectorCalendarStore, SectorCalendarTransaction } from "../application/sector-calendar-admin";
import { loadSectorCalendarParts } from "./prisma-sector-calendar";
import { createPrismaCalendarReader } from "./prisma-calendar";

// Configuring a sector's calendar in PostgreSQL (SPEC 2026-11-09-comunicacao-e-calendarios, 6.1 and 6.3; SF-253). The
// unique indexes settle two saves at once (one calendar per sector, one holiday per sector and day).

const dayText = (day: Date) => day.toISOString().slice(0, 10);
const dayValue = (day: string) => new Date(`${day}T00:00:00.000Z`);

export function createPrismaSectorCalendarReader(database: PrismaClient): SectorCalendarReader {
  return {
    activeSectors(sectorId) {
      return database.sector.findMany({
        where: { isActive: true, ...(sectorId ? { id: sectorId } : {}) },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true, name: true },
      });
    },
    async hours(sectorId) {
      return (await loadSectorCalendarParts(database, sectorId)).hours;
    },
    async holidays(sectorId) {
      const rows = await database.sectorHoliday.findMany({ where: { sectorId }, orderBy: [{ day: "asc" }, { id: "asc" }] });
      return rows.map(({ id, day, name, yearly }) => ({ id, day: dayText(day), name, yearly }));
    },
    async organization() {
      const { weekdays, startMinute, endMinute, timeZone } = await createPrismaCalendarReader(database).findSettings();
      return { weekdays, startMinute, endMinute, timeZone };
    },
  };
}

function transactionOf(client: Prisma.TransactionClient): SectorCalendarTransaction {
  return {
    ...createPrismaAuditScope(client),
    findSector(sectorId) {
      return client.sector.findUnique({ where: { id: sectorId }, select: { id: true, isActive: true } });
    },
    findHours(sectorId) {
      return client.sectorCalendar.findUnique({ where: { sectorId }, select: { id: true } });
    },
    saveHours(sectorId, hours, actorId) {
      const data = { ...hours, updatedAt: new Date(), updatedById: actorId };
      return client.sectorCalendar.upsert({ where: { sectorId }, create: { sectorId, ...data }, update: data, select: { id: true } });
    },
    async deleteHours(calendarId) {
      await client.sectorCalendar.delete({ where: { id: calendarId } });
    },
    async createHoliday(sectorId, holiday, actorId) {
      const day = dayValue(holiday.day);
      if (await client.sectorHoliday.findUnique({ where: { sectorId_day: { sectorId, day } }, select: { id: true } })) return null;
      return client.sectorHoliday.create({ data: { sectorId, day, name: holiday.name, yearly: holiday.yearly, createdById: actorId }, select: { id: true } });
    },
    findHoliday(holidayId) {
      return client.sectorHoliday.findUnique({ where: { id: holidayId }, select: { id: true, sectorId: true } });
    },
    async deleteHoliday(holidayId) {
      await client.sectorHoliday.delete({ where: { id: holidayId } });
    },
  };
}

export function createPrismaSectorCalendarStore(database: PrismaClient): SectorCalendarStore {
  return {
    run(work) {
      return runSerializableTransaction(database, (client) => work(transactionOf(client)), {
        translate: ["P2002", "P2025", "P2034"],
        fallbackMessage: "Sector calendar operation failed.",
      });
    },
  };
}
