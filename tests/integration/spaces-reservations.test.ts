import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainSector, createDomainUser } from "./domain-fixtures";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { grantPermission } from "@/modules/permissions";
import {
  ReservationOverlapError,
  ReservationProblemsError,
  allocateExam,
  cancelMyExam,
  cancelMyReservation,
  createReservation,
  createSpace,
  decideReservation,
  getSpaceAgenda,
  listMyExams,
  listReservableSpaces,
  listSectorExams,
  listSectorReservations,
  listSpacesForEditor,
  refuseExam,
  requestExam,
  setSpaceActive,
  updateSpace,
} from "@/modules/spaces";
import { NotFoundError, ValidationError } from "@/server/errors";
import { addDays, isoWeekdayOf, zonedDayOf } from "@/shared/time";

// SPEC 2026-11-16-professores-e-tecnicos, parts C to E (SF-288 to SF-292; CA-PRT-06 to 12 by the rules).

type Actor = { id: string; name: string; role: Role; sectorId: string | null; isActive: boolean };
const actAs = (actor: Actor) => session.getCurrentUser.mockResolvedValue({ ...actor, email: `${actor.id}@example.test` });

/** A Tuesday at least four weeks ahead, so every test day is in the future and not today. */
function futureTuesday(): string {
  let day = addDays(zonedDayOf(new Date()), 28);
  while (isoWeekdayOf(day) !== 2) day = addDays(day, 1);
  return day;
}

async function scenario() {
  const sector = await createDomainSector();
  const other = await createDomainSector();
  const admin = await createDomainUser({ role: "ADMIN" });
  const attendant = await createDomainUser({ role: "ATTENDANT", sectorId: sector.id });
  const manager = await createDomainUser({ role: "MANAGER", sectorId: sector.id });
  const outsider = await createDomainUser({ role: "ATTENDANT", sectorId: other.id });
  const professor = await createDomainUser({ role: "REQUESTER" });
  await prisma.user.update({ where: { id: professor.id }, data: { requesterKind: "PROFESSOR" } });
  const technician = await createDomainUser({ role: "REQUESTER" });
  await prisma.user.update({ where: { id: technician.id }, data: { requesterKind: "TECHNICIAN" } });
  actAs(admin);
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const room = await createSpace({ name: `Sala 101 ${stamp}`, kind: "CLASSROOM", sectorId: sector.id, capacity: 40 }, prisma);
  const lab = await createSpace({ name: `Lab 1 ${stamp}`, kind: "LABORATORY", sectorId: sector.id, capacity: 25, confirmation: "AUTOMATIC" }, prisma);
  const small = await createSpace({ name: `Sala 102 ${stamp}`, kind: "CLASSROOM", sectorId: sector.id, capacity: 30 }, prisma);
  return { sector, other, admin, attendant, manager, outsider, professor, technician, room, lab, small, stamp };
}

const reservationInput = (spaceId: string, day: string, start = "08:00", end = "10:00", extra: Record<string, unknown> = {}) => ({
  spaceId,
  purpose: "CLASS",
  description: "Cálculo I — turma A",
  attendees: "30",
  day,
  start,
  end,
  ...extra,
});

