import { CALENDAR_CLOCK, type SlaClock } from "@/shared/business-clock";
import { hasOwnCalendar } from "@/modules/calendar";
import type { SlaSchedule } from "../domain/sla";
import type { RequestTransaction } from "./ports";

// The clock of a request (SPEC 2026-11-03-pausa-sla-calendario, 5.2): the calendar is read in the
// same transaction, and only for requests in business hours.

export async function requestClock(
  transaction: RequestTransaction,
  businessHours: boolean | undefined,
  /** SPEC 2026-11-09-comunicacao-e-calendarios, 6.3 item 3: the sector whose calendar the request keeps; null = the organization's. */
  calendarSectorId?: string | null,
): Promise<SlaClock> {
  if (!businessHours) return CALENDAR_CLOCK;
  if (calendarSectorId && transaction.loadSectorBusinessCalendar) {
    return { kind: "business", calendar: (await transaction.loadSectorBusinessCalendar(calendarSectorId)).calendar };
  }
  return { kind: "business", calendar: await transaction.loadBusinessCalendar() };
}

/**
 * SPEC 2026-11-09-comunicacao-e-calendarios, 6.1 item 3 and 6.3 item 3 (decision K4; SF-254): the clock of a request
 * opened now in the sector that receives it, and which calendar it keeps: the sector's (its id) when the sector has
 * hours or holidays of its own, the organization's (null) otherwise. In calendar hours nothing is read (CA-CAL-01).
 */
export async function openingClock(
  transaction: RequestTransaction,
  businessHours: boolean,
  sectorId: string,
): Promise<{ clock: SlaClock; calendarSectorId: string | null }> {
  if (!businessHours) return { clock: CALENDAR_CLOCK, calendarSectorId: null };
  if (!transaction.loadSectorBusinessCalendar) {
    return { clock: { kind: "business", calendar: await transaction.loadBusinessCalendar() }, calendarSectorId: null };
  }
  const { calendar, parts } = await transaction.loadSectorBusinessCalendar(sectorId);
  return { clock: { kind: "business", calendar }, calendarSectorId: parts && hasOwnCalendar(parts) ? sectorId : null };
}

/**
 * Columns to write for a schedule. "Due soon" goes only in business hours: in calendar hours the
 * database trigger computes it (SPEC de SLA, SF-068), so those writes stay as they were.
 */
export function scheduleColumns(
  schedule: SlaSchedule | null,
  businessHours: boolean | undefined,
): { dueAt: Date | null; dueSoonAt?: Date | null } {
  return businessHours
    ? { dueAt: schedule?.dueAt ?? null, dueSoonAt: schedule?.dueSoonAt ?? null }
    : { dueAt: schedule?.dueAt ?? null };
}
