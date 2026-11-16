import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainSector, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 7 item 1 (SF-257; CA-COM-01): the portable configuration's version 3
// exports and imports the sectors' own hours and holidays and the announcements not started yet, round trip, with
// the import's rules (by key, nothing deleted, each item audited); versions 1 and 2 are still accepted.

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { applyConfigurationImport, exportConfiguration, previewConfigurationImport, type ConfigurationFile } from "@/modules/configuration";

type Actor = { id: string; name: string; role: Role; sectorId: string | null; isActive: boolean };
const actAs = (actor: Actor) => session.getCurrentUser.mockResolvedValue({ ...actor, email: `${actor.id}@example.test` });
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const HOUR = 3_600_000;

async function scenario() {
  const sector = await createDomainSector();
  const plain = await createDomainSector();
  const admin = await createDomainUser({ role: "ADMIN" });
  await prisma.sectorCalendar.create({ data: { sectorId: sector.id, weekdays: [1, 2, 3, 4, 5, 6], startMinute: 420, endMinute: 1140, updatedAt: new Date(), updatedById: admin.id } });
  await prisma.sectorHoliday.create({ data: { sectorId: sector.id, day: day("2026-12-24"), name: "Véspera", yearly: true, createdById: admin.id } });
  const starts = new Date(Date.now() + 10 * 24 * HOUR);
  const future = await prisma.announcement.create({
    data: {
      title: "Troca dos aparelhos",
      body: "O ar-condicionado será trocado.",
      kind: "MAINTENANCE",
      level: "WARNING",
      audience: "SECTOR",
      audienceSectorId: sector.id,
      startsAt: starts,
      endsAt: new Date(starts.getTime() + 4 * HOUR),
      leadHours: 24,
      createdById: admin.id,
    },
  });
  // Already going on: not "future", so not in the file.
  await prisma.announcement.create({
    data: {
      title: "Em andamento",
      body: "Já começou.",
      kind: "NOTICE",
      level: "INFO",
      audience: "ALL",
      startsAt: new Date(Date.now() - HOUR),
      endsAt: new Date(Date.now() + 24 * HOUR),
      createdById: admin.id,
    },
  });
  actAs(admin);
  const content = (await exportConfiguration(prisma)).content;
  return { sector, plain, admin, future, content, file: JSON.parse(content) as ConfigurationFile };
}

async function previewAndApply(content: string) {
  const preview = await previewConfigurationImport(content, prisma);
  expect(preview.problems).toEqual([]);
  return applyConfigurationImport({ content, digest: preview.digest, destinationDigest: preview.destinationDigest }, prisma);
}

