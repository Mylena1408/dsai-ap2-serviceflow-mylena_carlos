import { z } from "zod";
import type { AuditScope } from "@/modules/audit";
import { requireCurrentActor, type AuthorizationActor } from "@/server/authorization";
import { AuthorizationError, ConflictError, NotFoundError } from "@/server/errors";
import { validateInput } from "@/server/validation";
import { entityIdSchema } from "@/shared/validation";
import { parseHolidayInput, type CalendarSettings, type HolidaySettings } from "../domain/calendar-config";
import { canManageSectorCalendar, parseSectorHoursInput, type SectorHours } from "../domain/sector-calendar";

// Configuring a sector's calendar (SPEC 2026-11-09-comunicacao-e-calendarios, 6.1 and 6.3 items 1 and 2; decision K9;
// SF-253): the administrator for any active sector, a manager for their own; the hours (saved or taken back, so the
// sector follows the organization again) and the holidays (added or removed), each change in the audit trail.

export interface SectorHolidayRecord extends HolidaySettings {
  id: string;
}

export interface SectorCalendarView {
  /** The sectors to choose from: every active one for the administrator, only their own for a manager. */
  sectors: Array<{ id: string; name: string }>;
  /** The sector shown, or null when the administrator has not chosen one. */
  sector: { id: string; name: string } | null;
  /** Null when the sector follows the organization's hours. */
  hours: SectorHours | null;
  holidays: SectorHolidayRecord[];
  /** The organization's calendar, to show what the sector follows. */
  organization: CalendarSettings;
}

export interface SectorCalendarReader {
  activeSectors(sectorId: string | null): Promise<Array<{ id: string; name: string }>>;
  hours(sectorId: string): Promise<SectorHours | null>;
  holidays(sectorId: string): Promise<SectorHolidayRecord[]>;
  organization(): Promise<CalendarSettings>;
}

export interface SectorCalendarTransaction extends AuditScope {
  findSector(sectorId: string): Promise<{ id: string; isActive: boolean } | null>;
  findHours(sectorId: string): Promise<{ id: string } | null>;
  /** Writes the hours of the sector, creating its row the first time. */
  saveHours(sectorId: string, hours: SectorHours, actorId: string): Promise<{ id: string }>;
  deleteHours(calendarId: string): Promise<void>;
  /** Null when the sector already has a holiday on that day. */
  createHoliday(sectorId: string, holiday: HolidaySettings, actorId: string): Promise<{ id: string } | null>;
  findHoliday(holidayId: string): Promise<{ id: string; sectorId: string } | null>;
  deleteHoliday(holidayId: string): Promise<void>;
}

export interface SectorCalendarStore {
  run<T>(work: (transaction: SectorCalendarTransaction) => Promise<T>): Promise<T>;
}

const hoursSchema = z
  .object({
    weekdays: z.array(z.string()).max(7),
    startTime: z.string().max(5),
    endTime: z.string().max(5),
  })
  .strict();

const holidaySchema = z
  .object({
    day: z.string().max(10),
    name: z.string().max(200),
    yearly: z.boolean(),
  })
  .strict();

/** Who may open the screen: the administrator, or a manager with a sector. */
function scopeOf(actor: AuthorizationActor): string | null {
  if (actor.role === "ADMIN") return null;
  if (actor.role === "MANAGER" && actor.sectorId) return actor.sectorId;
  throw new AuthorizationError();
}

export async function getSectorCalendarView(rawSectorId: unknown, reader: SectorCalendarReader): Promise<SectorCalendarView> {
  const scope = scopeOf(await requireCurrentActor());
  const [sectors, organization] = await Promise.all([reader.activeSectors(scope), reader.organization()]);
  // A manager always sees their sector; the administrator, the one chosen (an unknown choice shows none).
  const wanted = scope ?? (typeof rawSectorId === "string" ? rawSectorId : null);
  const sector = sectors.find(({ id }) => id === wanted) ?? null;
  if (!sector) return { sectors, sector: null, hours: null, holidays: [], organization };
  const [hours, holidays] = await Promise.all([reader.hours(sector.id), reader.holidays(sector.id)]);
  return { sectors, sector, hours, holidays, organization };
}

