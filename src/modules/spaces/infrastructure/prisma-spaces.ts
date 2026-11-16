import { Prisma, type PrismaClient } from "@prisma/client";
import { createPrismaAuditScope } from "@/modules/audit";
import { loadSectorBusinessCalendar } from "@/modules/calendar";
import { runSerializableTransaction } from "@/server/db/serializable-transaction";
import type { ExamRecord } from "../domain/exam";
import { HOLDING_STATUSES, type Period, type ReservationRecord } from "../domain/reservation";
import type { SpaceRecord } from "../domain/space";
import type { SpaceStore, SpaceTransaction } from "../application/ports";
import { ReservationOverlapError } from "../application/schemas";

// Spaces, reservations and exam requests in PostgreSQL (SPEC 2026-11-16-professores-e-tecnicos, parts C to E). The
// exclusion constraint "SpaceReservation_no_overlap" keeps two pending or confirmed reservations of a space from
// overlapping (P11); its refusal becomes ReservationOverlapError.

type Client = PrismaClient | Prisma.TransactionClient;

const spaceColumns = {
  id: true,
  name: true,
  kind: true,
  sectorId: true,
  capacity: true,
  location: true,
  resources: true,
  confirmation: true,
  isActive: true,
  sector: { select: { name: true } },
} as const;

type SpaceRow = Prisma.SpaceGetPayload<{ select: typeof spaceColumns }>;

const spaceOf = ({ sector, ...row }: SpaceRow): SpaceRecord => ({ ...row, sectorName: sector.name });

const reservationColumns = {
  id: true,
  spaceId: true,
  requesterId: true,
  purpose: true,
  description: true,
  attendees: true,
  startsAt: true,
  endsAt: true,
  status: true,
  seriesId: true,
  examRequestId: true,
  decisionNote: true,
  cancelNote: true,
  space: { select: { name: true, sectorId: true, sector: { select: { name: true } } } },
  requester: { select: { name: true } },
} as const;

type ReservationRow = Prisma.SpaceReservationGetPayload<{ select: typeof reservationColumns }>;

const reservationOf = ({ space, requester, ...row }: ReservationRow): ReservationRecord => ({
  ...row,
  spaceName: space.name,
  sectorId: space.sectorId,
  sectorName: space.sector.name,
  requesterName: requester.name,
});

const examColumns = Prisma.validator<Prisma.ExamRequestSelect>()({
  id: true,
  professorId: true,
  sectorId: true,
  course: true,
  classGroup: true,
  startsAt: true,
  endsAt: true,
  students: true,
  spaceKind: true,
  notes: true,
  status: true,
  refusalNote: true,
  cancelNote: true,
  professor: { select: { name: true } },
  sector: { select: { name: true } },
  reservations: {
    where: { status: { in: ["PENDING", "CONFIRMED"] } },
    orderBy: [{ space: { name: "asc" } }, { id: "asc" }],
    select: { space: { select: { id: true, name: true, capacity: true } } },
  },
});

type ExamRow = Prisma.ExamRequestGetPayload<{ select: typeof examColumns }>;

const examOf = ({ professor, sector, reservations, spaceKind, ...row }: ExamRow): ExamRecord => ({
  ...row,
  // Only a classroom or a laboratory is asked for (the request's schema).
  spaceKind: spaceKind as ExamRecord["spaceKind"],
  professorName: professor.name,
  sectorName: sector.name,
  spaces: reservations.map(({ space }) => space),
});

const overlapping = (period: Period): Prisma.SpaceReservationWhereInput => ({
  status: { in: [...HOLDING_STATUSES] },
  startsAt: { lt: period.endsAt },
  endsAt: { gt: period.startsAt },
});

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** The database's refusal of an overlap (SQLSTATE 23P01), whatever the client's error class. */
const isOverlapViolation = (error: unknown) =>
  error instanceof Error && (error.message.includes("SpaceReservation_no_overlap") || error.message.includes("23P01"));

async function calendarOf(client: Client, sectorId: string) {
  const { calendar } = await loadSectorBusinessCalendar(client, sectorId);
  return { timeZone: calendar.timeZone, holidays: calendar.holidays.map(({ day, yearly }) => ({ day, yearly })) };
}