describe("the registration of spaces (part C item 1; CA-PRT-06)", () => {
  it("the administrator creates, changes, deactivates and reactivates, everything audited", async () => {
    const { admin, room, sector, stamp } = await scenario();
    actAs(admin);
    await updateSpace(room.id, { name: `Sala 101-A ${stamp}`, kind: "CLASSROOM", sectorId: sector.id, capacity: "45", location: "Bloco A" }, prisma);
    await setSpaceActive(room.id, false, prisma);
    await setSpaceActive(room.id, true, prisma);
    const entries = await prisma.auditEntry.findMany({ where: { entityId: room.id }, orderBy: { occurredAt: "asc" }, select: { action: true, entityType: true } });
    expect(entries.map(({ action }) => action)).toEqual(["CREATED", "UPDATED", "DEACTIVATED", "REACTIVATED"]);
    expect(entries.every(({ entityType }) => entityType === "SPACE")).toBe(true);
    // The name is unique in the sector; the capacity is 1 to 1,000.
    await expect(createSpace({ name: `Sala 101-A ${stamp}`, kind: "CLASSROOM", sectorId: sector.id, capacity: 10 }, prisma)).rejects.toThrow();
    await expect(createSpace({ name: `Enorme ${stamp}`, kind: "AUDITORIUM", sectorId: sector.id, capacity: 1001 }, prisma)).rejects.toBeInstanceOf(ValidationError);
  });

  it("a holder of \"Gerir serviços do setor\" manages only their sector's spaces (P6)", async () => {
    const { admin, attendant, other, room, stamp } = await scenario();
    actAs(admin);
    await grantPermission({ userId: attendant.id, permission: "SECTOR_SERVICES" }, prisma);
    actAs(attendant);
    const view = await listSpacesForEditor(prisma);
    expect(view.sectorId).toBe(attendant.sectorId);
    expect(view.spaces.every((space) => space.sectorId === attendant.sectorId)).toBe(true);
    await expect(createSpace({ name: `Fora ${stamp}`, kind: "CLASSROOM", sectorId: other.id, capacity: 10 }, prisma)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createSpace({ name: `Dentro ${stamp}`, kind: "CLASSROOM", sectorId: attendant.sectorId!, capacity: 10 }, prisma)).resolves.toBeTruthy();
    await expect(updateSpace(room.id, { name: room.id, kind: "CLASSROOM", sectorId: other.id, capacity: 10 }, prisma)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("the page \"Espaços\" and the agenda (part C item 2; CA-PRT-07)", () => {
  it("lists the active spaces with the filters, and the week shows who reserved and why to everyone", async () => {
    const { admin, professor, technician, room, lab, small } = await scenario();
    actAs(admin);
    await setSpaceActive(small.id, false, prisma);
    actAs(professor);
    const listed = await listReservableSpaces({ kind: "CLASSROOM", capacity: "35" }, prisma);
    expect(listed.spaces.map(({ id }) => id)).toContain(room.id);
    expect(listed.spaces.map(({ id }) => id)).not.toContain(lab.id);
    expect((await listReservableSpaces({}, prisma)).spaces.map(({ id }) => id)).not.toContain(small.id);

    const day = futureTuesday();
    await createReservation(reservationInput(room.id, day), prisma);
    actAs(technician);
    const agenda = await getSpaceAgenda(room.id, day, prisma);
    const entries = agenda.days.flatMap(({ entries }) => entries);
    expect(entries).toEqual([expect.objectContaining({ start: "08:00", end: "10:00", requesterName: professor.name, description: "Cálculo I — turma A" })]);
    await expect(getSpaceAgenda(small.id, day, prisma)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("reserving (part D; CA-PRT-08 and 09)", () => {
  it("a sector's space waits for the team, an automatic one is confirmed; the team hears about the pending one", async () => {
    const { professor, room, lab, attendant, manager } = await scenario();
    actAs(professor);
    const day = futureTuesday();
    await expect(createReservation(reservationInput(room.id, day), prisma)).resolves.toMatchObject({ status: "PENDING" });
    await expect(createReservation(reservationInput(lab.id, day, "08:00", "10:00", { attendees: "20" }), prisma)).resolves.toMatchObject({ status: "CONFIRMED" });
    const notices = await prisma.requestNotification.findMany({ where: { type: "reservation.pending" }, select: { recipientId: true } });
    expect(notices.map(({ recipientId }) => recipientId).sort()).toEqual([attendant.id, manager.id].sort());
  });

  it("checks the capacity, the hours, the steps and the past", async () => {
    const { professor, room } = await scenario();
    actAs(professor);
    const day = futureTuesday();
    await expect(createReservation(reservationInput(room.id, day, "08:00", "10:00", { attendees: "41" }), prisma)).rejects.toBeInstanceOf(ValidationError);
    const problemOf = async (input: Record<string, unknown>) => {
      try {
        await createReservation(input, prisma);
        return null;
      } catch (error) {
        return error instanceof ReservationProblemsError ? error.problems.map(({ problem }) => problem) : String(error);
      }
    };
    expect(await problemOf(reservationInput(room.id, day, "06:30", "08:00"))).toEqual(["outside_hours"]);
    expect(await problemOf(reservationInput(room.id, day, "08:10", "09:00"))).toEqual(["step"]);
    expect(await problemOf(reservationInput(room.id, "2020-01-07"))).toEqual(["past"]);
  });

  it("a weekly series is all or nothing: one busy date or holiday and nothing is saved, with the dates listed (P8)", async () => {
    const { admin, professor, technician, room, sector } = await scenario();
    const first = futureTuesday();
    const third = addDays(first, 14);
    actAs(technician);
    await createReservation(reservationInput(room.id, third, "09:00", "11:00", { attendees: "5" }), prisma);
    await prisma.sectorHoliday.create({ data: { sectorId: sector.id, day: new Date(`${addDays(first, 21)}T00:00:00.000Z`), name: "Feriado", yearly: false, createdById: admin.id } });

    actAs(professor);
    const error = await createReservation(reservationInput(room.id, first, "08:00", "10:00", { repeatUntil: addDays(first, 28) }), prisma).catch((caught) => caught);
    expect(error).toBeInstanceOf(ReservationProblemsError);
    expect((error as ReservationProblemsError).problems).toEqual([
      { day: third, problem: "conflict" },
      { day: addDays(first, 21), problem: "holiday" },
    ]);
    await expect(prisma.spaceReservation.count({ where: { requesterId: professor.id } })).resolves.toBe(0);

    // At another time the busy week is free, but the holiday still stops the whole series; until the third week, the
    // series is saved: three weekly dates, one series.
    const saved = await createReservation(reservationInput(room.id, first, "07:00", "08:00", { repeatUntil: addDays(first, 28) }), prisma).catch(
      (caught) => caught,
    );
    expect(saved).toBeInstanceOf(ReservationProblemsError);
    const ok = await createReservation(reservationInput(room.id, first, "07:00", "08:00", { repeatUntil: addDays(first, 14) }), prisma);
    expect(ok.ids).toHaveLength(3);
    const series = await prisma.spaceReservation.findMany({ where: { id: { in: ok.ids } }, select: { seriesId: true } });
    expect(new Set(series.map(({ seriesId }) => seriesId)).size).toBe(1);
  });

  it("the database refuses an overlap even when two people reserve at the same instant, and a refusal frees the time (P11)", async () => {
    const { professor, technician, room, attendant } = await scenario();
    const day = futureTuesday();
    const attempt = async (who: typeof professor) => {
      actAs(who);
      return createReservation(reservationInput(room.id, day, "14:00", "16:00", { attendees: "10" }), prisma);
    };
    const results = await Promise.allSettled([attempt(professor), attempt(technician), attempt(professor), attempt(technician)]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    for (const result of results.filter((item): item is PromiseRejectedResult => item.status === "rejected")) {
      expect(
        result.reason instanceof ReservationOverlapError || result.reason instanceof ReservationProblemsError || result.reason?.code === "CONFLICT",
      ).toBe(true);
    }
    const holding = await prisma.spaceReservation.findMany({ where: { spaceId: room.id, status: { in: ["PENDING", "CONFIRMED"] } } });
    expect(holding).toHaveLength(1);

    // Written straight to the table, the overlap is refused by the exclusion constraint.
    await expect(
      prisma.spaceReservation.create({
        data: { spaceId: room.id, requesterId: professor.id, purpose: "OTHER", description: "direto", attendees: 1, startsAt: holding[0]!.startsAt, endsAt: holding[0]!.endsAt },
      }),
    ).rejects.toThrow(/SpaceReservation_no_overlap|23P01|exclusion/i);

    actAs(attendant);
    await decideReservation(holding[0]!.id, "refuse", "Sala em manutenção", prisma);
    actAs(technician);
    await expect(createReservation(reservationInput(room.id, day, "14:00", "16:00", { attendees: "10" }), prisma)).resolves.toMatchObject({ status: "PENDING" });
  });
});

describe("the team and the person (part D items 2 and 3; CA-PRT-10)", () => {
  it("the team confirms, refuses with the reason and cancels with the reason; another sector does not act; the person is told", async () => {
    const { professor, room, attendant, manager, outsider } = await scenario();
    const day = futureTuesday();
    actAs(professor);
    const first = (await createReservation(reservationInput(room.id, day, "08:00", "09:00"), prisma)).ids[0]!;
    const second = (await createReservation(reservationInput(room.id, day, "09:00", "10:00"), prisma)).ids[0]!;

    actAs(outsider);
    await expect(decideReservation(first, "confirm", "", prisma)).rejects.toBeInstanceOf(NotFoundError);
    actAs(attendant);
    expect((await listSectorReservations(prisma)).pending.map(({ id }) => id)).toEqual([first, second]);
    await decideReservation(first, "confirm", "", prisma);
    await expect(decideReservation(second, "refuse", "  ", prisma)).rejects.toBeInstanceOf(ValidationError);
    await decideReservation(second, "refuse", "Conflito com evento", prisma);
    actAs(manager);
    await expect(decideReservation(first, "cancel", "", prisma)).rejects.toBeInstanceOf(ValidationError);
    await decideReservation(first, "cancel", "Reforma da sala", prisma);

    const notices = await prisma.requestNotification.findMany({ where: { recipientId: professor.id }, orderBy: { type: "asc" }, select: { type: true } });
    expect(notices.map(({ type }) => type)).toEqual(["reservation.cancelled", "reservation.confirmed", "reservation.refused"]);
    const stored = await prisma.spaceReservation.findMany({ where: { id: { in: [first, second] } }, select: { id: true, status: true, decisionNote: true, cancelNote: true } });
    expect(Object.fromEntries(stored.map(({ id, status }) => [id, status]))).toEqual({ [first]: "CANCELLED", [second]: "REFUSED" });
  });

  it("the person cancels one date or the following ones of the series, until they start", async () => {
    const { technician, room } = await scenario();
    const day = futureTuesday();
    actAs(technician);
    const { ids } = await createReservation(reservationInput(room.id, day, "18:00", "19:00", { attendees: "8", repeatUntil: addDays(day, 21) }), prisma);
    expect(ids).toHaveLength(4);
    await expect(cancelMyReservation(ids[1], { scope: "one" }, prisma)).resolves.toEqual({ cancelled: 1 });
    await expect(cancelMyReservation(ids[2], { scope: "series", note: "Fim do curso" }, prisma)).resolves.toEqual({ cancelled: 2 });
    const statuses = await prisma.spaceReservation.findMany({ where: { id: { in: ids } }, orderBy: { startsAt: "asc" }, select: { status: true } });
    expect(statuses.map(({ status }) => status)).toEqual(["PENDING", "CANCELLED", "CANCELLED", "CANCELLED"]);
    await expect(cancelMyReservation(ids[0], { scope: "one" }, prisma, new Date(`${addDays(day, 1)}T12:00:00.000Z`))).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("exam allocations (part E; CA-PRT-11 and 12)", () => {
  async function examScenario() {
    const base = await scenario();
    actAs(base.admin);
    const big = await createSpace({ name: `Sala 103 ${base.stamp}`, kind: "CLASSROOM", sectorId: base.sector.id, capacity: 25 }, prisma);
    actAs(base.professor);
    const day = futureTuesday();
    const { id } = await requestExam(
      { sectorId: base.sector.id, course: "Cálculo I", classGroup: "A", day, start: "10:00", end: "12:00", students: "60", spaceKind: "CLASSROOM", notes: "Uma pessoa cadeirante" },
      prisma,
    );
    return { ...base, big, day, examId: id };
  }

  it("the team sees the free spaces and the suggestion, allocates two that hold the students, and the professor is told", async () => {
    const { attendant, manager, professor, examId, room, small, big, technician, day } = await examScenario();
    const pendingNotices = await prisma.requestNotification.findMany({ where: { type: "exam.pending" }, select: { recipientId: true } });
    expect(pendingNotices.map(({ recipientId }) => recipientId).sort()).toEqual([attendant.id, manager.id].sort());

    // A reservation in "Sala 102" at that time leaves it out of the candidates.
    actAs(technician);
    await createReservation(reservationInput(small.id, day, "11:00", "12:00", { attendees: "5" }), prisma);

    actAs(attendant);
    const { pending } = await listSectorExams(prisma);
    const item = pending.find(({ exam }) => exam.id === examId)!;
    expect(item.candidates.map(({ id }) => id).sort()).toEqual([room.id, big.id].sort());
    expect(item.suggestion!.map(({ id }) => id).sort()).toEqual([room.id, big.id].sort());

    await expect(allocateExam(examId, [room.id], prisma)).rejects.toBeInstanceOf(ValidationError);
    await expect(allocateExam(examId, [room.id, small.id], prisma)).rejects.toBeInstanceOf(ReservationProblemsError);
    await allocateExam(examId, [room.id, big.id], prisma);
    const reservations = await prisma.spaceReservation.findMany({ where: { examRequestId: examId }, orderBy: { attendees: "desc" }, select: { status: true, purpose: true, attendees: true, requesterId: true } });
    expect(reservations).toEqual([
      { status: "CONFIRMED", purpose: "EXAM", attendees: 40, requesterId: professor.id },
      { status: "CONFIRMED", purpose: "EXAM", attendees: 20, requesterId: professor.id },
    ]);
    actAs(professor);
    const [mine] = await listMyExams(prisma);
    expect(mine).toMatchObject({ status: "ALLOCATED" });
    expect(mine!.spaces.map(({ id }) => id).sort()).toEqual([room.id, big.id].sort());
    await expect(prisma.requestNotification.count({ where: { recipientId: professor.id, type: "exam.allocated" } })).resolves.toBe(1);
  });

  it("cancelling an allocated exam frees its reservations; a refusal needs the reason; another sector does not act", async () => {
    const { attendant, outsider, professor, examId, room, big, technician, day } = await examScenario();
    actAs(outsider);
    await expect(refuseExam(examId, "Não", prisma)).rejects.toBeInstanceOf(NotFoundError);
    actAs(attendant);
    await allocateExam(examId, [room.id, big.id], prisma);
    actAs(professor);
    await cancelMyExam(examId, "Prova adiada", prisma);
    await expect(prisma.spaceReservation.count({ where: { examRequestId: examId, status: "CANCELLED" } })).resolves.toBe(2);
    actAs(technician);
    await expect(createReservation(reservationInput(room.id, day, "10:00", "12:00", { attendees: "5" }), prisma)).resolves.toMatchObject({ status: "PENDING" });

    actAs(professor);
    const second = await requestExam(
      { sectorId: attendant.sectorId, course: "Física", classGroup: "B", day, start: "14:00", end: "16:00", students: "20", spaceKind: "CLASSROOM" },
      prisma,
    );
    actAs(attendant);
    await expect(refuseExam(second.id, "", prisma)).rejects.toBeInstanceOf(ValidationError);
    await refuseExam(second.id, "Sem salas nesse dia", prisma);
    await expect(prisma.examRequest.findUniqueOrThrow({ where: { id: second.id } })).resolves.toMatchObject({ status: "REFUSED", refusalNote: "Sem salas nesse dia" });
  });
});