describe("the portable configuration's version 3 (CA-COM-01)", () => {
  it("exports each sector's own hours and holidays and only the announcements not started yet, without ids", async () => {
    const { content, file, sector, plain, future } = await scenario();
    // Version 4 since SF-277; the calendars, holidays and announcements are the same.
    // Version 5 since SPEC 2026-11-16-professores-e-tecnicos (P4).
    expect(file.version).toBe(5);
    expect(content).not.toContain(sector.id);
    expect(content).not.toContain(future.id);
    expect(file.data.sectors.find(({ name }) => name === sector.name)).toMatchObject({
      calendar: { weekdays: [1, 2, 3, 4, 5, 6], startTime: "07:00", endTime: "19:00" },
      holidays: [{ day: "2026-12-24", name: "Véspera", yearly: true }],
    });
    expect(file.data.sectors.find(({ name }) => name === plain.name)).toMatchObject({ calendar: null, holidays: [] });
    expect(file.data.announcements).toEqual([
      {
        title: "Troca dos aparelhos",
        body: "O ar-condicionado será trocado.",
        kind: "MAINTENANCE",
        level: "WARNING",
        audience: "SECTOR",
        audienceRole: null,
        audienceSector: sector.name,
        startsAt: future.startsAt.toISOString(),
        endsAt: future.endsAt.toISOString(),
        leadHours: 24,
      },
    ]);
  });

  it("importing back the exported file gives equal everywhere and writes nothing but the import's entry", async () => {
    const { content } = await scenario();
    const preview = await previewConfigurationImport(content, prisma);
    expect(preview).toMatchObject({ accepted: true, summary: { new: 0, changed: 0 } });
    expect(preview.items.filter(({ kind }) => ["sectorCalendar", "sectorHoliday", "announcement"].includes(kind))).toHaveLength(3);
    const audits = await prisma.auditEntry.count();
    await expect(previewAndApply(content)).resolves.toMatchObject({ new: 0, changed: 0 });
    expect(await prisma.auditEntry.count()).toBe(audits + 1);
  });

  it("creates and updates by key in another sector and announcement, each audited, deleting nothing", async () => {
    const { file, sector, plain, admin, future } = await scenario();
    const own = file.data.sectors.find(({ name }) => name === sector.name)!;
    const other = file.data.sectors.find(({ name }) => name === plain.name)!;
    own.calendar = { weekdays: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "12:00" };
    own.holidays = [{ day: "2026-12-31", name: "Réveillon", yearly: true }];
    other.calendar = { weekdays: [6, 7], startTime: "09:00", endTime: "13:00" };
    const moved = { ...file.data.announcements![0]!, body: "Novo texto." };
    const fresh = {
      ...moved,
      title: "Novo catálogo",
      kind: "NOTICE" as const,
      level: "INFO" as const,
      audience: "ALL" as const,
      audienceSector: null,
      leadHours: null,
    };
    file.data.announcements = [moved, fresh];

    await expect(previewAndApply(JSON.stringify(file))).resolves.toMatchObject({ new: 3, changed: 2 });

    expect(await prisma.sectorCalendar.findUniqueOrThrow({ where: { sectorId: sector.id } })).toMatchObject({ weekdays: [1, 2, 3, 4, 5], startMinute: 480, endMinute: 720 });
    expect(await prisma.sectorCalendar.findUniqueOrThrow({ where: { sectorId: plain.id } })).toMatchObject({ weekdays: [6, 7], updatedById: admin.id });
    // "Véspera" is not in the file: it stays.
    expect((await prisma.sectorHoliday.findMany({ where: { sectorId: sector.id }, orderBy: { day: "asc" } })).map(({ name }) => name)).toEqual(["Véspera", "Réveillon"]);
    expect(await prisma.announcement.findUniqueOrThrow({ where: { id: future.id } })).toMatchObject({ body: "Novo texto." });
    expect(await prisma.announcement.findFirstOrThrow({ where: { title: "Novo catálogo" } })).toMatchObject({ audience: "ALL", createdById: admin.id });
    expect(await prisma.announcement.count({ where: { title: "Em andamento" } })).toBe(1);

    const entries = await prisma.auditEntry.groupBy({
      by: ["entityType", "action"],
      where: { entityType: { in: ["SECTOR_CALENDAR", "SECTOR_HOLIDAY", "ANNOUNCEMENT"] } },
      _count: true,
      orderBy: [{ entityType: "asc" }, { action: "asc" }],
    });
    expect(entries.map(({ entityType, action, _count }) => `${entityType} ${action} ${_count}`)).toEqual([
      "ANNOUNCEMENT CREATED 1",
      "ANNOUNCEMENT UPDATED 1",
      "SECTOR_CALENDAR CREATED 1",
      "SECTOR_CALENDAR UPDATED 1",
      "SECTOR_HOLIDAY CREATED 1",
    ]);
  });

  it("a version 2 file leaves the destination's calendars, holidays and announcements as they are", async () => {
    const { file, sector } = await scenario();
    const older = { ...file, version: 2, data: { ...file.data } } as ConfigurationFile;
    delete older.data.announcements;
    older.data.sectors = older.data.sectors.map((item) => {
      const copy = { ...item };
      delete copy.calendar;
      delete copy.holidays;
      return copy;
    });
    await expect(previewAndApply(JSON.stringify(older))).resolves.toMatchObject({ new: 0, changed: 0 });
    expect(await prisma.sectorCalendar.count({ where: { sectorId: sector.id } })).toBe(1);
    expect(await prisma.sectorHoliday.count({ where: { sectorId: sector.id } })).toBe(1);
    expect(await prisma.announcement.count()).toBe(2);
  });

  it("refuses an announcement for a sector that does not exist, writing nothing", async () => {
    const { file } = await scenario();
    file.data.announcements = [{ ...file.data.announcements![0]!, title: "Para ninguém", audienceSector: "Setor inexistente" }];
    const preview = await previewConfigurationImport(JSON.stringify(file), prisma);
    expect(preview.accepted).toBe(false);
    expect(preview.problems.map(({ path }) => path)).toEqual([expect.stringMatching(/^announcements › .* Para ninguém › audienceSector$/)]);
  });
});
