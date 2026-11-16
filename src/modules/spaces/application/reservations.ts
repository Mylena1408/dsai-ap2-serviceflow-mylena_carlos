import { randomUUID } from "node:crypto";
import { requireCurrentActor, requirePublishedCatalogReader, type AuthorizationActor } from "@/server/authorization";
import { AuthorizationError, NotFoundError, ValidationError } from "@/server/errors";
import { validateInput } from "@/server/validation";
import { entityIdSchema } from "@/shared/validation";
import { addDays, calendarDayError, zonedDayOf } from "@/shared/time";
import {
  agendaOf,
  canCancelBySector,
  canCancelOwn,
  canDecide,
  minuteOfClock,
  periodOf,
  slotProblem,
  weekDays,
  weekStartOf,
  weeklyDays,
  type AgendaEntry,
  type ReservationRecord,
} from "../domain/reservation";
import { NO_SPACE_FILTER, filterSpaces, spaceFilterOf, type SpaceFilter, type SpaceRecord } from "../domain/space";
import type { NewReservation, SpaceStore } from "./ports";
import { ReservationProblemsError, optionalNoteSchema, requiredNoteSchema, reservationInputSchema, type DayProblem } from "./schemas";

// Reservations of spaces (SPEC 2026-11-16-professores-e-tecnicos, part D; decisions P7 to P12 and P17). Who reserves is
// any requester (P9: the area is shown to professors and technicians, without a new check); who confirms, refuses and
// cancels is the team of the space's sector (P10), like the queue's rule of the own sector.

const DAY_MS = 86_400_000;

/** P10 and P17: an attendant or a manager acts on the reservations of their own sector, as in the queue. */
export async function requireSpaceTeam(): Promise<AuthorizationActor & { sectorId: string }> {
  const actor = await requireCurrentActor();
  if ((actor.role !== "ATTENDANT" && actor.role !== "MANAGER") || !actor.sectorId) throw new AuthorizationError();
  return { ...actor, sectorId: actor.sectorId };
}

export interface ReservableSpaces {
  filter: SpaceFilter;
  spaces: SpaceRecord[];
  sectors: Array<{ id: string; name: string }>;
}

/** Part C item 2: the active spaces with the page's filters. */
export async function listReservableSpaces(rawFilter: unknown, store: SpaceStore): Promise<ReservableSpaces> {
  await requirePublishedCatalogReader();
  const filter = rawFilter && typeof rawFilter === "object" ? spaceFilterOf(rawFilter as Record<string, unknown>) : NO_SPACE_FILTER;
  const [spaces, sectors] = await Promise.all([store.listSpaces(null), store.listSectors()]);
  const activeSectors = new Set(sectors.map(({ id }) => id));
  return { filter, spaces: filterSpaces(spaces.filter((space) => activeSectors.has(space.sectorId)), filter), sectors };
}

export interface SpaceAgenda {
  space: SpaceRecord;
  timeZone: string;
  monday: string;
  previousWeek: string;
  nextWeek: string;
  days: Array<{ day: string; entries: AgendaEntry[] }>;
}

/**
 * P12: the week of a space with who reserved and why, the same for everyone who reads it (P17). A requester reads only
 * active spaces; the team also its sector's inactive ones.
 */
export async function getSpaceAgenda(spaceId: unknown, rawWeek: unknown, store: SpaceStore, now: Date = new Date()): Promise<SpaceAgenda> {
  const actor = await requireCurrentActor();
  const id = validateInput(entityIdSchema, spaceId);
  const space = await store.findSpace(id);
  const readable = space && (space.isActive || ((actor.role === "ATTENDANT" || actor.role === "MANAGER") && actor.sectorId === space.sectorId) || actor.role === "ADMIN");
  if (!space || !readable) throw new NotFoundError();
  const { timeZone } = await store.calendarOf(space.sectorId);
  const asked = typeof rawWeek === "string" && calendarDayError(rawWeek) === null ? rawWeek : zonedDayOf(now, timeZone);
  const monday = weekStartOf(asked);
  const days = weekDays(monday);
  const reservations = await store.reservationsOfSpace(space.id, {
    startsAt: periodOf(days[0]!, 0, 0, timeZone).startsAt,
    endsAt: periodOf(addDays(days[6]!, 1), 0, 0, timeZone).startsAt,
  });
  return {
    space,
    timeZone,
    monday,
    previousWeek: addDays(monday, -7),
    nextWeek: addDays(monday, 7),
    days: agendaOf(reservations, monday, timeZone),
  };
}

export interface ReservationResult {
  ids: string[];
  status: "PENDING" | "CONFIRMED";
}

