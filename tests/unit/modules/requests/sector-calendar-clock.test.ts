import { describe, expect, it, vi } from "vitest";
import type { BusinessCalendar } from "@/shared/business-clock";
import { openingClock, requestClock } from "@/modules/requests/application/sla-clock";
import type { RequestTransaction } from "@/modules/requests/application/ports";
import type { SectorCalendarParts } from "@/modules/calendar";

// SPEC 2026-11-09-comunicacao-e-calendarios, 6.1 item 3 and 6.3 item 3 (decision K4; SF-254; CA-CAL-01 and CA-CAL-03).

const SECTOR = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION: BusinessCalendar = { weekdays: [1, 2, 3, 4, 5], startMinute: 480, endMinute: 1080, timeZone: "America/Sao_Paulo", holidays: [] };
const SATURDAYS: BusinessCalendar = { ...ORGANIZATION, weekdays: [1, 2, 3, 4, 5, 6] };

function transaction(parts: SectorCalendarParts | null, withSector = true) {
  const double = {
    loadBusinessCalendar: vi.fn(async () => ORGANIZATION),
    // Like the real one: the organization's calendar itself when the sector has nothing of its own.
    ...(withSector
      ? { loadSectorBusinessCalendar: vi.fn(async () => ({ calendar: parts && (parts.hours || parts.holidays.length > 0) ? SATURDAYS : ORGANIZATION, parts })) }
      : {}),
  };
  return double as unknown as RequestTransaction & typeof double;
}

describe("openingClock (6.3 item 3)", () => {
  it("in calendar hours reads no calendar and keeps none (CA-CAL-01)", async () => {
    const target = transaction({ hours: null, holidays: [{ day: "2026-11-20", yearly: false }] });
    expect(await openingClock(target, false, SECTOR)).toEqual({ clock: { kind: "calendar" }, calendarSectorId: null });
    expect(target.loadBusinessCalendar).not.toHaveBeenCalled();
    expect(target.loadSectorBusinessCalendar).not.toHaveBeenCalled();
  });

  it("keeps the sector when it has hours or holidays of its own, with its calendar", async () => {
    const own = transaction({ hours: { weekdays: [1, 2, 3, 4, 5, 6], startMinute: 480, endMinute: 1080 }, holidays: [] });
    expect(await openingClock(own, true, SECTOR)).toEqual({ clock: { kind: "business", calendar: SATURDAYS }, calendarSectorId: SECTOR });
    expect(own.loadSectorBusinessCalendar).toHaveBeenCalledWith(SECTOR);
    const holidaysOnly = transaction({ hours: null, holidays: [{ day: "2026-11-20", yearly: false }] });
    expect((await openingClock(holidaysOnly, true, SECTOR)).calendarSectorId).toBe(SECTOR);
  });

  it("keeps the organization's when the sector has nothing of its own, or with an older double", async () => {
    expect(await openingClock(transaction({ hours: null, holidays: [] }), true, SECTOR)).toEqual({
      clock: { kind: "business", calendar: ORGANIZATION },
      calendarSectorId: null,
    });
    const older = transaction(null, false);
    expect(await openingClock(older, true, SECTOR)).toEqual({ clock: { kind: "business", calendar: ORGANIZATION }, calendarSectorId: null });
  });
});

describe("requestClock with the calendar kept (6.3 item 3)", () => {
  it("uses the kept sector's calendar, the organization's without one, and none in calendar hours", async () => {
    const target = transaction({ hours: { weekdays: [6], startMinute: 480, endMinute: 1080 }, holidays: [] });
    expect(await requestClock(target, true, SECTOR)).toEqual({ kind: "business", calendar: SATURDAYS });
    expect(await requestClock(target, true, null)).toEqual({ kind: "business", calendar: ORGANIZATION });
    expect(await requestClock(target, true)).toEqual({ kind: "business", calendar: ORGANIZATION });
    expect(await requestClock(target, false, SECTOR)).toEqual({ kind: "calendar" });
    expect(target.loadSectorBusinessCalendar).toHaveBeenCalledTimes(1);
  });
});
