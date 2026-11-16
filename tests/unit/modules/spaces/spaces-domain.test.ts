import { describe, expect, it } from "vitest";
import { filterSpaces, spaceFilterOf, spaceSummary, type SpaceRecord } from "@/modules/spaces/domain/space";
import {
  agendaOf,
  canCancelBySector,
  canCancelOwn,
  canDecide,
  clockOfMinute,
  isHoliday,
  minuteOfClock,
  overlaps,
  periodOf,
  slotProblem,
  weekStartOf,
  weeklyDays,
  type ReservationRecord,
} from "@/modules/spaces/domain/reservation";
import { canCancelExam, canDecideExam, examTitle, holdsStudents, seatsPerSpace, suggestSpaces } from "@/modules/spaces/domain/exam";

// SPEC 2026-11-16-professores-e-tecnicos, parts C to E (SF-288 to SF-292): the rules without a database.

const ZONE = "America/Sao_Paulo";
const NOW = new Date("2026-11-16T12:00:00.000Z"); // Monday, 09:00 in São Paulo.
const rules = { now: NOW, timeZone: ZONE, holidays: [{ day: "2026-11-20", yearly: false }, { day: "2026-12-25", yearly: true }] };

function space(overrides: Partial<SpaceRecord>): SpaceRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Sala",
    kind: "CLASSROOM",
    sectorId: "00000000-0000-4000-8000-0000000000aa",
    sectorName: "Central",
    capacity: 40,
    location: "",
    resources: "",
    confirmation: "SECTOR",
    isActive: true,
    ...overrides,
  };
}

function reservation(overrides: Partial<ReservationRecord>): ReservationRecord {
  return {
    id: "r1",
    spaceId: "s1",
    spaceName: "Sala 101",
    sectorId: "x",
    sectorName: "Central",
    requesterId: "p1",
    requesterName: "Rui",
    purpose: "CLASS",
    description: "Cálculo I",
    attendees: 30,
    status: "CONFIRMED",
    seriesId: null,
    examRequestId: null,
    decisionNote: null,
    cancelNote: null,
    ...periodOf("2026-11-18", 8 * 60, 10 * 60, ZONE),
    ...overrides,
  };
}

describe("the spaces (part C; P5)", () => {
  it("lists only active spaces, filtered by kind, minimum capacity and sector, by sector and name", () => {
    const spaces = [
      space({ id: "a", name: "Lab 2", kind: "LABORATORY", capacity: 20, sectorName: "B" }),
      space({ id: "b", name: "Sala 2", capacity: 60, sectorName: "A" }),
      space({ id: "c", name: "Sala 1", capacity: 30, sectorName: "A" }),
      space({ id: "d", name: "Antiga", isActive: false, sectorName: "A" }),
    ];
    expect(filterSpaces(spaces, { kind: null, minCapacity: null, sectorId: null }).map(({ id }) => id)).toEqual(["c", "b", "a"]);
    expect(filterSpaces(spaces, { kind: "CLASSROOM", minCapacity: 40, sectorId: null }).map(({ id }) => id)).toEqual(["b"]);
    expect(filterSpaces(spaces, { kind: "LABORATORY", minCapacity: null, sectorId: "nenhum" })).toEqual([]);
  });

  it("reads the filters from the address, ignoring what is not valid", () => {
    expect(spaceFilterOf({ kind: "LABORATORY", capacity: "25", sector: "00000000-0000-4000-8000-0000000000AA" })).toEqual({
      kind: "LABORATORY",
      minCapacity: 25,
      sectorId: "00000000-0000-4000-8000-0000000000aa",
    });
    expect(spaceFilterOf({ kind: "POOL", capacity: "0", sector: "x" })).toEqual({ kind: null, minCapacity: null, sectorId: null });
    expect(spaceSummary({ name: "Sala 101", kind: "CLASSROOM", capacity: 1 })).toBe("Sala 101 · Sala de aula · 1 lugar");
  });
});

