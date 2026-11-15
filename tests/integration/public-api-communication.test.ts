import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "./fixtures";

vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});
const schedule = vi.hoisted(() => ({ scheduleEventProcessing: vi.fn() }));
vi.mock("@/server/jobs/schedule", () => schedule);

import { generateApiToken } from "@/modules/api-tokens";
import { loadDemoData } from "@/modules/demo";
import { getAnnouncements, getSectorCalendar } from "@/modules/public-api";

// SPEC 2026-11-09-comunicacao-e-calendarios, 7 item 2 (SF-258; CA-COM-02 for the API): the announcements in force for
// the token owner and a sector's effective calendar, through the public API, only to who already reads them.

const emails = { ana: "ana.souza@exemplo.test", diego: "diego.rocha@exemplo.test", paulo: "paulo.ribeiro@exemplo.test", marina: "marina.alves@exemplo.test" };
type Person = keyof typeof emails;
const HOUR = 3_600_000;

async function tokenFor(person: Person, scope: "READ" | "WRITE" = "READ"): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: emails[person] } });
  const token = generateApiToken();
  const now = new Date();
  await prisma.apiToken.create({
    data: { userId: user.id, name: `${person} ${scope}`, scope, tokenHash: token.hash, lastFour: token.lastFour, createdAt: now, expiresAt: new Date(now.getTime() + 86_400_000) },
  });
  return token.value;
}

const get = async (path: string, token: string) => new Request(`https://serviceflow.test${path}`, { headers: { authorization: `Bearer ${token}` } });

async function announcementsAs(person: Person) {
  const response = await getAnnouncements(await get("/api/v1/announcements", await tokenFor(person)));
  return { status: response.status, body: await response.json() };
}

async function calendarAs(person: Person, sectorId: string) {
  const response = await getSectorCalendar(await get(`/api/v1/sectors/${sectorId}/calendar`, await tokenFor(person)), { params: Promise.resolve({ sectorId }) });
  return { status: response.status, body: await response.json() };
}

describe("announcements and sector calendars through the API (SF-258)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadDemoData(prisma);
    await prisma.announcementDismissal.deleteMany();
    await prisma.announcement.deleteMany();
    await prisma.sectorHoliday.deleteMany();
    await prisma.sectorCalendar.deleteMany();
  });

  it("each person reads the announcements in force for their audience, with their dismissals, beyond the strip's three", async () => {
    const marina = await prisma.user.findUniqueOrThrow({ where: { email: emails.marina } });
    const paulo = await prisma.user.findUniqueOrThrow({ where: { email: emails.paulo } });
    const base = { createdById: marina.id, startsAt: new Date(Date.now() - HOUR), endsAt: new Date(Date.now() + HOUR) };
    const notice = (title: string, extra: object = {}) =>
      prisma.announcement.create({ data: { ...base, title, body: "Texto", kind: "NOTICE", level: "INFO", audience: "ALL", ...extra } });
    const info = await notice("Informação geral");
    for (const title of ["Segundo", "Terceiro", "Quarto"]) await notice(title);
    await notice("Só para atendentes", { audience: "ROLE", audienceRole: "ATTENDANT" });
    await notice("Do setor", { audience: "SECTOR", audienceSectorId: paulo.sectorId, level: "WARNING" });
    await notice("Já terminou", { startsAt: new Date(Date.now() - 3 * HOUR), endsAt: new Date(Date.now() - HOUR) });
    // A maintenance not yet in its window but inside its lead is in force.
    await prisma.announcement.create({
      data: { ...base, title: "Manutenção", body: "Texto", kind: "MAINTENANCE", level: "WARNING", audience: "ALL", startsAt: new Date(Date.now() + 2 * HOUR), endsAt: new Date(Date.now() + 3 * HOUR), leadHours: 24 },
    });
    const ana = await prisma.user.findUniqueOrThrow({ where: { email: emails.ana } });
    await prisma.announcementDismissal.create({ data: { announcementId: info.id, userId: ana.id, dismissedAt: new Date() } });

    const forAna = await announcementsAs("ana");
    expect(forAna.status).toBe(200);
    const titles = forAna.body.items.map(({ title }: { title: string }) => title);
    expect(titles.slice(0, 1)).toEqual(["Manutenção"]);
    expect([...titles].sort()).toEqual(["Informação geral", "Manutenção", "Quarto", "Segundo", "Terceiro"]);
    expect(forAna.body.items.find(({ title }: { title: string }) => title === "Informação geral")).toMatchObject({ dismissible: true, dismissed: true });
    expect(forAna.body.items.find(({ title }: { title: string }) => title === "Manutenção")).toMatchObject({ phase: "scheduled", leadHours: 24, dismissible: false });

    const forDiego = (await announcementsAs("diego")).body.items.map(({ title }: { title: string }) => title);
    expect(forDiego).toEqual(expect.arrayContaining(["Só para atendentes", "Do setor"]));
    expect(forDiego).not.toContain("Já terminou");
  });

  it("the manager reads their sector's effective calendar; another sector is 'not found'; other profiles have no route", async () => {
    const paulo = await prisma.user.findUniqueOrThrow({ where: { email: emails.paulo } });
    const marina = await prisma.user.findUniqueOrThrow({ where: { email: emails.marina } });
    const sectorId = paulo.sectorId!;
    await prisma.businessHoliday.deleteMany();
    await prisma.businessHoliday.create({ data: { day: new Date("2026-12-25T00:00:00.000Z"), name: "Natal", yearly: true, createdById: marina.id } });

    const plain = await calendarAs("paulo", sectorId);
    expect(plain.status).toBe(200);
    expect(plain.body).toMatchObject({ sector: { id: sectorId }, ownHours: false, holidays: [{ day: "2026-12-25", name: "Natal", yearly: true, source: "organization" }] });

    await prisma.sectorCalendar.create({ data: { sectorId, weekdays: [6, 1], startMinute: 420, endMinute: 1140, updatedAt: new Date(), updatedById: marina.id } });
    await prisma.sectorHoliday.create({ data: { sectorId, day: new Date("2026-11-20T00:00:00.000Z"), name: "Feriado local", createdById: marina.id } });
    const own = await calendarAs("paulo", sectorId);
    expect(own.body).toMatchObject({
      ownHours: true,
      weekdays: [1, 6],
      startTime: "07:00",
      endTime: "19:00",
      holidays: [
        { day: "2026-11-20", name: "Feriado local", source: "sector" },
        { day: "2026-12-25", name: "Natal", source: "organization" },
      ],
    });

    const other = await prisma.sector.create({ data: { name: "Outro setor da API" } });
    expect((await calendarAs("paulo", other.id)).status).toBe(404);
    expect((await calendarAs("paulo", "não-é-id")).status).toBe(400);
    expect((await calendarAs("diego", sectorId)).status).toBe(403);
    expect((await calendarAs("ana", sectorId)).status).toBe(403);
  });
});