/** Part D item 1 (P7, P8, P11): a reservation, or a weekly series, all or nothing. */
export async function createReservation(input: unknown, store: SpaceStore, now: Date = new Date()): Promise<ReservationResult> {
  const actor = await requirePublishedCatalogReader();
  const data = validateInput(reservationInputSchema, input);
  const startMinute = minuteOfClock(data.start);
  const endMinute = minuteOfClock(data.end);
  if (startMinute === null || endMinute === null) throw new ValidationError([{ path: ["start"], code: "invalid_format" }]);
  const days = data.repeatUntil ? weeklyDays(data.day, data.repeatUntil) : [data.day];
  if (days === null) throw new ValidationError([{ path: ["repeatUntil"], code: "invalid_value" }]);

  const space = await store.findSpace(data.spaceId);
  if (!space || !space.isActive) throw new NotFoundError();
  if (data.attendees > space.capacity) throw new ValidationError([{ path: ["attendees"], code: "too_big" }]);
  const { timeZone, holidays } = await store.calendarOf(space.sectorId);

  const problems: DayProblem[] = [];
  for (const day of days) {
    const problem = slotProblem(day, startMinute, endMinute, { now, timeZone, holidays });
    if (problem) problems.push({ day, problem });
  }
  const periods = days.map((day) => ({ day, ...periodOf(day, startMinute, endMinute, timeZone) }));

  return store.run(async (transaction) => {
    const current = await transaction.findSpace(space.id);
    if (!current || !current.isActive) throw new NotFoundError();
    const taken = await transaction.conflicting(space.id, periods);
    for (const period of periods) {
      if (taken.some((other) => other.startsAt < period.endsAt && period.startsAt < other.endsAt)) problems.push({ day: period.day, problem: "conflict" });
    }
    if (problems.length > 0) throw new ReservationProblemsError(problems.sort((left, right) => left.day.localeCompare(right.day)));

    const automatic = current.confirmation === "AUTOMATIC";
    const seriesId = periods.length > 1 ? randomUUID() : null;
    const rows: NewReservation[] = periods.map(({ startsAt, endsAt }) => ({
      spaceId: space.id,
      requesterId: actor.id,
      purpose: data.purpose,
      description: data.description,
      attendees: data.attendees,
      startsAt,
      endsAt,
      status: automatic ? "CONFIRMED" : "PENDING",
      seriesId,
      examRequestId: null,
      decidedById: null,
      decidedAt: automatic ? now : null,
    }));
    const ids = await transaction.insertReservations(rows);
    // P14: the team hears about a new pending reservation (one notice for a series, pointing to its first date).
    if (!automatic) {
      const team = await transaction.sectorTeamIds(space.sectorId);
      await transaction.notify(team.map((recipientId) => ({ recipientId, type: "reservation.pending" as const, reservationId: ids[0]! })));
    }
    return { ids, status: automatic ? "CONFIRMED" : "PENDING" };
  });
}

/** Part D item 2: "Minhas reservas", from a week ago on. */
export async function listMyReservations(store: SpaceStore, now: Date = new Date()): Promise<ReservationRecord[]> {
  const actor = await requirePublishedCatalogReader();
  return store.reservationsOfRequester(actor.id, new Date(now.getTime() - 7 * DAY_MS));
}

/** P8 and P10: the person cancels one date, or that date and the following ones of the series, until they start. */
export async function cancelMyReservation(
  reservationId: unknown,
  options: { scope?: unknown; note?: unknown },
  store: SpaceStore,
  now: Date = new Date(),
): Promise<{ cancelled: number }> {
  const actor = await requirePublishedCatalogReader();
  const id = validateInput(entityIdSchema, reservationId);
  const note = validateInput(optionalNoteSchema, options.note) || null;
  return store.run(async (transaction) => {
    const reservation = await transaction.findReservation(id);
    if (!reservation || reservation.requesterId !== actor.id || reservation.examRequestId !== null) throw new NotFoundError();
    if (!canCancelOwn(reservation, now)) throw new ValidationError([{ path: ["reservation"], code: "invalid_value" }]);
    const targets =
      options.scope === "series" && reservation.seriesId
        ? (await transaction.seriesFrom(reservation.seriesId, reservation.startsAt)).filter((item) => canCancelOwn(item, now))
        : [reservation];
    await transaction.updateReservations(
      targets.map((item) => item.id),
      { status: "CANCELLED", cancelledById: actor.id, cancelledAt: now, cancelNote: note },
    );
    return { cancelled: targets.length };
  });
}

export interface SectorReservations {
  pending: ReservationRecord[];
  upcoming: ReservationRecord[];
}

/** Part D item 3: the pending reservations of the sector's spaces to decide, and the confirmed ones to come. */
export async function listSectorReservations(store: SpaceStore, now: Date = new Date()): Promise<SectorReservations> {
  const actor = await requireSpaceTeam();
  const all = await store.reservationsOfSector(actor.sectorId, now);
  return {
    pending: all.filter((reservation) => reservation.status === "PENDING"),
    upcoming: all.filter((reservation) => reservation.status === "CONFIRMED"),
  };
}

type Decision = "confirm" | "refuse" | "cancel";

/** P10: the team confirms (note optional), refuses or cancels (note required) a reservation of its sector. */
export async function decideReservation(
  reservationId: unknown,
  decision: Decision,
  rawNote: unknown,
  store: SpaceStore,
  now: Date = new Date(),
): Promise<void> {
  const actor = await requireSpaceTeam();
  const id = validateInput(entityIdSchema, reservationId);
  const note = decision === "confirm" ? validateInput(optionalNoteSchema, rawNote) || null : validateInput(requiredNoteSchema, rawNote);
  await store.run(async (transaction) => {
    const reservation = await transaction.findReservation(id);
    if (!reservation || reservation.sectorId !== actor.sectorId) throw new NotFoundError();
    const allowed = decision === "cancel" ? canCancelBySector(reservation, now) : canDecide(reservation, now);
    if (!allowed) throw new ValidationError([{ path: ["reservation"], code: "invalid_value" }]);
    if (decision === "cancel") {
      await transaction.updateReservations([id], { status: "CANCELLED", cancelledById: actor.id, cancelledAt: now, cancelNote: note });
    } else {
      await transaction.updateReservations([id], {
        status: decision === "confirm" ? "CONFIRMED" : "REFUSED",
        decidedById: actor.id,
        decidedAt: now,
        decisionNote: note,
      });
    }
    const type = decision === "confirm" ? "reservation.confirmed" : decision === "refuse" ? "reservation.refused" : "reservation.cancelled";
    await transaction.notify([{ recipientId: reservation.requesterId, type, reservationId: id }]);
  });
}