describe("the time of a reservation (P7)", () => {
  it("reads and writes the clock", () => {
    expect(minuteOfClock("07:15")).toBe(435);
    expect(minuteOfClock("24:00")).toBeNull();
    expect(minuteOfClock("7:15")).toBeNull();
    expect(clockOfMinute(1380)).toBe("23:00");
  });

  it("accepts 07:00 to 23:00, in 15-minute steps, from 30 minutes to 8 hours", () => {
    expect(slotProblem("2026-11-17", 7 * 60, 8 * 60, rules)).toBeNull();
    expect(slotProblem("2026-11-17", 22 * 60 + 30, 23 * 60, rules)).toBeNull();
    expect(slotProblem("2026-11-17", 6 * 60 + 45, 8 * 60, rules)).toBe("outside_hours");
    expect(slotProblem("2026-11-17", 22 * 60, 23 * 60 + 15, rules)).toBe("outside_hours");
    expect(slotProblem("2026-11-17", 8 * 60 + 10, 9 * 60, rules)).toBe("step");
    expect(slotProblem("2026-11-17", 8 * 60, 8 * 60 + 15, rules)).toBe("too_short");
    expect(slotProblem("2026-11-17", 8 * 60, 16 * 60 + 15, rules)).toBe("too_long");
    expect(slotProblem("2026-11-17", 10 * 60, 9 * 60, rules)).toBe("outside_hours");
  });

  it("refuses a holiday (also a yearly one) and the past", () => {
    expect(slotProblem("2026-11-20", 8 * 60, 9 * 60, rules)).toBe("holiday");
    expect(slotProblem("2027-12-25", 8 * 60, 9 * 60, rules)).toBe("holiday");
    expect(isHoliday("2027-11-20", rules.holidays)).toBe(false);
    // Today at 08:00 already passed (it is 09:00); today at 10:00 has not.
    expect(slotProblem("2026-11-16", 8 * 60, 9 * 60, rules)).toBe("past");
    expect(slotProblem("2026-11-16", 10 * 60, 11 * 60, rules)).toBeNull();
  });
});

describe("the weekly series (P8)", () => {
  it("repeats on the same weekday until the last day, up to 26 dates", () => {
    expect(weeklyDays("2026-11-17", "2026-12-01")).toEqual(["2026-11-17", "2026-11-24", "2026-12-01"]);
    expect(weeklyDays("2026-11-17", "2026-11-30")).toEqual(["2026-11-17", "2026-11-24"]);
    expect(weeklyDays("2026-11-17", "2026-11-17")).toEqual(["2026-11-17"]);
    expect(weeklyDays("2026-11-17", "2026-11-10")).toBeNull();
    expect(weeklyDays("2026-01-06", "2026-06-30")).toHaveLength(26);
    expect(weeklyDays("2026-01-06", "2026-07-07")).toBeNull();
  });
});

