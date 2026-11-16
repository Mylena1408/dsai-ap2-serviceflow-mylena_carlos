import { addDays, isoWeekdayOf, zonedDayOf, zonedInstantOf } from "@/shared/time";

// Reservations of a space (SPEC 2026-11-16-professores-e-tecnicos, part D; decisions P7 to P12). The rules of the time
// of a reservation and of a weekly series; the database keeps the one about overlaps (P11).

export const RESERVATION_PURPOSES = ["CLASS", "LAB_USE", "MEETING", "EVENT", "EXAM", "OTHER"] as const;
export type ReservationPurpose = (typeof RESERVATION_PURPOSES)[number];
/** P7: the purposes a person chooses; "Aplicação de prova" comes only from an exam's allocation (P13). */
export const CHOOSABLE_PURPOSES = ["CLASS", "LAB_USE", "MEETING", "EVENT", "OTHER"] as const satisfies readonly ReservationPurpose[];

export const RESERVATION_PURPOSE_LABELS: Record<ReservationPurpose, string> = {
  CLASS: "Aula",
  LAB_USE: "Uso de laboratório",
  MEETING: "Reunião",
  EVENT: "Evento",
  EXAM: "Aplicação de prova",
  OTHER: "Outro",
};

export const RESERVATION_STATUSES = ["PENDING", "CONFIRMED", "REFUSED", "CANCELLED"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmada",
  REFUSED: "Recusada",
  CANCELLED: "Cancelada",
};

/** P11: the statuses that hold the time of the space. */
export const HOLDING_STATUSES: readonly ReservationStatus[] = ["PENDING", "CONFIRMED"];

/** P7: from 07:00 to 23:00, in steps of 15 minutes, from 30 minutes to 8 hours. */
export const FIRST_MINUTE = 7 * 60;
export const LAST_MINUTE = 23 * 60;
export const MINUTE_STEP = 15;
export const MIN_DURATION = 30;
export const MAX_DURATION = 8 * 60;
/** P8: a weekly series has at most 26 dates. */
export const MAX_WEEKS = 26;
export const MAX_DESCRIPTION = 500;
export const MAX_NOTE = 500;

export type SlotProblem = "past" | "holiday" | "outside_hours" | "step" | "too_short" | "too_long";

export const SLOT_PROBLEM_LABELS: Record<SlotProblem | "conflict", string> = {
  past: "a data já passou",
  holiday: "é feriado no calendário do setor",
  outside_hours: "fora do horário de reservas (07:00 às 23:00)",
  step: "use horários de 15 em 15 minutos",
  too_short: "a reserva tem no mínimo 30 minutos",
  too_long: "a reserva tem no máximo 8 horas",
  conflict: "o espaço já está reservado nesse horário",
};

export interface Holiday {
  day: string;
  yearly: boolean;
}

