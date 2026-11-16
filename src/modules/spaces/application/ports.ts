import type { AuditScope } from "@/modules/audit";
import type { ExamRecord, ExamSpaceKind } from "../domain/exam";
import type { Holiday, Period, ReservationPurpose, ReservationRecord, ReservationStatus } from "../domain/reservation";
import type { SpaceData, SpaceRecord } from "../domain/space";

// What the spaces' use cases need from the database (SPEC 2026-11-16-professores-e-tecnicos, parts C to E).

/** P14: the notices this module writes, each pointing to a reservation or to an exam request. */
export type SpaceNoticeType =
  | "reservation.pending"
  | "reservation.confirmed"
  | "reservation.refused"
  | "reservation.cancelled"
  | "exam.pending"
  | "exam.allocated"
  | "exam.refused"
  | "exam.cancelled";

export type SpaceNotice =
  | { recipientId: string; type: SpaceNoticeType; reservationId: string }
  | { recipientId: string; type: SpaceNoticeType; examRequestId: string };

export interface NewReservation extends Period {
  spaceId: string;
  requesterId: string;
  purpose: ReservationPurpose;
  description: string;
  attendees: number;
  status: ReservationStatus;
  seriesId: string | null;
  examRequestId: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
}

export interface NewExam extends Period {
  professorId: string;
  sectorId: string;
  course: string;
  classGroup: string;
  students: number;
  spaceKind: ExamSpaceKind;
  notes: string;
}

export interface ReservationChange {
  status: ReservationStatus;
  decidedById?: string | null;
  decidedAt?: Date | null;
  decisionNote?: string | null;
  cancelledById?: string | null;
  cancelledAt?: Date | null;
  cancelNote?: string | null;
}

export interface ExamChange {
  status: ExamRecord["status"];
  decidedById?: string | null;
  decidedAt?: Date | null;
  refusalNote?: string | null;
  cancelledById?: string | null;
  cancelledAt?: Date | null;
  cancelNote?: string | null;
}

export interface SpaceReader {
  /** Every space of a sector (every sector when null), active or not, by sector and name. */
  listSpaces(sectorId: string | null): Promise<SpaceRecord[]>;
  findSpace(spaceId: string): Promise<SpaceRecord | null>;
  /** Active sectors, by name: for the forms and the filters. */
  listSectors(): Promise<Array<{ id: string; name: string }>>;
  /** The time zone and the holidays (the organization's and the sector's) of a sector's calendar (P7). */
  calendarOf(sectorId: string): Promise<{ timeZone: string; holidays: Holiday[] }>;
  /** The reservations of a space that touch the period, every status (the agenda filters them). */
  reservationsOfSpace(spaceId: string, period: Period): Promise<ReservationRecord[]>;
  /** A person's reservations that end after `from`, by start. */
  reservationsOfRequester(requesterId: string, from: Date): Promise<ReservationRecord[]>;
  /** The reservations of the sector's spaces that end after `from`, by start. */
  reservationsOfSector(sectorId: string, from: Date): Promise<ReservationRecord[]>;
  findReservation(reservationId: string): Promise<ReservationRecord | null>;
  examsOfProfessor(professorId: string, from: Date): Promise<ExamRecord[]>;
  examsOfSector(sectorId: string, from: Date): Promise<ExamRecord[]>;
  findExam(examId: string): Promise<ExamRecord | null>;
  /** Of these spaces, the ones with a pending or confirmed reservation overlapping the period. */
  busySpaceIds(spaceIds: readonly string[], period: Period): Promise<Set<string>>;
}

export interface SpaceTransaction extends AuditScope {
  findSpace(spaceId: string): Promise<SpaceRecord | null>;
  /** Null when the name is taken in the sector. */
  createSpace(data: SpaceData): Promise<{ id: string } | null>;
  /** Null when the name is taken in the sector. */
  updateSpace(spaceId: string, data: Partial<SpaceData> & { isActive?: boolean }): Promise<{ id: string } | null>;
  sectorIsActive(sectorId: string): Promise<boolean>;
  /** The pending or confirmed reservations of the space that overlap any of the periods. */
  conflicting(spaceId: string, periods: readonly Period[]): Promise<Period[]>;
  /** Throws ReservationOverlapError when the database refuses an overlap (P11). */
  insertReservations(reservations: readonly NewReservation[]): Promise<string[]>;
  findReservation(reservationId: string): Promise<ReservationRecord | null>;
  /** The holding reservations of a series from an instant on (this one included), by start. */
  seriesFrom(seriesId: string, startsAt: Date): Promise<ReservationRecord[]>;
  updateReservations(reservationIds: readonly string[], change: ReservationChange): Promise<void>;
  insertExam(exam: NewExam): Promise<string>;
  findExam(examId: string): Promise<ExamRecord | null>;
  updateExam(examId: string, change: ExamChange): Promise<void>;
  /** The holding reservations of an exam's allocation. */
  examReservationIds(examId: string): Promise<string[]>;
  /** Active attendants and managers of a sector: who hears about a pending reservation or exam (P14). */
  sectorTeamIds(sectorId: string): Promise<string[]>;
  notify(notices: readonly SpaceNotice[]): Promise<void>;
}

export interface SpaceStore extends SpaceReader {
  run<T>(work: (transaction: SpaceTransaction) => Promise<T>): Promise<T>;
}