describe("overlaps and the agenda (P11 and P12)", () => {
  it("half-open periods: one may start when the other ends", () => {
    const morning = periodOf("2026-11-18", 8 * 60, 10 * 60, ZONE);
    expect(overlaps(morning, periodOf("2026-11-18", 10 * 60, 11 * 60, ZONE))).toBe(false);
    expect(overlaps(morning, periodOf("2026-11-18", 9 * 60 + 45, 11 * 60, ZONE))).toBe(true);
    expect(overlaps(morning, periodOf("2026-11-18", 7 * 60, 12 * 60, ZONE))).toBe(true);
  });

  it("shows the week from Monday, the holding reservations by time, with who and why", () => {
    expect(weekStartOf("2026-11-22")).toBe("2026-11-16");
    expect(weekStartOf("2026-11-16")).toBe("2026-11-16");
    const days = agendaOf(
      [
        reservation({ id: "b", ...periodOf("2026-11-18", 14 * 60, 15 * 60, ZONE), requesterName: "Teo" }),
        reservation({ id: "a" }),
        reservation({ id: "c", status: "CANCELLED" }),
        reservation({ id: "d", status: "PENDING", ...periodOf("2026-11-20", 8 * 60, 9 * 60, ZONE) }),
      ],
      "2026-11-16",
      ZONE,
    );
    expect(days.map(({ day }) => day)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(days[2]!.entries.map(({ start, end, requesterName }) => `${start}-${end} ${requesterName}`)).toEqual(["08:00-10:00 Rui", "14:00-15:00 Teo"]);
    expect(days[4]!.entries).toEqual([expect.objectContaining({ status: "PENDING", description: "Cálculo I" })]);
  });
});

describe("who may act (P10)", () => {
  it("the person cancels a holding reservation until it starts; the team decides a pending one and cancels until it ends", () => {
    const before = new Date("2026-11-18T10:00:00.000Z");
    const during = new Date("2026-11-18T12:00:00.000Z");
    expect(canCancelOwn(reservation({}), before)).toBe(true);
    expect(canCancelOwn(reservation({}), during)).toBe(false);
    expect(canCancelOwn(reservation({ status: "REFUSED" }), before)).toBe(false);
    expect(canDecide(reservation({ status: "PENDING" }), before)).toBe(true);
    expect(canDecide(reservation({ status: "CONFIRMED" }), before)).toBe(false);
    expect(canCancelBySector(reservation({}), during)).toBe(true);
    expect(canCancelBySector(reservation({}), new Date("2026-11-18T14:00:00.000Z"))).toBe(false);
  });
});

describe("the exams (P13; rule 8.2)", () => {
  const candidates = [
    { id: "1", name: "Sala 101", capacity: 40 },
    { id: "2", name: "Sala 102", capacity: 30 },
    { id: "3", name: "Sala 103", capacity: 25 },
    { id: "4", name: "Auditório", capacity: 120 },
  ];

  it("suggests the fewest spaces, then the fewest empty places", () => {
    expect(suggestSpaces(candidates, 35)!.map(({ name }) => name)).toEqual(["Sala 101"]);
    expect(suggestSpaces(candidates, 100)!.map(({ name }) => name)).toEqual(["Auditório"]);
    expect(suggestSpaces(candidates.slice(0, 3), 55)!.map(({ name }) => name)).toEqual(["Sala 102", "Sala 103"]);
    expect(suggestSpaces(candidates.slice(0, 3), 70)!.map(({ name }) => name)).toEqual(["Sala 101", "Sala 102"]);
    expect(suggestSpaces(candidates.slice(0, 3), 90)!.map(({ name }) => name)).toEqual(["Sala 101", "Sala 102", "Sala 103"]);
    expect(suggestSpaces(candidates.slice(0, 3), 96)).toBeNull();
    expect(suggestSpaces([], 1)).toBeNull();
  });

  it("splits the students among the spaces and checks the total", () => {
    const chosen = candidates.slice(0, 2);
    expect(holdsStudents(chosen, 70)).toBe(true);
    expect(holdsStudents(chosen, 71)).toBe(false);
    expect([...seatsPerSpace(chosen, 55).entries()]).toEqual([["1", 40], ["2", 15]]);
    expect(examTitle({ course: "Cálculo I", classGroup: "A" })).toBe("Cálculo I — A");
  });

  it("the professor cancels until the exam; the team decides a pending one", () => {
    const exam = { status: "PENDING" as const, startsAt: new Date("2026-11-20T11:00:00.000Z") };
    expect(canCancelExam(exam, NOW)).toBe(true);
    expect(canCancelExam({ ...exam, status: "ALLOCATED" }, NOW)).toBe(true);
    expect(canCancelExam({ ...exam, status: "REFUSED" }, NOW)).toBe(false);
    expect(canDecideExam(exam, NOW)).toBe(true);
    expect(canDecideExam({ ...exam, status: "ALLOCATED" }, NOW)).toBe(false);
    expect(canDecideExam(exam, new Date("2026-11-21T00:00:00.000Z"))).toBe(false);
  });
});
