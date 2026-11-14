import { describe, expect, it, vi } from "vitest";
import type { Prisma, Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainSector, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 4 (SF-239): the page "Avisos" of the signed-in person, read
// from the database.

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { dismissAnnouncement, getAnnouncementHistory } from "@/modules/announcements";

type Person = { id: string; name: string; role: Role; sectorId: string | null };
const as = (person: Person) => session.getCurrentUser.mockResolvedValue({ ...person, isActive: true, email: `${person.id}@example.test` });
const HOUR = 3_600_000;
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR);

async function scenario() {
  const sector = await createDomainSector();
  const admin = await createDomainUser({ role: "ADMIN" });
  const ana = await createDomainUser({ role: "ATTENDANT", sectorId: sector.id });
  const rita = await createDomainUser({ role: "REQUESTER" });
  const create = (title: string, data: Partial<Prisma.AnnouncementUncheckedCreateInput> = {}) =>
    prisma.announcement.create({
      data: { title, body: "Texto.", level: "INFO", kind: "NOTICE", audience: "ALL", startsAt: hoursFromNow(-2), endsAt: hoursFromNow(24), createdById: admin.id, ...data },
    });
  return { sector, admin, ana, rita, create };
}

const titles = async () => (await getAnnouncementHistory()).map(({ title, state }) => `${title}:${state}`);

describe("the page \"Avisos\" (SF-239)", () => {
  it("lists the person's announcements in force and ended in the last 90 days, keeping the dismissed ones", async () => {
    const { sector, ana, rita, create } = await scenario();
    const dismissed = await create("Dispensado", { startsAt: hoursFromNow(-1) });
    await create("Do setor", { audience: "SECTOR", audienceSectorId: sector.id, startsAt: hoursFromNow(-3) });
    await create("Encerrado ontem", { startsAt: hoursFromNow(-48), endsAt: hoursFromNow(-24) });
    await create("Encerrado há 100 dias", { startsAt: hoursFromNow(-2500), endsAt: hoursFromNow(-2400) });
    await create("Futuro", { startsAt: hoursFromNow(5) });

    as(rita);
    await dismissAnnouncement(dismissed.id);
    expect(await titles()).toEqual(["Dispensado:current", "Encerrado ontem:ended"]);

    as(ana);
    expect(await titles()).toEqual(["Dispensado:current", "Do setor:current", "Encerrado ontem:ended"]);
  });

  it("shows a maintenance from its lead, with its phase", async () => {
    const { rita, create } = await scenario();
    await create("Anunciada", { kind: "MAINTENANCE", level: "WARNING", startsAt: hoursFromNow(5), endsAt: hoursFromNow(7), leadHours: 24 });
    as(rita);
    expect(await titles()).toEqual(["Anunciada:maintenance_scheduled"]);
  });

  it("is empty without announcements", async () => {
    const { rita } = await scenario();
    as(rita);
    expect(await getAnnouncementHistory()).toEqual([]);
  });
});
