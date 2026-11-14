import { describe, expect, it } from "vitest";
import { ValidationError } from "@/server/errors";
import { addClockTime, type BusinessCalendar } from "@/shared/business-clock";
import {
  calendarSectorAtOpening,
  hasOwnCalendar,
  parseSectorHoursInput,
  sectorBusinessCalendar,
  type SectorCalendarParts,
} from "@/modules/calendar";

// SPEC 2026-11-09-comunicacao-e-calendarios, part D, 6.1 and 6.3 (decisions K4, K8 and K9; SF-252; CA-CAL-01): a
// sector's effective calendar.

const ORGANIZATION: BusinessCalendar = {
  weekdays: [1, 2, 3, 4, 5],
  startMinute: 8 * 60,
  endMinute: 18 * 60,
  timeZone: "America/Sao_Paulo",
  holidays: [{ day: "2026-12-25", yearly: true }],
};

const NONE: SectorCalendarParts = { hours: null, holidays: [] };
const SECTOR = "11111111-1111-4111-8111-111111111111";

describe("a sector's effective calendar (6.1 and 6.3)", () => {
  it("is exactly the organization's when the sector has nothing of its own (CA-CAL-01)", () => {
    expect(hasOwnCalendar(NONE)).toBe(false);
    expect(sectorBusinessCalendar(ORGANIZATION, NONE)).toBe(ORGANIZATION);
  });

  it("uses the sector's days and window, always the organization's time zone, and both sets of holidays", () => {
    const parts: SectorCalendarParts = {
      hours: { weekdays: [6, 1, 2, 3, 4, 5], startMinute: 7 * 60, endMinute: 19 * 60 },
      holidays: [{ day: "2026-11-20", yearly: false }],
    };
    expect(hasOwnCalendar(parts)).toBe(true);
    expect(sectorBusinessCalendar(ORGANIZATION, parts)).toEqual({
      weekdays: [1, 2, 3, 4, 5, 6],
      startMinute: 420,
      endMinute: 1140,
      timeZone: "America/Sao_Paulo",
      holidays: [
        { day: "2026-12-25", yearly: true },
        { day: "2026-11-20", yearly: false },
      ],
    });
  });

  it("with holidays only, keeps the organization's hours and adds the sector's days off; a day in both counts once", () => {
    const parts: SectorCalendarParts = { hours: null, holidays: [{ day: "2026-12-25", yearly: true }, { day: "2026-12-24", yearly: true }] };
    const calendar = sectorBusinessCalendar(ORGANIZATION, parts);
    expect(calendar).toMatchObject({ weekdays: [1, 2, 3, 4, 5], startMinute: 480, endMinute: 1080 });
    expect(calendar.holidays).toEqual([
      { day: "2026-12-25", yearly: true },
      { day: "2026-12-24", yearly: true },
    ]);
  });

  it("changes the deadline: 4 business hours from Friday 16:00 end on Saturday with a Saturday window, on Monday without", () => {
    const friday = new Date("2026-11-13T19:00:00.000Z"); // 16:00 in São Paulo
    const organization = addClockTime(friday, 4 * 3_600_000, { kind: "business", calendar: ORGANIZATION });
    expect(organization.toISOString()).toBe("2026-11-16T13:00:00.000Z"); // Monday 10:00
    const saturdays = sectorBusinessCalendar(ORGANIZATION, { hours: { weekdays: [1, 2, 3, 4, 5, 6], startMinute: 480, endMinute: 1080 }, holidays: [] });
    expect(addClockTime(friday, 4 * 3_600_000, { kind: "business", calendar: saturdays }).toISOString()).toBe("2026-11-14T13:00:00.000Z");
    // A sector holiday on Monday pushes it to Tuesday.
    const holiday = sectorBusinessCalendar(ORGANIZATION, { hours: null, holidays: [{ day: "2026-11-16", yearly: false }] });
    expect(addClockTime(friday, 4 * 3_600_000, { kind: "business", calendar: holiday }).toISOString()).toBe("2026-11-17T13:00:00.000Z");
  });
});

describe("the calendar kept at the opening (6.3 item 3)", () => {
  const own: SectorCalendarParts = { hours: null, holidays: [{ day: "2026-11-20", yearly: false }] };

  it("is the sector's only in business hours and only when it has its own calendar; otherwise the organization's", () => {
    expect(calendarSectorAtOpening({ businessHours: true, sectorId: SECTOR, sector: own })).toBe(SECTOR);
    expect(calendarSectorAtOpening({ businessHours: true, sectorId: SECTOR, sector: NONE })).toBeNull();
    expect(calendarSectorAtOpening({ businessHours: false, sectorId: SECTOR, sector: own })).toBeNull();
  });
});

describe("parseSectorHoursInput (6.3 item 2)", () => {
  it("takes the same days and window as the organization's, without a time zone", () => {
    expect(parseSectorHoursInput({ weekdays: ["6", "1"], startTime: "07:30", endTime: "24:00" })).toEqual({ weekdays: [1, 6], startMinute: 450, endMinute: 1440 });
  });

  it("refuses no day, a start after the end and an invalid time, on the field that has it", () => {
    const issues = (input: Parameters<typeof parseSectorHoursInput>[0]) => {
      try {
        parseSectorHoursInput(input);
        return [];
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        return (error as ValidationError).issues.map(({ path, code }) => `${path.join(".")}:${code}`);
      }
    };
    expect(issues({ weekdays: [], startTime: "08:00", endTime: "18:00" })).toEqual(["weekdays:invalid_value"]);
    expect(issues({ weekdays: ["1"], startTime: "18:00", endTime: "08:00" })).toEqual(["endTime:invalid_value"]);
    expect(issues({ weekdays: ["1"], startTime: "8h", endTime: "18:00" })).toEqual(["startTime:invalid_format"]);
  });
});
