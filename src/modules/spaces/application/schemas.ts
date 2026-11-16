import { z } from "zod";
import { ConflictError } from "@/server/errors";
import { entityIdSchema } from "@/shared/validation";
import { EXAM_SPACE_KINDS, MAX_CLASS_GROUP, MAX_COURSE, MAX_EXAM_NOTES, MAX_EXAM_SPACES, MAX_EXAM_STUDENTS, MIN_EXAM_STUDENTS } from "../domain/exam";
import { CHOOSABLE_PURPOSES, MAX_DESCRIPTION, MAX_NOTE, type SlotProblem } from "../domain/reservation";
import {
  MAX_SPACE_CAPACITY,
  MAX_SPACE_LOCATION,
  MAX_SPACE_NAME,
  MAX_SPACE_RESOURCES,
  MIN_SPACE_CAPACITY,
  SPACE_CONFIRMATIONS,
  SPACE_KINDS,
} from "../domain/space";

// The forms of the spaces' screens (SPEC 2026-11-16-professores-e-tecnicos, parts C to E), checked on the server.

const trimmed = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
const wholeNumber = (min: number, max: number) =>
  z.union([z.number(), z.string().trim().regex(/^[0-9]+$/).transform(Number)]).pipe(z.number().int().min(min).max(max));
const calendarDay = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
const clock = z.string().regex(/^[0-9]{2}:[0-9]{2}$/);

/** Part C item 1 (P5). */
export const spaceInputSchema = z
  .object({
    name: required(MAX_SPACE_NAME),
    kind: z.enum(SPACE_KINDS),
    sectorId: entityIdSchema,
    capacity: wholeNumber(MIN_SPACE_CAPACITY, MAX_SPACE_CAPACITY),
    location: trimmed(MAX_SPACE_LOCATION).default(""),
    resources: trimmed(MAX_SPACE_RESOURCES).default(""),
    confirmation: z.enum(SPACE_CONFIRMATIONS).default("SECTOR"),
  })
  .strict();

/** Part D item 1 (P7 and P8): a day and a time; with `repeatUntil`, the same time every week until that day. */
export const reservationInputSchema = z
  .object({
    spaceId: entityIdSchema,
    purpose: z.enum(CHOOSABLE_PURPOSES),
    description: required(MAX_DESCRIPTION),
    attendees: wholeNumber(1, MAX_SPACE_CAPACITY),
    day: calendarDay,
    start: clock,
    end: clock,
    repeatUntil: z.union([calendarDay, z.literal("")]).optional(),
  })
  .strict();

/** A refusal or a cancellation by the sector needs the reason (P10); the person's own cancellation may say it. */
export const requiredNoteSchema = required(MAX_NOTE);
export const optionalNoteSchema = trimmed(MAX_NOTE).optional();

/** Part E item 1 (P13). */
export const examInputSchema = z
  .object({
    sectorId: entityIdSchema,
    course: required(MAX_COURSE),
    classGroup: required(MAX_CLASS_GROUP),
    day: calendarDay,
    start: clock,
    end: clock,
    students: wholeNumber(MIN_EXAM_STUDENTS, MAX_EXAM_STUDENTS),
    spaceKind: z.enum(EXAM_SPACE_KINDS),
    notes: trimmed(MAX_EXAM_NOTES).default(""),
  })
  .strict();

/** Part E item 2: the spaces the team chose, without repetition. */
export const allocationSchema = z.array(entityIdSchema).min(1).max(MAX_EXAM_SPACES);

/** A date with a problem, as the screen lists it (P8). */
export interface DayProblem {
  day: string;
  problem: SlotProblem | "conflict";
  /** For an allocation: the space that is not free. */
  spaceName?: string;
}

/**
 * P8: the reservation (or every date of the series) was not saved; the problems say which dates and why. A conflict
 * error, so the screens and the API answer as for any conflict.
 */
export class ReservationProblemsError extends ConflictError {
  readonly problems: DayProblem[];

  constructor(problems: DayProblem[]) {
    super();
    this.problems = problems;
  }
}

/** P11: the database refused an overlap written at the same time by somebody else. */
export class ReservationOverlapError extends ConflictError {}
