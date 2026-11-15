import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainSector, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 6.1 item 3 and 6.3 item 3 (decision K4; SF-254; CA-CAL-01 and CA-CAL-03 at
// the opening): a request opened in business hours counts its deadline with the calendar of the sector that receives it
// and keeps which one it was.

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { createSectorHoliday, loadBusinessCalendar, loadSectorBusinessCalendar, saveSectorHours, updateCalendar } from "@/modules/calendar";
import { createRequest, decideApproval } from "@/modules/requests";
import { slaScheduleFrom } from "@/modules/requests/domain/sla";
import { createService } from "@/modules/services";
import { clockTimeBetween, type SlaClock } from "@/shared/business-clock";

type Actor = { id: string; name: string; role: Role; sectorId: string | null; isActive: boolean };
const HOUR = 60 * 60 * 1000;
const actAs = (actor: Actor) => session.getCurrentUser.mockResolvedValue({ ...actor, email: `${actor.id}@example.test` });
const stored = (id: string) => prisma.request.findUniqueOrThrow({ where: { id } });

const organizationClock = async (): Promise<SlaClock> => ({ kind: "business", calendar: await loadBusinessCalendar(prisma) });
const sectorClock = async (sectorId: string): Promise<SlaClock> => ({ kind: "business", calendar: (await loadSectorBusinessCalendar(prisma, sectorId)).calendar });

/** The organization: one business hour a day, 10:00 to 11:00 UTC, every day. */
const narrow = { weekdays: ["1", "2", "3", "4", "5", "6", "7"], startTime: "10:00", endTime: "11:00", timeZone: "UTC" };

async function scenario() {
  const sector = await createDomainSector();
  const category = await createDomainCategory();
  const admin = await createDomainUser({ role: "ADMIN" });
  const rita = await createDomainUser({ role: "REQUESTER" });
  const gabi = await createDomainUser({ role: "MANAGER", sectorId: sector.id });
  actAs(admin);
  await updateCalendar(narrow, prisma);
  const base = { description: "Reparo", categoryId: category.id, sectorId: sector.id, slaHours: "1" };
  const business = await createService({ name: `Úteis ${sector.id}`, ...base, slaBusinessHours: true }, prisma);
  const calendar = await createService({ name: `Corridas ${sector.id}`, ...base }, prisma);
  const approval = await createService({ name: `Aprovação ${sector.id}`, ...base, slaBusinessHours: true, requiresApproval: true }, prisma);
  return { sector, admin, rita, gabi, business, calendar, approval };
}

describe("the opening's deadline with the sector's calendar (SF-254)", () => {
  it("a sector without its own calendar opens exactly as before, keeping the organization's (CA-CAL-01)", async () => {
    const { rita, business } = await scenario();
    actAs(rita);
    const request = await stored((await createRequest({ serviceId: business.id, description: "Tomada" }, prisma)).id);
    expect(request.slaCalendarSectorId).toBeNull();
    expect(request).toMatchObject(slaScheduleFrom(request.createdAt, 1, "NORMAL", await organizationClock())!);
  });

  it("a sector with its own hours counts the deadline with them and keeps the sector (CA-CAL-03)", async () => {
    const { sector, admin, rita, business, calendar } = await scenario();
    actAs(admin);
    // From 06:00 to 08:00 UTC, every day: never inside the organization's window.
    await saveSectorHours(sector.id, { weekdays: ["1", "2", "3", "4", "5", "6", "7"], startTime: "06:00", endTime: "08:00" }, prisma);

    actAs(rita);
    const request = await stored((await createRequest({ serviceId: business.id, description: "Tomada" }, prisma)).id);
    expect(request.slaCalendarSectorId).toBe(sector.id);
    expect(request).toMatchObject(slaScheduleFrom(request.createdAt, 1, "NORMAL", await sectorClock(sector.id))!);
    const dueTime = request.dueAt!.toISOString().slice(11);
    expect(dueTime > "06:00:00.000Z" && dueTime <= "08:00:00.000Z").toBe(true);
    expect(clockTimeBetween(request.createdAt, request.dueAt!, await sectorClock(sector.id))).toBe(HOUR);

    // A service counted in calendar hours keeps no calendar, as before.
    const running = await stored((await createRequest({ serviceId: calendar.id, description: "Tomada" }, prisma)).id);
    expect(running).toMatchObject({ slaBusinessHours: false, slaCalendarSectorId: null });
    expect(running.dueAt!.getTime() - running.createdAt.getTime()).toBe(HOUR);
  });

  it("a sector with only holidays keeps the organization's hours plus its days off", async () => {
    const { sector, admin, rita, business } = await scenario();
    actAs(admin);
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 24 * HOUR).toISOString().slice(0, 10);
    await createSectorHoliday(sector.id, { day: today, name: "Feriado de hoje", yearly: false }, prisma);
    await createSectorHoliday(sector.id, { day: tomorrow, name: "Feriado de amanhã", yearly: false }, prisma);

    actAs(rita);
    const request = await stored((await createRequest({ serviceId: business.id, description: "Tomada" }, prisma)).id);
    expect(request.slaCalendarSectorId).toBe(sector.id);
    // Today and tomorrow are off in the sector: the hour falls on the day after tomorrow, 10:00 to 11:00 UTC.
    const dayAfter = new Date(Date.now() + 48 * HOUR).toISOString().slice(0, 10);
    expect(request.dueAt!.toISOString()).toBe(`${dayAfter}T11:00:00.000Z`);
  });

  it("with approval, the sector is kept at the opening and the deadline after the approval uses its calendar", async () => {
    const { sector, admin, rita, gabi, approval } = await scenario();
    actAs(admin);
    await saveSectorHours(sector.id, { weekdays: ["1", "2", "3", "4", "5", "6", "7"], startTime: "06:00", endTime: "08:00" }, prisma);
    actAs(rita);
    const { id } = await createRequest({ serviceId: approval.id, description: "Notebook" }, prisma);
    expect(await stored(id)).toMatchObject({ slaCalendarSectorId: sector.id, dueAt: null });

    // Changing the sector's calendar later does not change which calendar the request keeps (decision K4).
    actAs(gabi);
    await decideApproval({ requestId: id, decision: "APPROVED" }, prisma);
    const approved = await stored(id);
    const decision = await prisma.requestApproval.findFirstOrThrow({ where: { requestId: id } });
    expect(approved).toMatchObject(slaScheduleFrom(decision.decidedAt, 1, "NORMAL", await sectorClock(sector.id))!);
    expect(approved.slaCalendarSectorId).toBe(sector.id);
  });

  it("requests opened before the sector's calendar keep the organization's and their due date (decision K4)", async () => {
    const { sector, admin, rita, business } = await scenario();
    actAs(rita);
    const before = await stored((await createRequest({ serviceId: business.id, description: "Antes" }, prisma)).id);
    actAs(admin);
    await saveSectorHours(sector.id, { weekdays: ["1", "2", "3", "4", "5", "6", "7"], startTime: "06:00", endTime: "08:00" }, prisma);
    expect(await stored(before.id)).toMatchObject({ slaCalendarSectorId: null, dueAt: before.dueAt, dueSoonAt: before.dueSoonAt });
  });
});
