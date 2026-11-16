import { requirePublishedCatalogReader } from "@/server/authorization";
import { NotFoundError, ValidationError } from "@/server/errors";
import { validateInput } from "@/server/validation";
import { entityIdSchema } from "@/shared/validation";
import { zonedDayOf } from "@/shared/time";
import {
  canCancelExam,
  canDecideExam,
  holdsStudents,
  seatsPerSpace,
  suggestSpaces,
  type CandidateSpace,
  type ExamRecord,
} from "../domain/exam";
import { minuteOfClock, periodOf, slotProblem } from "../domain/reservation";
import type { SpaceStore } from "./ports";
import { requireSpaceTeam } from "./reservations";
import { ReservationProblemsError, allocationSchema, examInputSchema, optionalNoteSchema, requiredNoteSchema } from "./schemas";

// Exam allocations (SPEC 2026-11-16-professores-e-tecnicos, part E; decision P13). The request is made in the
// requester's area, shown to professors (P9 and P17: no new check); the team of the chosen sector allocates the
// spaces, with a suggestion, or refuses with the reason; allocating writes confirmed reservations that the database
// keeps from overlapping (P11).

const DAY_MS = 86_400_000;

/** Part E item 1: the exam request, with the same time rules as a reservation (P7). */
export async function requestExam(input: unknown, store: SpaceStore, now: Date = new Date()): Promise<{ id: string }> {
  const actor = await requirePublishedCatalogReader();
  const data = validateInput(examInputSchema, input);
  const startMinute = minuteOfClock(data.start);
  const endMinute = minuteOfClock(data.end);
  if (startMinute === null || endMinute === null) throw new ValidationError([{ path: ["start"], code: "invalid_format" }]);

  // P13: the sector chosen among the ones with active spaces of the kind asked for.
  const spaces = (await store.listSpaces(data.sectorId)).filter((space) => space.isActive && space.kind === data.spaceKind);
  const sectors = await store.listSectors();
  if (spaces.length === 0 || !sectors.some(({ id }) => id === data.sectorId)) throw new NotFoundError();

  const { timeZone, holidays } = await store.calendarOf(data.sectorId);
  const problem = slotProblem(data.day, startMinute, endMinute, { now, timeZone, holidays });
  if (problem) throw new ReservationProblemsError([{ day: data.day, problem }]);
  const period = periodOf(data.day, startMinute, endMinute, timeZone);

  return store.run(async (transaction) => {
    const id = await transaction.insertExam({
      professorId: actor.id,
      sectorId: data.sectorId,
      course: data.course,
      classGroup: data.classGroup,
      students: data.students,
      spaceKind: data.spaceKind,
      notes: data.notes,
      ...period,
    });
    const team = await transaction.sectorTeamIds(data.sectorId);
    await transaction.notify(team.map((recipientId) => ({ recipientId, type: "exam.pending" as const, examRequestId: id })));
    return { id };
  });
}

/** "Minhas provas", from a week ago on. */
export async function listMyExams(store: SpaceStore, now: Date = new Date()): Promise<ExamRecord[]> {
  const actor = await requirePublishedCatalogReader();
  return store.examsOfProfessor(actor.id, new Date(now.getTime() - 7 * DAY_MS));
}

/** Part E item 3: cancelling the request frees every reservation of its allocation (CA-PRT-12). */
export async function cancelMyExam(examId: unknown, rawNote: unknown, store: SpaceStore, now: Date = new Date()): Promise<void> {
  const actor = await requirePublishedCatalogReader();
  const id = validateInput(entityIdSchema, examId);
  const note = validateInput(optionalNoteSchema, rawNote) || null;
  await store.run(async (transaction) => {
    const exam = await transaction.findExam(id);
    if (!exam || exam.professorId !== actor.id) throw new NotFoundError();
    if (!canCancelExam(exam, now)) throw new ValidationError([{ path: ["exam"], code: "invalid_value" }]);
    const reservations = await transaction.examReservationIds(id);
    if (reservations.length > 0) {
      await transaction.updateReservations(reservations, { status: "CANCELLED", cancelledById: actor.id, cancelledAt: now, cancelNote: note });
    }
    await transaction.updateExam(id, { status: "CANCELLED", cancelledById: actor.id, cancelledAt: now, cancelNote: note });
    const team = await transaction.sectorTeamIds(exam.sectorId);
    await transaction.notify(team.map((recipientId) => ({ recipientId, type: "exam.cancelled" as const, examRequestId: id })));
  });
}

export interface ExamToAllocate {
  exam: ExamRecord;
  /** Active spaces of the sector of the kind asked for, free at that time (rule 8.2.2). */
  candidates: CandidateSpace[];
  /** The suggestion: fewest spaces, then the fewest empty places; null when the free spaces do not hold everyone. */
  suggestion: CandidateSpace[] | null;
}