/** "HH:MM" as minutes of the day, or null. */
export function minuteOfClock(text: string): number | null {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes of the day as "HH:MM". */
export function clockOfMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** Whether a calendar day is one of the holidays (a yearly one on the same day and month). */
export function isHoliday(day: string, holidays: readonly Holiday[]): boolean {
  return holidays.some((holiday) => holiday.day === day || (holiday.yearly && holiday.day.slice(5) === day.slice(5)));
}

export interface SlotRules {
  now: Date;
  timeZone: string;
  holidays: readonly Holiday[];
}

/** P7: what is wrong with a time on a day, before looking at the other reservations; null when it is fine. */
export function slotProblem(day: string, startMinute: number, endMinute: number, rules: SlotRules): SlotProblem | null {
  if (startMinute % MINUTE_STEP !== 0 || endMinute % MINUTE_STEP !== 0) return "step";
  if (startMinute < FIRST_MINUTE || endMinute > LAST_MINUTE || endMinute <= startMinute) return "outside_hours";
  if (endMinute - startMinute < MIN_DURATION) return "too_short";
  if (endMinute - startMinute > MAX_DURATION) return "too_long";
  if (isHoliday(day, rules.holidays)) return "holiday";
  if (zonedInstantOf(day, startMinute, rules.timeZone).getTime() <= rules.now.getTime()) return "past";
  return null;
}

/** P8: the dates of a weekly series, from the first day to the last one (inclusive), the same weekday; null if too long. */
export function weeklyDays(firstDay: string, lastDay: string): string[] | null {
  if (lastDay < firstDay) return null;
  const days: string[] = [];
  for (let day = firstDay; day <= lastDay; day = addDays(day, 7)) {
    days.push(day);
    if (days.length > MAX_WEEKS) return null;
  }
  return days;
}

export interface Period {
  startsAt: Date;
  endsAt: Date;
}

/** Half-open periods overlap when each starts before the other ends: one may start when the other ends. */
export function overlaps(left: Period, right: Period): boolean {
  return left.startsAt.getTime() < right.endsAt.getTime() && right.startsAt.getTime() < left.endsAt.getTime();
}

/** The instants of a time on a day, in the time zone of the organization. */
export function periodOf(day: string, startMinute: number, endMinute: number, timeZone: string): Period {
  return { startsAt: zonedInstantOf(day, startMinute, timeZone), endsAt: zonedInstantOf(day, endMinute, timeZone) };
}

export interface ReservationRecord extends Period {
  id: string;
  spaceId: string;
  spaceName: string;
  sectorId: string;
  sectorName: string;
  requesterId: string;
  requesterName: string;
  purpose: ReservationPurpose;
  description: string;
  attendees: number;
  status: ReservationStatus;
  seriesId: string | null;
  examRequestId: string | null;
  decisionNote: string | null;
  cancelNote: string | null;
}

/** P10: the person who reserved cancels a pending or confirmed reservation until it starts. */
export function canCancelOwn(reservation: Pick<ReservationRecord, "status" | "startsAt">, now: Date): boolean {
  return HOLDING_STATUSES.includes(reservation.status) && reservation.startsAt.getTime() > now.getTime();
}

/** P10: the sector's team confirms or refuses a pending reservation that has not started. */
export function canDecide(reservation: Pick<ReservationRecord, "status" | "startsAt">, now: Date): boolean {
  return reservation.status === "PENDING" && reservation.startsAt.getTime() > now.getTime();
}

/** P10: the sector's team cancels a pending or confirmed one that has not ended. */
export function canCancelBySector(reservation: Pick<ReservationRecord, "status" | "endsAt">, now: Date): boolean {
  return HOLDING_STATUSES.includes(reservation.status) && reservation.endsAt.getTime() > now.getTime();
}

/** P12: the Monday of the week of a day, the agenda's first day. */
export function weekStartOf(day: string): string {
  return addDays(day, 1 - isoWeekdayOf(day));
}

/** The seven days of the week that starts on a Monday. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export interface AgendaEntry {
  day: string;
  start: string;
  end: string;
  status: ReservationStatus;
  purpose: ReservationPurpose;
  requesterName: string;
  description: string;
}

/** P12: the week of a space, day by day, the holding reservations in order of time, with who and why (P17). */
export function agendaOf(
  reservations: readonly ReservationRecord[],
  monday: string,
  timeZone: string,
): Array<{ day: string; entries: AgendaEntry[] }> {
  const holding = reservations
    .filter((reservation) => HOLDING_STATUSES.includes(reservation.status))
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime() || left.id.localeCompare(right.id));
  return weekDays(monday).map((day) => ({
    day,
    entries: holding
      .filter((reservation) => zonedDayOf(reservation.startsAt, timeZone) === day)
      .map((reservation) => ({
        day,
        start: clockOfZoned(reservation.startsAt, timeZone),
        end: clockOfZoned(reservation.endsAt, timeZone),
        status: reservation.status,
        purpose: reservation.purpose,
        requesterName: reservation.requesterName,
        description: reservation.description,
      })),
  }));
}

/** "HH:MM" of an instant in the time zone. */
export function clockOfZoned(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
}

/** "dd/mm/aaaa" of a calendar day. */
export function dayLabel(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}
