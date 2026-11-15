import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@/server/errors";

const authorization = vi.hoisted(() => ({ requireCurrentActor: vi.fn() }));
vi.mock("@/server/authorization", () => authorization);
vi.mock("@/app/_components/sector-calendar-actions", () => ({
  clearSectorHoursAction: vi.fn(),
  createSectorHolidayAction: vi.fn(),
  deleteSectorHolidayAction: vi.fn(),
  saveSectorHoursAction: vi.fn(),
}));

import {
  clearSectorHours,
  createSectorHoliday,
  deleteSectorHoliday,
  getSectorCalendarView,
  saveSectorHours,
  type SectorCalendarReader,
  type SectorCalendarStore,
  type SectorCalendarTransaction,
} from "@/modules/calendar/application/sector-calendar-admin";
import { canManageSectorCalendar } from "@/modules/calendar";
import { SectorCalendarPanel, holidayDate, hoursText, sectorCalendarMessage } from "@/app/_components/sector-calendar";

// SPEC 2026-11-09-comunicacao-e-calendarios, 6.1 and 6.3 items 1 and 2 (decision K9; SF-253; CA-CAL-02).

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const H1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORGANIZATION = { weekdays: [1, 2, 3, 4, 5], startMinute: 480, endMinute: 1080, timeZone: "America/Sao_Paulo" };

const as = (role: string, sectorId: string | null = null) => authorization.requireCurrentActor.mockResolvedValue({ id: `${role}-1`, role, sectorId, isActive: true });

function reader(): SectorCalendarReader & { activeSectors: ReturnType<typeof vi.fn> } {
  const sectors = [
    { id: S1, name: "Central" },
    { id: S2, name: "Manutenção" },
  ];
  return {
    activeSectors: vi.fn(async (scope: string | null) => sectors.filter(({ id }) => scope === null || id === scope)),
    hours: vi.fn(async (sectorId: string) => (sectorId === S1 ? { weekdays: [1, 2, 3, 4, 5, 6], startMinute: 420, endMinute: 1140 } : null)),
    holidays: vi.fn(async () => [{ id: H1, day: "2026-11-20", name: "Feriado local", yearly: false }]),
    organization: vi.fn(async () => ORGANIZATION),
    organizationHolidays: vi.fn(async () => [{ id: "org-1", day: "2026-12-25", name: "Natal", yearly: true }]),
  };
}