export interface SectorExams {
  pending: ExamToAllocate[];
  allocated: ExamRecord[];
}

/** Part E item 2: the sector's exam requests, the pending ones with their candidates and suggestion. */
export async function listSectorExams(store: SpaceStore, now: Date = new Date()): Promise<SectorExams> {
  const actor = await requireSpaceTeam();
  const [exams, spaces] = await Promise.all([store.examsOfSector(actor.sectorId, now), store.listSpaces(actor.sectorId)]);
  const pending: ExamToAllocate[] = [];
  for (const exam of exams.filter(({ status }) => status === "PENDING")) {
    const ofKind = spaces.filter((space) => space.isActive && space.kind === exam.spaceKind);
    const busy = await store.busySpaceIds(
      ofKind.map(({ id }) => id),
      exam,
    );
    const candidates = ofKind.filter(({ id }) => !busy.has(id)).map(({ id, name, capacity }) => ({ id, name, capacity }));
    pending.push({ exam, candidates, suggestion: suggestSpaces(candidates, exam.students) });
  }
  return { pending, allocated: exams.filter(({ status }) => status === "ALLOCATED") };
}

/** P13 and rule 8.2.1: the chosen spaces hold the students and are free; the reservations are confirmed at once. */
export async function allocateExam(examId: unknown, rawSpaceIds: unknown, store: SpaceStore, now: Date = new Date()): Promise<void> {
  const actor = await requireSpaceTeam();
  const id = validateInput(entityIdSchema, examId);
  const spaceIds = [...new Set(validateInput(allocationSchema, rawSpaceIds))];
  await store.run(async (transaction) => {
    const exam = await transaction.findExam(id);
    if (!exam || exam.sectorId !== actor.sectorId) throw new NotFoundError();
    if (!canDecideExam(exam, now)) throw new ValidationError([{ path: ["exam"], code: "invalid_value" }]);
    const spaces = await Promise.all(spaceIds.map((spaceId) => transaction.findSpace(spaceId)));
    const chosen = spaces.filter((space) => space && space.isActive && space.sectorId === exam.sectorId && space.kind === exam.spaceKind);
    if (chosen.length !== spaceIds.length) throw new ValidationError([{ path: ["spaceIds"], code: "invalid_value" }]);
    const candidates = chosen.map((space) => ({ id: space!.id, name: space!.name, capacity: space!.capacity }));
    if (!holdsStudents(candidates, exam.students)) throw new ValidationError([{ path: ["spaceIds"], code: "too_small" }]);

    const day = zonedDayOf(exam.startsAt, (await store.calendarOf(exam.sectorId)).timeZone);
    const problems = [];
    for (const space of candidates) {
      if ((await transaction.conflicting(space.id, [exam])).length > 0) problems.push({ day, problem: "conflict" as const, spaceName: space.name });
    }
    if (problems.length > 0) throw new ReservationProblemsError(problems);

    const seats = seatsPerSpace(candidates, exam.students);
    await transaction.insertReservations(
      candidates.map((space) => ({
        spaceId: space.id,
        requesterId: exam.professorId,
        purpose: "EXAM" as const,
        description: `${exam.course} — ${exam.classGroup}`,
        attendees: seats.get(space.id)!,
        startsAt: exam.startsAt,
        endsAt: exam.endsAt,
        status: "CONFIRMED" as const,
        seriesId: null,
        examRequestId: exam.id,
        decidedById: actor.id,
        decidedAt: now,
      })),
    );
    await transaction.updateExam(id, { status: "ALLOCATED", decidedById: actor.id, decidedAt: now });
    await transaction.notify([{ recipientId: exam.professorId, type: "exam.allocated", examRequestId: id }]);
  });
}

/** P13: refusing needs the reason; the professor is told. */
export async function refuseExam(examId: unknown, rawNote: unknown, store: SpaceStore, now: Date = new Date()): Promise<void> {
  const actor = await requireSpaceTeam();
  const id = validateInput(entityIdSchema, examId);
  const note = validateInput(requiredNoteSchema, rawNote);
  await store.run(async (transaction) => {
    const exam = await transaction.findExam(id);
    if (!exam || exam.sectorId !== actor.sectorId) throw new NotFoundError();
    if (!canDecideExam(exam, now)) throw new ValidationError([{ path: ["exam"], code: "invalid_value" }]);
    await transaction.updateExam(id, { status: "REFUSED", decidedById: actor.id, decidedAt: now, refusalNote: note });
    await transaction.notify([{ recipientId: exam.professorId, type: "exam.refused", examRequestId: id }]);
  });
}