function readerOf(client: Client): Omit<SpaceStore, "run"> {
  return {
    async listSpaces(sectorId) {
      const rows = await client.space.findMany({
        where: sectorId ? { sectorId } : {},
        orderBy: [{ sector: { name: "asc" } }, { name: "asc" }, { id: "asc" }],
        select: spaceColumns,
      });
      return rows.map(spaceOf);
    },
    async findSpace(spaceId) {
      const row = await client.space.findUnique({ where: { id: spaceId }, select: spaceColumns });
      return row && spaceOf(row);
    },
    listSectors() {
      return client.sector.findMany({ where: { isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } });
    },
    calendarOf(sectorId) {
      return calendarOf(client, sectorId);
    },
    async reservationsOfSpace(spaceId, period) {
      const rows = await client.spaceReservation.findMany({
        where: { spaceId, startsAt: { lt: period.endsAt }, endsAt: { gt: period.startsAt } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: reservationColumns,
      });
      return rows.map(reservationOf);
    },
    async reservationsOfRequester(requesterId, from) {
      const rows = await client.spaceReservation.findMany({
        where: { requesterId, endsAt: { gt: from }, examRequestId: null },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: 500,
        select: reservationColumns,
      });
      return rows.map(reservationOf);
    },
    async reservationsOfSector(sectorId, from) {
      const rows = await client.spaceReservation.findMany({
        where: { space: { sectorId }, endsAt: { gt: from }, status: { in: [...HOLDING_STATUSES] } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: 500,
        select: reservationColumns,
      });
      return rows.map(reservationOf);
    },
    async findReservation(reservationId) {
      const row = await client.spaceReservation.findUnique({ where: { id: reservationId }, select: reservationColumns });
      return row && reservationOf(row);
    },
    async examsOfProfessor(professorId, from) {
      const rows = await client.examRequest.findMany({
        where: { professorId, endsAt: { gt: from } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: 200,
        select: examColumns,
      });
      return rows.map(examOf);
    },
    async examsOfSector(sectorId, from) {
      const rows = await client.examRequest.findMany({
        where: { sectorId, endsAt: { gt: from }, status: { in: ["PENDING", "ALLOCATED"] } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: 200,
        select: examColumns,
      });
      return rows.map(examOf);
    },
    async findExam(examId) {
      const row = await client.examRequest.findUnique({ where: { id: examId }, select: examColumns });
      return row && examOf(row);
    },
    async busySpaceIds(spaceIds, period) {
      if (spaceIds.length === 0) return new Set();
      const rows = await client.spaceReservation.findMany({
        where: { spaceId: { in: [...spaceIds] }, ...overlapping(period) },
        distinct: ["spaceId"],
        select: { spaceId: true },
      });
      return new Set(rows.map(({ spaceId }) => spaceId));
    },
  };
}

function transactionOf(client: Prisma.TransactionClient): SpaceTransaction {
  const reader = readerOf(client);
  return {
    ...createPrismaAuditScope(client),
    findSpace: reader.findSpace,
    findReservation: reader.findReservation,
    findExam: reader.findExam,
    async sectorIsActive(sectorId) {
      return (await client.sector.count({ where: { id: sectorId, isActive: true } })) === 1;
    },
    async createSpace(data) {
      try {
        return await client.space.create({ data, select: { id: true } });
      } catch (error) {
        if (isUniqueViolation(error)) return null;
        throw error;
      }
    },
    async updateSpace(spaceId, data) {
      try {
        return await client.space.update({ where: { id: spaceId }, data, select: { id: true } });
      } catch (error) {
        if (isUniqueViolation(error)) return null;
        throw error;
      }
    },
    async conflicting(spaceId, periods) {
      if (periods.length === 0) return [];
      return client.spaceReservation.findMany({
        where: { spaceId, OR: periods.map(overlapping) },
        select: { startsAt: true, endsAt: true },
      });
    },
    async insertReservations(reservations) {
      try {
        const rows = await client.spaceReservation.createManyAndReturn({ data: [...reservations], select: { id: true, startsAt: true } });
        return rows.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime()).map(({ id }) => id);
      } catch (error) {
        if (isOverlapViolation(error)) throw new ReservationOverlapError();
        throw error;
      }
    },
    async seriesFrom(seriesId, startsAt) {
      const rows = await client.spaceReservation.findMany({
        where: { seriesId, startsAt: { gte: startsAt }, status: { in: [...HOLDING_STATUSES] } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: reservationColumns,
      });
      return rows.map(reservationOf);
    },
    async updateReservations(reservationIds, change) {
      await client.spaceReservation.updateMany({ where: { id: { in: [...reservationIds] } }, data: change });
    },
    async insertExam(exam) {
      return (await client.examRequest.create({ data: exam, select: { id: true } })).id;
    },
    async updateExam(examId, change) {
      await client.examRequest.update({ where: { id: examId }, data: change });
    },
    async examReservationIds(examId) {
      const rows = await client.spaceReservation.findMany({
        where: { examRequestId: examId, status: { in: [...HOLDING_STATUSES] } },
        select: { id: true },
      });
      return rows.map(({ id }) => id);
    },
    async sectorTeamIds(sectorId) {
      const rows = await client.user.findMany({
        where: { sectorId, isActive: true, role: { in: ["ATTENDANT", "MANAGER"] } },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      return rows.map(({ id }) => id);
    },
    async notify(notices) {
      if (notices.length === 0) return;
      const createdAt = new Date();
      await client.requestNotification.createMany({
        data: notices.map((notice) => ({
          recipientId: notice.recipientId,
          type: notice.type,
          createdAt,
          ...("reservationId" in notice ? { reservationId: notice.reservationId } : { examRequestId: notice.examRequestId }),
        })),
      });
    },
  };
}

export function createPrismaSpaceStore(database: PrismaClient): SpaceStore {
  return {
    ...readerOf(database),
    async run(work) {
      try {
        return await runSerializableTransaction(database, (client) => work(transactionOf(client)), {
          translate: ["P2025", "P2034"],
          fallbackMessage: "Space change failed.",
        });
      } catch (error) {
        // Two people reserving at the same instant: the database keeps one (P11).
        if (isOverlapViolation(error)) throw new ReservationOverlapError();
        throw error;
      }
    },
  };
}
