import { beforeEach, describe, expect, it, vi } from "vitest";

const announcements = vi.hoisted(() => ({ getAnnouncementsInForce: vi.fn() }));
const calendar = vi.hoisted(() => ({ getSectorCalendarView: vi.fn() }));
vi.mock("@/modules/announcements", () => announcements);
vi.mock("@/modules/calendar", () => calendar);

import { announcementsInForce, type AnnouncementRecord } from "@/modules/announcements/domain/announcement";
import { announcementRepresentation, sectorCalendarRepresentation } from "@/modules/public-api/domain/representation";
import { ApiRefusal, announcements as listAnnouncements, sectorCalendar, type ApiCaller } from "@/modules/public-api/application/endpoints";
import { NotFoundError, ValidationError } from "@/server/errors";

// SPEC 2026-11-09-comunicacao-e-calendarios, 7 item 2 (SF-258; CA-COM-02 for the API).

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-15T12:00:00.000Z");
const HOUR = 3_600_000;

const record = (id: string, overrides: Partial<AnnouncementRecord> = {}): AnnouncementRecord => ({
  id,
  title: id,
  body: "Texto",
  kind: "NOTICE",
  level: "INFO",
  audience: "ALL",
  audienceRole: null,
  audienceSectorId: null,
  startsAt: new Date(NOW.getTime() - HOUR),
  endsAt: new Date(NOW.getTime() + HOUR),
  leadHours: null,
  createdAt: new Date(NOW.getTime() - 2 * HOUR),
  ...overrides,
});

describe("announcementsInForce (7 item 2)", () => {
  const viewer = { id: "u1", role: "ATTENDANT" as const, sectorId: S1 };

  it("keeps the person's audience shown now, urgent first, without the strip's limit", () => {
    const list = [
      record("a"),
      record("b"),
      record("c"),
      record("d"),
      record("urgent", { level: "WARNING" }),
      record("other-sector", { audience: "SECTOR", audienceSectorId: S2 }),
      record("my-sector", { audience: "SECTOR", audienceSectorId: S1 }),
      record("requesters", { audience: "ROLE", audienceRole: "REQUESTER" }),
      record("ended", { endsAt: new Date(NOW.getTime() - 1) }),
      record("lead", { kind: "MAINTENANCE", level: "WARNING", startsAt: new Date(NOW.getTime() + 2 * HOUR), endsAt: new Date(NOW.getTime() + 3 * HOUR), leadHours: 3 }),
      record("too-early", { kind: "MAINTENANCE", level: "WARNING", startsAt: new Date(NOW.getTime() + 5 * HOUR), endsAt: new Date(NOW.getTime() + 6 * HOUR), leadHours: 3 }),
    ];
    const ids = announcementsInForce(list, viewer, NOW).map(({ id }) => id);
    expect(ids.slice(0, 2)).toEqual(["lead", "urgent"]);
    expect([...ids].sort()).toEqual(["a", "b", "c", "d", "lead", "my-sector", "urgent"]);
  });
});

describe("the representations", () => {
  it("an announcement with its audience, instants and the person's dismissal", () => {
    expect(
      announcementRepresentation({ ...record("x", { audience: "SECTOR", audienceSectorId: S1 }), phase: null, dismissible: true, dismissed: false }),
    ).toEqual({
      id: "x",
      title: "x",
      body: "Texto",
      kind: "NOTICE",
      level: "INFO",
      audience: { type: "SECTOR", role: null, sectorId: S1 },
      startsAt: "2026-11-15T11:00:00.000Z",
      endsAt: "2026-11-15T13:00:00.000Z",
      leadHours: null,
      phase: null,
      dismissible: true,
      dismissed: false,
    });
  });

  it("the effective calendar: own hours or the organization's, the organization's time zone, both holidays by day", () => {
    const organization = { weekdays: [5, 1, 2, 3, 4], startMinute: 480, endMinute: 1080, timeZone: "America/Sao_Paulo" };
    const holidays = [{ day: "2026-11-20", name: "Local", yearly: false }];
    const organizationHolidays = [{ day: "2026-12-25", name: "Natal", yearly: true }, { day: "2026-11-02", name: "Finados", yearly: true }];
    const follows = sectorCalendarRepresentation({ sector: { id: S1, name: "Central" }, hours: null, organization, holidays, organizationHolidays });
    expect(follows).toEqual({
      sector: { id: S1, name: "Central" },
      ownHours: false,
      weekdays: [1, 2, 3, 4, 5],
      startTime: "08:00",
      endTime: "18:00",
      timeZone: "America/Sao_Paulo",
      holidays: [
        { day: "2026-11-02", name: "Finados", yearly: true, source: "organization" },
        { day: "2026-11-20", name: "Local", yearly: false, source: "sector" },
        { day: "2026-12-25", name: "Natal", yearly: true, source: "organization" },
      ],
    });
    const own = sectorCalendarRepresentation({ sector: { id: S1, name: "Central" }, hours: { weekdays: [6], startMinute: 0, endMinute: 1440 }, organization, holidays: [], organizationHolidays: [] });
    expect(own).toMatchObject({ ownHours: true, weekdays: [6], startTime: "00:00", endTime: "24:00", timeZone: "America/Sao_Paulo" });
  });
});

describe("the endpoints", () => {
  const caller = (role: ApiCaller["user"]["role"], sectorId: string | null = S1): ApiCaller => ({
    user: { id: "u1", name: "Pessoa", email: "p@example.test", role, sectorId, isActive: true },
    scope: "READ",
    expiresAt: new Date(NOW.getTime() + 24 * HOUR),
    sectorName: "Central",
  });
  const view = (sectorId: string | null) => ({
    sectors: [],
    sector: sectorId ? { id: sectorId, name: "Central" } : null,
    hours: null,
    holidays: [],
    organization: { weekdays: [1, 2, 3, 4, 5], startMinute: 480, endMinute: 1080, timeZone: "America/Sao_Paulo" },
    organizationHolidays: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("announcements: every profile, as the use case gives them", async () => {
    announcements.getAnnouncementsInForce.mockResolvedValue([{ ...record("x"), phase: null, dismissible: true, dismissed: true }]);
    expect(await listAnnouncements()).toMatchObject({ status: 200, body: { items: [{ id: "x", dismissed: true }] } });
  });

  it("calendar: only a manager, only their sector; an invalid id is refused before reading", async () => {
    calendar.getSectorCalendarView.mockResolvedValue(view(S1));
    expect(await sectorCalendar(caller("MANAGER"), S1)).toMatchObject({ status: 200, body: { sector: { id: S1 }, ownHours: false } });
    // The use case answers with the manager's own sector whatever was asked: another sector is "not found".
    await expect(sectorCalendar(caller("MANAGER"), S2)).rejects.toBeInstanceOf(NotFoundError);
    calendar.getSectorCalendarView.mockClear();
    await expect(sectorCalendar(caller("MANAGER"), "x")).rejects.toBeInstanceOf(ValidationError);
    expect(calendar.getSectorCalendarView).not.toHaveBeenCalled();
    for (const role of ["ATTENDANT", "REQUESTER"] as const) {
      await expect(sectorCalendar(caller(role), S1)).rejects.toBeInstanceOf(ApiRefusal);
    }
  });
});
