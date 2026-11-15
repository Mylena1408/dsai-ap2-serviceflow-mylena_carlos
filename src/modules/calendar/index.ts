import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import * as admin from "./application/calendar-admin";
import * as sectorAdmin from "./application/sector-calendar-admin";
import { createPrismaSectorCalendarReader, createPrismaSectorCalendarStore } from "./infrastructure/prisma-sector-calendar-admin";
import {
  createPrismaCalendarReader,
  createPrismaCalendarTransactionRunner,
} from "./infrastructure/prisma-calendar";

// Business calendar and holidays (SPEC 2026-11-03-pausa-sla-calendario, 5.1).
export {
  DEFAULT_CALENDAR,
  MAX_HOLIDAY_NAME_LENGTH,
  MINUTES_PER_DAY,
  WEEKDAY_LABELS,
  minuteOfTime,
  parseCalendarInput,
  parseHolidayInput,
  timeOfMinute,
  type CalendarInput,
  type CalendarSettings,
  type HolidaySettings,
} from "./domain/calendar-config";
export type { CalendarRecord, HolidayRecord } from "./application/ports";
export type { CalendarOverview } from "./application/calendar-admin";
/** For other modules' infrastructure: reads the calendar with their transaction client. */
export { loadBusinessCalendar } from "./infrastructure/prisma-calendar";

// A sector's calendar (SPEC 2026-11-09-comunicacao-e-calendarios, part D; SF-252).
export {
  calendarSectorAtOpening,
  hasOwnCalendar,
  parseSectorHoursInput,
  sectorBusinessCalendar,
  type SectorCalendarParts,
  type SectorHours,
} from "./domain/sector-calendar";
/** For other modules' infrastructure: a sector's effective calendar, read with their transaction client. */
export { loadSectorBusinessCalendar, loadSectorCalendarParts } from "./infrastructure/prisma-sector-calendar";

export function getCalendarOverview(database: PrismaClient = prisma): Promise<admin.CalendarOverview> {
  return admin.getCalendarOverview(createPrismaCalendarReader(database));
}

export function updateCalendar(input: unknown, database: PrismaClient = prisma): Promise<void> {
  return admin.updateCalendar(input, createPrismaCalendarTransactionRunner(database));
}

export function createHoliday(input: unknown, database: PrismaClient = prisma): Promise<{ id: string }> {
  return admin.createHoliday(input, createPrismaCalendarTransactionRunner(database));
}

export function deleteHoliday(input: unknown, database: PrismaClient = prisma): Promise<void> {
  return admin.deleteHoliday(input, createPrismaCalendarTransactionRunner(database));
}

export { canManageSectorCalendar } from "./domain/sector-calendar";
export type { SectorCalendarView, SectorHolidayRecord } from "./application/sector-calendar-admin";

/** The screen of a sector's calendar (6.1; SF-253): the administrator chooses the sector, a manager sees their own. */
export function getSectorCalendarView(sectorId?: unknown, database: PrismaClient = prisma): Promise<sectorAdmin.SectorCalendarView> {
  return sectorAdmin.getSectorCalendarView(sectorId, createPrismaSectorCalendarReader(database));
}

export function saveSectorHours(sectorId: unknown, input: unknown, database: PrismaClient = prisma): Promise<void> {
  return sectorAdmin.saveSectorHours(sectorId, input, createPrismaSectorCalendarStore(database));
}

/** The sector follows the organization's hours again. */
export function clearSectorHours(sectorId: unknown, database: PrismaClient = prisma): Promise<{ changed: boolean }> {
  return sectorAdmin.clearSectorHours(sectorId, createPrismaSectorCalendarStore(database));
}

export function createSectorHoliday(sectorId: unknown, input: unknown, database: PrismaClient = prisma): Promise<{ id: string }> {
  return sectorAdmin.createSectorHoliday(sectorId, input, createPrismaSectorCalendarStore(database));
}

export function deleteSectorHoliday(holidayId: unknown, database: PrismaClient = prisma): Promise<void> {
  return sectorAdmin.deleteSectorHoliday(holidayId, createPrismaSectorCalendarStore(database));
}
