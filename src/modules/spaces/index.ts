import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import * as admin from "./application/space-admin";
import * as reservations from "./application/reservations";
import * as exams from "./application/exams";
import { createPrismaSpaceStore } from "./infrastructure/prisma-spaces";

// Spaces, reservations and exam allocations (SPEC 2026-11-16-professores-e-tecnicos, parts C to E): the area of
// professors and technicians, with the existing access rules only (P17).

export {
  MAX_SPACE_CAPACITY,
  MAX_SPACE_LOCATION,
  MAX_SPACE_NAME,
  MAX_SPACE_RESOURCES,
  MIN_SPACE_CAPACITY,
  NO_SPACE_FILTER,
  SPACE_CONFIRMATIONS,
  SPACE_CONFIRMATION_LABELS,
  SPACE_KINDS,
  SPACE_KIND_LABELS,
  filterSpaces,
  spaceFilterOf,
  spaceSummary,
  type SpaceConfirmation,
  type SpaceFilter,
  type SpaceKind,
  type SpaceRecord,
} from "./domain/space";
export {
  CHOOSABLE_PURPOSES,
  FIRST_MINUTE,
  LAST_MINUTE,
  MAX_DURATION,
  MAX_WEEKS,
  MINUTE_STEP,
  MIN_DURATION,
  RESERVATION_PURPOSE_LABELS,
  RESERVATION_STATUS_LABELS,
  SLOT_PROBLEM_LABELS,
  canCancelBySector,
  canCancelOwn,
  canDecide,
  clockOfMinute,
  clockOfZoned,
  dayLabel,
  type AgendaEntry,
  type ReservationPurpose,
  type ReservationRecord,
  type ReservationStatus,
} from "./domain/reservation";
export {
  EXAM_SPACE_KINDS,
  EXAM_STATUS_LABELS,
  MAX_EXAM_SPACES,
  canCancelExam,
  examTitle,
  suggestSpaces,
  type CandidateSpace,
  type ExamRecord,
  type ExamSpaceKind,
  type ExamStatus,
} from "./domain/exam";
export { ReservationOverlapError, ReservationProblemsError, type DayProblem } from "./application/schemas";
export type { SpaceEditorView } from "./application/space-admin";
export type { ReservableSpaces, ReservationResult, SectorReservations, SpaceAgenda } from "./application/reservations";
export type { ExamToAllocate, SectorExams } from "./application/exams";
export type { SpaceNoticeType } from "./application/ports";

const store = (database: PrismaClient) => createPrismaSpaceStore(database);

// Part C (P5 and P6): the registration.
export function listSpacesForEditor(database: PrismaClient = prisma) {
  return admin.listSpacesForEditor(store(database));
}
export function createSpace(input: unknown, database: PrismaClient = prisma) {
  return admin.createSpace(input, store(database));
}
export function updateSpace(spaceId: unknown, input: unknown, database: PrismaClient = prisma) {
  return admin.updateSpace(spaceId, input, store(database));
}
export function setSpaceActive(spaceId: unknown, isActive: unknown, database: PrismaClient = prisma) {
  return admin.setSpaceActive(spaceId, isActive, store(database));
}

// Parts C item 2 and D: the page "Espaços", the agenda and the reservations.
export function listReservableSpaces(filter: unknown, database: PrismaClient = prisma) {
  return reservations.listReservableSpaces(filter, store(database));
}
export function getSpaceAgenda(spaceId: unknown, week: unknown, database: PrismaClient = prisma, now: Date = new Date()) {
  return reservations.getSpaceAgenda(spaceId, week, store(database), now);
}
export function createReservation(input: unknown, database: PrismaClient = prisma, now: Date = new Date()) {
  return reservations.createReservation(input, store(database), now);
}
export function listMyReservations(database: PrismaClient = prisma, now: Date = new Date()) {
  return reservations.listMyReservations(store(database), now);
}
export function cancelMyReservation(reservationId: unknown, options: { scope?: unknown; note?: unknown }, database: PrismaClient = prisma, now: Date = new Date()) {
  return reservations.cancelMyReservation(reservationId, options, store(database), now);
}
export function listSectorReservations(database: PrismaClient = prisma, now: Date = new Date()) {
  return reservations.listSectorReservations(store(database), now);
}
export function decideReservation(
  reservationId: unknown,
  decision: "confirm" | "refuse" | "cancel",
  note: unknown,
  database: PrismaClient = prisma,
  now: Date = new Date(),
) {
  return reservations.decideReservation(reservationId, decision, note, store(database), now);
}

// Part E: the exam allocations.
export function requestExam(input: unknown, database: PrismaClient = prisma, now: Date = new Date()) {
  return exams.requestExam(input, store(database), now);
}
export function listMyExams(database: PrismaClient = prisma, now: Date = new Date()) {
  return exams.listMyExams(store(database), now);
}
export function cancelMyExam(examId: unknown, note: unknown, database: PrismaClient = prisma, now: Date = new Date()) {
  return exams.cancelMyExam(examId, note, store(database), now);
}
export function listSectorExams(database: PrismaClient = prisma, now: Date = new Date()) {
  return exams.listSectorExams(store(database), now);
}
export function allocateExam(examId: unknown, spaceIds: unknown, database: PrismaClient = prisma, now: Date = new Date()) {
  return exams.allocateExam(examId, spaceIds, store(database), now);
}
export function refuseExam(examId: unknown, note: unknown, database: PrismaClient = prisma, now: Date = new Date()) {
  return exams.refuseExam(examId, note, store(database), now);
}