function memory(options: { sectorActive?: boolean; hours?: boolean; holidaySector?: string; dayTaken?: boolean } = {}) {
  const audits: Array<{ action: string; entityType: string; entityId?: string }> = [];
  const calls: string[] = [];
  const transaction: SectorCalendarTransaction = {
    async audited(meta, change) {
      audits.push({ action: meta.action, entityType: meta.entityType, entityId: meta.entityId });
      return change();
    },
    findSector: async (id) => ({ id, isActive: options.sectorActive ?? true }),
    findHours: async () => (options.hours ? { id: "cal-1" } : null),
    saveHours: async (sectorId, hours) => {
      calls.push(`save ${sectorId} ${hours.weekdays.join("")} ${hours.startMinute}-${hours.endMinute}`);
      return { id: "cal-1" };
    },
    deleteHours: async (id) => void calls.push(`delete-hours ${id}`),
    createHoliday: async (sectorId, holiday) => (options.dayTaken ? null : (calls.push(`holiday ${sectorId} ${holiday.day}`), { id: H1 })),
    findHoliday: async (id) => (options.holidaySector ? { id, sectorId: options.holidaySector } : null),
    deleteHoliday: async (id) => void calls.push(`delete-holiday ${id}`),
  };
  const store: SectorCalendarStore = { run: (work) => work(transaction) };
  return { store, audits, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("who configures (decision K9)", () => {
  it("the administrator any sector, a manager only their own, nobody else", () => {
    expect(canManageSectorCalendar({ role: "ADMIN", sectorId: null }, S2)).toBe(true);
    expect(canManageSectorCalendar({ role: "MANAGER", sectorId: S1 }, S1)).toBe(true);
    expect(canManageSectorCalendar({ role: "MANAGER", sectorId: S1 }, S2)).toBe(false);
    expect(canManageSectorCalendar({ role: "ATTENDANT", sectorId: S1 }, S1)).toBe(false);
  });
});

describe("getSectorCalendarView", () => {
  it("gives the administrator every active sector and the one chosen, with its hours and holidays", async () => {
    as("ADMIN");
    const source = reader();
    expect(await getSectorCalendarView(S1, source)).toMatchObject({
      sectors: [{ id: S1 }, { id: S2 }],
      sector: { id: S1, name: "Central" },
      hours: { weekdays: [1, 2, 3, 4, 5, 6] },
      holidays: [{ id: H1 }],
      organization: ORGANIZATION,
    });
    expect(source.activeSectors).toHaveBeenCalledWith(null);
    // No choice, or an unknown one: no sector open.
    expect(await getSectorCalendarView(undefined, source)).toMatchObject({ sector: null, hours: null, holidays: [] });
    expect(await getSectorCalendarView("99999999-9999-4999-8999-999999999999", source)).toMatchObject({ sector: null });
  });

  it("gives a manager only their sector, whatever was asked; a sector without hours follows the organization", async () => {
    as("MANAGER", S2);
    const source = reader();
    expect(await getSectorCalendarView(S1, source)).toMatchObject({ sectors: [{ id: S2 }], sector: { id: S2 }, hours: null });
    expect(source.activeSectors).toHaveBeenCalledWith(S2);
  });

  it.each([["ATTENDANT", S1], ["REQUESTER", null], ["MANAGER", null]])("refuses %s (sector %s)", async (role, sectorId) => {
    as(role, sectorId);
    await expect(getSectorCalendarView(S1, reader())).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("the hours (6.3 item 2)", () => {
  it("the first save creates the sector's calendar and the next ones change it, each in the audit trail", async () => {
    as("MANAGER", S1);
    const first = memory();
    await saveSectorHours(S1, { weekdays: ["6", "1"], startTime: "07:00", endTime: "19:00" }, first.store);
    expect(first.calls).toEqual(["save 11111111-1111-4111-8111-111111111111 16 420-1140"]);
    expect(first.audits).toEqual([{ action: "CREATED", entityType: "SECTOR_CALENDAR", entityId: undefined }]);
    const next = memory({ hours: true });
    await saveSectorHours(S1, { weekdays: ["1"], startTime: "08:00", endTime: "12:00" }, next.store);
    expect(next.audits).toEqual([{ action: "UPDATED", entityType: "SECTOR_CALENDAR", entityId: "cal-1" }]);
  });

  it("refuses invalid hours, another sector of a manager and an inactive sector, writing nothing", async () => {
    as("MANAGER", S1);
    const target = memory();
    await expect(saveSectorHours(S1, { weekdays: [], startTime: "08:00", endTime: "18:00" }, target.store)).rejects.toBeInstanceOf(ValidationError);
    await expect(saveSectorHours(S1, { weekdays: ["1"], startTime: "08:00", endTime: "18:00", timeZone: "UTC" }, target.store)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(saveSectorHours(S2, { weekdays: ["1"], startTime: "08:00", endTime: "18:00" }, target.store)).rejects.toBeInstanceOf(NotFoundError);
    as("ADMIN");
    await expect(saveSectorHours(S2, { weekdays: ["1"], startTime: "08:00", endTime: "18:00" }, memory({ sectorActive: false }).store)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(target.calls).toEqual([]);
    as("ATTENDANT", S1);
    await expect(saveSectorHours(S1, { weekdays: ["1"], startTime: "08:00", endTime: "18:00" }, target.store)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("taking the hours back deletes them in the audit trail; without hours, nothing changes", async () => {
    as("ADMIN");
    const own = memory({ hours: true });
    expect(await clearSectorHours(S2, own.store)).toEqual({ changed: true });
    expect(own.calls).toEqual(["delete-hours cal-1"]);
    expect(own.audits).toEqual([{ action: "DELETED", entityType: "SECTOR_CALENDAR", entityId: "cal-1" }]);
    const none = memory();
    expect(await clearSectorHours(S2, none.store)).toEqual({ changed: false });
    expect(none.audits).toEqual([]);
  });
});

describe("the holidays (6.1 item 2)", () => {
  it("adds a holiday in the audit trail; the same day twice is a conflict", async () => {
    as("MANAGER", S1);
    const target = memory();
    expect(await createSectorHoliday(S1, { day: "2026-11-20", name: " Feriado local ", yearly: false }, target.store)).toEqual({ id: H1 });
    expect(target.calls).toEqual(["holiday 11111111-1111-4111-8111-111111111111 2026-11-20"]);
    expect(target.audits).toEqual([{ action: "CREATED", entityType: "SECTOR_HOLIDAY", entityId: undefined }]);
    await expect(createSectorHoliday(S1, { day: "2026-11-20", name: "Outro", yearly: false }, memory({ dayTaken: true }).store)).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(createSectorHoliday(S1, { day: "20/11/2026", name: "X", yearly: false }, target.store)).rejects.toBeInstanceOf(ValidationError);
  });

  it("removes a holiday of a sector the person manages; another sector's is 'not found'", async () => {
    as("MANAGER", S1);
    const mine = memory({ holidaySector: S1 });
    await deleteSectorHoliday(H1, mine.store);
    expect(mine.audits).toEqual([{ action: "DELETED", entityType: "SECTOR_HOLIDAY", entityId: H1 }]);
    const other = memory({ holidaySector: S2 });
    await expect(deleteSectorHoliday(H1, other.store)).rejects.toBeInstanceOf(NotFoundError);
    expect(other.calls).toEqual([]);
    await expect(deleteSectorHoliday(H1, memory().store)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("the panel", () => {
  const view = (overrides = {}) => ({
    sectors: [{ id: S1, name: "Central" }],
    sector: { id: S1, name: "Central" },
    hours: null,
    holidays: [],
    organization: ORGANIZATION,
    organizationHolidays: [],
    ...overrides,
  });

  it("shows the organization's hours when the sector follows them, without the button to go back", () => {
    const html = renderToStaticMarkup(createElement(SectorCalendarPanel, { view: view(), area: "approvals" }));
    expect(html).toContain("Segue o expediente da organização: Segunda-feira, Terça-feira, Quarta-feira, Quinta-feira, Sexta-feira; das 08:00 às 18:00.");
    expect(html).not.toContain("Voltar ao expediente da organização");
    expect(html).not.toContain("Escolher o setor");
    expect(html).toContain("Nenhum feriado próprio do setor.");
  });

  it("shows own hours with the button to go back, the holidays, and the sector choice for the administrator", () => {
    const html = renderToStaticMarkup(
      createElement(SectorCalendarPanel, {
        view: view({ hours: { weekdays: [6], startMinute: 420, endMinute: 780 }, holidays: [{ id: H1, day: "2026-12-24", name: "Véspera", yearly: true }] }),
        area: "admin",
        message: "hours-saved",
      }),
    );
    expect(html).toContain("Expediente próprio: Sábado; das 07:00 às 13:00.");
    expect(html).toContain("Voltar ao expediente da organização");
    expect(html).toContain("24/12 (todo ano)");
    expect(html).toContain('aria-label="Escolher o setor"');
    expect(html).toContain('role="status"');
    const none = renderToStaticMarkup(createElement(SectorCalendarPanel, { view: view({ sector: null }), area: "admin" }));
    expect(none).toContain("Escolha um setor para ver e mudar o calendário dele.");
  });

  it("names the results and formats days and windows", () => {
    expect(sectorCalendarMessage("holiday-taken")).toEqual({ text: "O setor já tem um feriado nessa data.", error: true });
    expect(sectorCalendarMessage("other")).toBeNull();
    expect(holidayDate("2026-11-20", false)).toBe("20/11/2026");
    expect(hoursText({ weekdays: [7, 1], startMinute: 0, endMinute: 1440 })).toBe("Segunda-feira, Domingo; das 00:00 às 24:00");
  });
});
