import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/authorization", () => ({
  requireConfigurationAdministrator: vi.fn(async () => ({ id: "adm", role: "ADMIN", isActive: true, sectorId: null })),
}));

import { buildConfigurationData, configurationFileSchema, repeatedKeys, type ConfigurationData, type ConfigurationSnapshot } from "@/modules/configuration";
import { classifyItems, keyProblems } from "@/modules/configuration/domain/preview";
import { validateConfiguration, type DestinationFacts } from "@/modules/configuration/domain/validation";
import { previewConfigurationImport, type ConfigurationImportStore } from "@/modules/configuration/application/preview-import";
import { announcementKey, type AnnouncementItem } from "@/modules/configuration/domain/format";

// SPEC 2026-11-09-comunicacao-e-calendarios, 7 item 1 (SF-257; CA-COM-01 by the rules): the file's version 3 carries
// each sector's own hours and holidays and the announcements not started yet; versions 1 and 2 are still accepted.

type Sector = ConfigurationData["sectors"][number];

const NOW = new Date("2026-11-15T12:00:00.000Z");
const facts: DestinationFacts = { sectorsWithPendingRequests: [], sectorsWithActiveAttendants: [], now: NOW };

const sector = (overrides: Partial<Sector> = {}): Sector => ({
  name: "Manutenção",
  isActive: true,
  escalateOverdue: false,
  distributionMode: "NONE",
  maxActivePerAttendant: null,
  redistributeOnAbsence: false,
  escalationRules: [],
  cannedResponses: [],
  tags: [],
  calendar: { weekdays: [1, 2, 3, 4, 5, 6], startTime: "07:00", endTime: "19:00" },
  holidays: [{ day: "2026-12-24", name: "Véspera de Natal", yearly: true }],
  ...overrides,
});

const announcement = (overrides: Partial<AnnouncementItem> = {}): AnnouncementItem => ({
  title: "Troca dos aparelhos",
  body: "O ar-condicionado do 2º andar será trocado.",
  kind: "MAINTENANCE",
  level: "WARNING",
  audience: "SECTOR",
  audienceRole: null,
  audienceSector: "Manutenção",
  startsAt: "2026-12-01T12:00:00.000Z",
  endsAt: "2026-12-01T16:00:00.000Z",
  leadHours: 24,
  ...overrides,
});

const data = (): ConfigurationData => ({
  sectors: [sector()],
  categories: [],
  services: [],
  accessRoles: [],
  calendar: null,
  holidays: [],
  bundles: [],
  announcements: [announcement()],
});

const empty = (): ConfigurationData => ({ sectors: [], categories: [], services: [], accessRoles: [], calendar: null, holidays: [], bundles: [], announcements: [] });
const fileOf = (version: number, content: ConfigurationData) => ({ format: "serviceflow-config", version, exportedAt: "2026-11-15T12:00:00.000Z", data: content });

/** The same data as a version 2 file carries it: without the sectors' calendars and holidays and the announcements. */
function asVersion2(content: ConfigurationData): ConfigurationData {
  const copy: ConfigurationData = { ...content, sectors: content.sectors.map((item) => ({ ...item })) };
  for (const item of copy.sectors) {
    delete item.calendar;
    delete item.holidays;
  }
  delete copy.announcements;
  return copy;
}

