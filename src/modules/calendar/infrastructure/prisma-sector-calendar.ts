import type { Prisma, PrismaClient } from "@prisma/client";
import type { BusinessCalendar } from "@/shared/business-clock";
import { sectorBusinessCalendar, type SectorCalendarParts } from "../domain/sector-calendar";
import { loadBusinessCalendar } from "./prisma-calendar";

// A sector's calendar read from PostgreSQL (SPEC 2026-11-09-comunicacao-e-calendarios, 6.1 and 6.3; SF-252), with any
// client, also inside a request transaction.

type Client = PrismaClient | Prisma.TransactionClient;

const dayText = (day: Date) => day.toISOString().slice(0, 10);

/** The sector's own hours (or null) and holidays. */
export async function loadSectorCalendarParts(client: Client, sectorId: string): Promise<SectorCalendarParts> {
  const [hours, holidays] = await Promise.all([
    client.sectorCalendar.findUnique({ where: { sectorId }, select: { weekdays: true, startMinute: true, endMinute: true } }),
    client.sectorHoliday.findMany({ where: { sectorId }, orderBy: { day: "asc" }, select: { day: true, yearly: true } }),
  ]);
  return {
    hours: hours && { weekdays: [...hours.weekdays].sort((a, b) => a - b), startMinute: hours.startMinute, endMinute: hours.endMinute },
    holidays: holidays.map(({ day, yearly }) => ({ day: dayText(day), yearly })),
  };
}

/**
 * The calendar that counts a deadline: the organization's when `sectorId` is null, otherwise that sector's effective
 * calendar (its hours or the organization's, and both sets of holidays). `parts` comes back to keep the sector at the
 * opening only when it has its own calendar.
 */
export async function loadSectorBusinessCalendar(
  client: Client,
  sectorId: string | null,
): Promise<{ calendar: BusinessCalendar; parts: SectorCalendarParts | null }> {
  const [organization, parts] = await Promise.all([loadBusinessCalendar(client), sectorId ? loadSectorCalendarParts(client, sectorId) : null]);
  return { calendar: parts ? sectorBusinessCalendar(organization, parts) : organization, parts };
}
