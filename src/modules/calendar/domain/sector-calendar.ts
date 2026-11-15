import type { BusinessCalendar, Holiday } from "@/shared/business-clock";
import { parseCalendarInput, type CalendarInput } from "./calendar-config";

// The calendar of a sector (SPEC 2026-11-09-comunicacao-e-calendarios, part D, 6.1 and 6.3; decisions K4, K8 and K9;
// SF-252). Own business hours and own holidays are independent (clarified with the responsible person): a sector may
// only add holidays and keep the organization's hours. The organization's holidays always apply, and the time zone is
// always the organization's (6.3 item 2).

/** A sector's own window: the same values as the organization's, without a time zone. */
export interface SectorHours {
  weekdays: number[];
  startMinute: number;
  endMinute: number;
}

export interface SectorCalendarParts {
  /** Null when the sector follows the organization's hours. */
  hours: SectorHours | null;
  holidays: readonly Holiday[];
}

/** 6.3 item 4: a sector "has its own calendar" when it has its own hours or any holiday of its own. */
export function hasOwnCalendar(sector: SectorCalendarParts): boolean {
  return sector.hours !== null || sector.holidays.length > 0;
}

/**
 * The calendar that counts a deadline in the sector: its hours when it has them, otherwise the organization's; the
 * organization's time zone; the organization's holidays plus the sector's (a day in both counts once). Without hours
 * and holidays of its own, exactly the organization's calendar (CA-CAL-01), so later changes of it apply too.
 */
export function sectorBusinessCalendar(organization: BusinessCalendar, sector: SectorCalendarParts): BusinessCalendar {
  if (!hasOwnCalendar(sector)) return organization;
  const seen = new Set<string>();
  const holidays: Holiday[] = [];
  for (const holiday of [...organization.holidays, ...sector.holidays]) {
    const key = `${holiday.day}:${holiday.yearly}`;
    if (seen.has(key)) continue;
    seen.add(key);
    holidays.push({ day: holiday.day, yearly: holiday.yearly });
  }
  const hours = sector.hours ?? organization;
  return {
    weekdays: [...hours.weekdays].sort((a, b) => a - b),
    startMinute: hours.startMinute,
    endMinute: hours.endMinute,
    timeZone: organization.timeZone,
    holidays,
  };
}

/**
 * 6.3 item 3: which calendar a request opened now keeps: the sector's (its id) when the sector has one of its own, or
 * the organization's (null). Only for a deadline in business hours; in calendar hours there is no calendar at all.
 */
export function calendarSectorAtOpening(input: { businessHours: boolean; sectorId: string; sector: SectorCalendarParts }): string | null {
  return input.businessHours && hasOwnCalendar(input.sector) ? input.sectorId : null;
}

/** 6.3 item 2: the same checks as the organization's calendar (days, "HH:MM" window, start before end), no time zone. */
export function parseSectorHoursInput(input: Omit<CalendarInput, "timeZone">): SectorHours {
  // The organization's rules, with a time zone that is always valid: only the days and the window can be refused.
  const { weekdays, startMinute, endMinute } = parseCalendarInput({ ...input, timeZone: "UTC" });
  return { weekdays, startMinute, endMinute };
}

/** 6.3 item 1 (decision K9): the administrator configures any sector; a manager, only their own. */
export function canManageSectorCalendar(actor: { role: string; sectorId: string | null }, sectorId: string): boolean {
  return actor.role === "ADMIN" || (actor.role === "MANAGER" && actor.sectorId === sectorId);
}