const issuesOf = (file: unknown) => {
  const result = configurationFileSchema.safeParse(file);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("the format's version 3", () => {
  it("accepts version 3 with the new lists, and version 2 without them", () => {
    expect(issuesOf(fileOf(3, data()))).toEqual([]);
    expect(issuesOf(fileOf(2, asVersion2(data())))).toEqual([]);
  });

  it("refuses version 2 with the new lists and version 3 without them, naming where", () => {
    expect(issuesOf(fileOf(2, data()))).toEqual(["data.sectors.0.calendar", "data.sectors.0.holidays", "data.announcements"]);
    expect(issuesOf(fileOf(3, asVersion2(data())))).toEqual(["data.sectors.0.calendar", "data.sectors.0.holidays", "data.announcements"]);
  });

  it("a sector that follows the organization's hours carries null; repeated holidays and announcements are named", () => {
    const content = data();
    content.sectors[0]!.calendar = null;
    expect(issuesOf(fileOf(3, content))).toEqual([]);
    content.sectors[0]!.holidays = [...content.sectors[0]!.holidays!, { day: "2026-12-24", name: "Outro", yearly: false }];
    content.announcements = [announcement(), announcement({ body: "Repetido" })];
    expect(repeatedKeys(content)).toEqual(["Manutenção › feriados: 2026-12-24", `avisos: ${announcementKey(announcement())}`]);
  });
});

describe("the exported calendars, holidays and announcements", () => {
  const ids = { ti: "11111111-1111-4111-8111-111111111111", maintenance: "22222222-2222-4222-8222-222222222222" };
  const snapshot = (): ConfigurationSnapshot => ({
    sectors: [
      { id: ids.ti, name: "TI", isActive: true, escalateOverdue: false, distributionMode: "NONE", maxActivePerAttendant: null, redistributeOnAbsence: false },
      { id: ids.maintenance, name: "Manutenção", isActive: true, escalateOverdue: false, distributionMode: "NONE", maxActivePerAttendant: null, redistributeOnAbsence: false },
    ],
    escalationRules: [],
    cannedResponses: [],
    tags: [],
    categories: [],
    services: [],
    fields: [],
    documents: [],
    stages: [],
    articles: [],
    checklistItems: [],
    accessRoles: [],
    calendar: null,
    holidays: [],
    bundles: [],
    sectorCalendars: [{ sectorId: ids.maintenance, weekdays: [6, 1, 2], startMinute: 420, endMinute: 1140 }],
    sectorHolidays: [
      { sectorId: ids.maintenance, day: "2026-12-24", name: "Véspera", yearly: true },
      { sectorId: ids.maintenance, day: "2026-11-20", name: "Consciência Negra", yearly: false },
    ],
    announcements: [
      {
        title: "Troca dos aparelhos",
        body: "Texto",
        kind: "MAINTENANCE",
        level: "WARNING",
        audience: "SECTOR",
        audienceRole: null,
        audienceSectorId: ids.maintenance,
        startsAt: new Date("2026-12-01T12:00:00.000Z"),
        endsAt: new Date("2026-12-01T16:00:00.000Z"),
        leadHours: 24,
      },
      {
        title: "Novo catálogo",
        body: "Texto",
        kind: "NOTICE",
        level: "INFO",
        audience: "ROLE",
        audienceRole: "REQUESTER",
        audienceSectorId: null,
        startsAt: new Date("2026-11-20T12:00:00.000Z"),
        endsAt: new Date("2026-11-27T12:00:00.000Z"),
        leadHours: null,
      },
    ],
    emails: {},
  });

  it("each sector carries its own hours (or null) and holidays by day; announcements by start, with the sector's name", () => {
    const exported = buildConfigurationData(snapshot());
    const [maintenance, ti] = exported.sectors;
    expect(maintenance).toMatchObject({
      name: "Manutenção",
      calendar: { weekdays: [1, 2, 6], startTime: "07:00", endTime: "19:00" },
      holidays: [
        { day: "2026-11-20", name: "Consciência Negra", yearly: false },
        { day: "2026-12-24", name: "Véspera", yearly: true },
      ],
    });
    expect(ti).toMatchObject({ name: "TI", calendar: null, holidays: [] });
    expect(exported.announcements!.map(({ title, audienceSector, startsAt }) => [title, audienceSector, startsAt])).toEqual([
      ["Novo catálogo", null, "2026-11-20T12:00:00.000Z"],
      ["Troca dos aparelhos", "Manutenção", "2026-12-01T12:00:00.000Z"],
    ]);
    expect(JSON.stringify(exported)).not.toContain(ids.maintenance);
    expect(issuesOf(fileOf(3, exported))).toEqual([]);
  });
});

describe("the preview of the new items", () => {
  it("classifies the sector's calendar, holidays and the announcements against the destination", () => {
    const destination = data();
    destination.sectors[0]!.calendar = { weekdays: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "18:00" };
    const items = classifyItems(data(), destination).filter(({ kind }) => ["sectorCalendar", "sectorHoliday", "announcement"].includes(kind));
    expect(items).toEqual([
      { kind: "sectorCalendar", label: "Manutenção › Calendário", status: "changed", changes: ["weekdays", "startTime", "endTime"] },
      { kind: "sectorHoliday", label: "Manutenção › 2026-12-24 Véspera de Natal", status: "equal", changes: [] },
      { kind: "announcement", label: `${announcementKey(announcement())}`, status: "equal", changes: [] },
    ]);
    // The sector itself does not change because of its calendar or holidays.
    expect(classifyItems(data(), destination).find(({ kind }) => kind === "sector")).toMatchObject({ status: "equal" });
  });

  it("a sector without own hours in the file leaves the destination's as they are (no item)", () => {
    const file = data();
    file.sectors[0]!.calendar = null;
    expect(classifyItems(file, empty()).some(({ kind }) => kind === "sectorCalendar")).toBe(false);
  });

  it("names the repeated keys of the file", () => {
    const file = data();
    file.announcements = [announcement(), announcement()];
    expect(keyProblems(file, []).map(({ path }) => path)).toEqual([`avisos: ${announcementKey(announcement())}`]);
  });
});

describe("the screens' rules for the new items", () => {
  const paths = (file: ConfigurationData, destination: ConfigurationData = empty()) => validateConfiguration(file, destination, facts).map(({ path }) => path);

  it("accepts valid items and checks nothing that is equal to the destination", () => {
    expect(paths(data())).toEqual([]);
    const ended = data();
    ended.announcements = [announcement({ startsAt: "2026-11-01T12:00:00.000Z", endsAt: "2026-11-01T13:00:00.000Z" })];
    // The same ended announcement already in the destination is not checked again.
    expect(paths(ended, ended)).toEqual([]);
  });

  it("refuses the sector's hours and holidays that break the screen's rules", () => {
    const file = data();
    file.sectors[0]!.calendar = { weekdays: [], startTime: "19:00", endTime: "07:00" };
    file.sectors[0]!.holidays = [
      { day: "2026-02-30", name: "Dia que não existe", yearly: false },
      { day: "2026-12-31", name: " Réveillon", yearly: false },
    ];
    expect(paths(file)).toEqual([
      "sectors › Manutenção › calendar › weekdays",
      "sectors › Manutenção › holidays › 2026-02-30 › day",
      "sectors › Manutenção › holidays › 2026-12-31 › name",
    ]);
  });

  it("refuses an announcement that ended, an audience sector that is missing or inactive, and the screen's limits", () => {
    const key = (item: AnnouncementItem) => `announcements › ${announcementKey(item)}`;
    const ended = announcement({ startsAt: "2026-11-10T12:00:00.000Z", endsAt: "2026-11-10T13:00:00.000Z" });
    const missing = announcement({ title: "Outro setor", audienceSector: "Jardinagem" });
    const tooLong = announcement({ title: "Longa demais", endsAt: "2026-12-02T18:00:00.000Z" });
    const notice = announcement({ title: "Aviso com antecedência", kind: "NOTICE", level: "INFO", audience: "ALL", audienceSector: null, leadHours: 5 });
    const notIso = announcement({ title: "Data local", startsAt: "2026-12-01 09:00" });
    const file = data();
    file.announcements = [ended, missing, tooLong, notice, notIso];
    expect(paths(file)).toEqual([
      `${key(ended)} › endsAt`,
      `${key(missing)} › audienceSector`,
      `${key(tooLong)} › endsAt`,
      `${key(notice)} › leadHours`,
      key(notIso),
    ]);

    const inactive = data();
    inactive.sectors[0]!.isActive = false;
    expect(paths(inactive)).toContain(`${key(announcement())} › audienceSector`);
  });
});

describe("the preview of a version 3 file", () => {
  const snapshot: ConfigurationSnapshot = {
    sectors: [],
    escalationRules: [],
    cannedResponses: [],
    tags: [],
    categories: [],
    services: [],
    fields: [],
    documents: [],
    stages: [],
    articles: [],
    checklistItems: [],
    accessRoles: [],
    calendar: null,
    holidays: [],
    bundles: [],
    sectorCalendars: [],
    sectorHolidays: [],
    announcements: [],
    emails: {},
  };
  const store = (): ConfigurationImportStore => ({
    snapshot: vi.fn(async () => snapshot),
    facts: vi.fn(async () => facts),
    people: vi.fn(async () => []),
  });

  it("classifies the new items with their labels; a version 2 file brings none of them", async () => {
    const result = await previewConfigurationImport(JSON.stringify(fileOf(3, data())), store());
    expect(result).toMatchObject({ accepted: true, summary: { new: 4, changed: 0, equal: 0 } });
    expect(result.items.map(({ kind }) => kind)).toEqual(["sector", "sectorCalendar", "sectorHoliday", "announcement"]);
    const older = await previewConfigurationImport(JSON.stringify(fileOf(2, asVersion2(data()))), store());
    expect(older).toMatchObject({ accepted: true, summary: { new: 1 } });
  });

  it("refuses an invalid announcement with its path", async () => {
    const file = data();
    file.announcements = [announcement({ endsAt: "2026-11-01T12:00:00.000Z" })];
    const result = await previewConfigurationImport(JSON.stringify(fileOf(3, file)), store());
    expect(result.accepted).toBe(false);
    expect(result.problems[0]!.path).toContain("announcements ›");
  });
});