/** The sector, active and managed by the person; otherwise "not found" (a manager learns nothing of other sectors). */
async function managedSector(transaction: SectorCalendarTransaction, actor: AuthorizationActor, sectorId: string): Promise<void> {
  if (!canManageSectorCalendar(actor, sectorId)) throw new NotFoundError();
  const sector = await transaction.findSector(sectorId);
  if (!sector?.isActive) throw new NotFoundError();
}

function sectorIdOf(raw: unknown): string {
  return validateInput(entityIdSchema, raw);
}

export async function saveSectorHours(rawSectorId: unknown, input: unknown, store: SectorCalendarStore): Promise<void> {
  const actor = await requireCurrentActor();
  scopeOf(actor);
  const sectorId = sectorIdOf(rawSectorId);
  const hours = parseSectorHoursInput(validateInput(hoursSchema, input));
  await store.run(async (transaction) => {
    await managedSector(transaction, actor, sectorId);
    const current = await transaction.findHours(sectorId);
    await transaction.audited(
      current
        ? { actor, action: "UPDATED", entityType: "SECTOR_CALENDAR", entityId: current.id }
        : { actor, action: "CREATED", entityType: "SECTOR_CALENDAR" },
      () => transaction.saveHours(sectorId, hours, actor.id),
    );
  });
}

/** Takes the sector's own hours back: it follows the organization's again. Without own hours, nothing changes. */
export async function clearSectorHours(rawSectorId: unknown, store: SectorCalendarStore): Promise<{ changed: boolean }> {
  const actor = await requireCurrentActor();
  scopeOf(actor);
  const sectorId = sectorIdOf(rawSectorId);
  return store.run(async (transaction) => {
    await managedSector(transaction, actor, sectorId);
    const current = await transaction.findHours(sectorId);
    if (!current) return { changed: false };
    await transaction.audited({ actor, action: "DELETED", entityType: "SECTOR_CALENDAR", entityId: current.id }, async () => {
      await transaction.deleteHours(current.id);
      return { id: current.id };
    });
    return { changed: true };
  });
}

/** 6.1 item 2: a second holiday of the sector on the same day is a conflict. */
export async function createSectorHoliday(rawSectorId: unknown, input: unknown, store: SectorCalendarStore): Promise<{ id: string }> {
  const actor = await requireCurrentActor();
  scopeOf(actor);
  const sectorId = sectorIdOf(rawSectorId);
  const holiday = parseHolidayInput(validateInput(holidaySchema, input));
  return store.run(async (transaction) => {
    await managedSector(transaction, actor, sectorId);
    return transaction.audited({ actor, action: "CREATED", entityType: "SECTOR_HOLIDAY" }, async () => {
      const created = await transaction.createHoliday(sectorId, holiday, actor.id);
      if (!created) throw new ConflictError();
      return created;
    });
  });
}

/** The removal deletes the row; the audit keeps its day and name. Another sector's holiday is "not found". */
export async function deleteSectorHoliday(rawHolidayId: unknown, store: SectorCalendarStore): Promise<void> {
  const actor = await requireCurrentActor();
  scopeOf(actor);
  const holidayId = validateInput(entityIdSchema, rawHolidayId);
  await store.run(async (transaction) => {
    const holiday = await transaction.findHoliday(holidayId);
    if (!holiday || !canManageSectorCalendar(actor, holiday.sectorId)) throw new NotFoundError();
    await transaction.audited({ actor, action: "DELETED", entityType: "SECTOR_HOLIDAY", entityId: holidayId }, async () => {
      await transaction.deleteHoliday(holidayId);
      return { id: holidayId };
    });
  });
}
