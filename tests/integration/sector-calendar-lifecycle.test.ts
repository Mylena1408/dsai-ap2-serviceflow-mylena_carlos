import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainSector, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 6.3 item 3 (decisions K4 and K8; SF-255; CA-CAL-03): pauses, resumes,
// priority changes and reopening use the calendar kept at the opening; sending the request to another sector keeps it.

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { loadBusinessCalendar, loadSectorBusinessCalendar, saveSectorHours, updateCalendar } from "@/modules/calendar";
import {
  assumeRequest,
  changeRequestPriority,
  createRequest,
  pauseRequestSla,
  reopenRequest,
  resumeRequestSla,
  sendRequestToSector,
  transitionRequestStatus,
} from "@/modules/requests";
import { slaScheduleAfterPriorityChange, slaScheduleAfterResume, slaScheduleFrom } from "@/modules/requests/domain/sla";
import { createService } from "@/modules/services";
import type { SlaClock } from "@/shared/business-clock";

type Actor = { id: string; name: string; role: Role; sectorId: string | null; isActive: boolean };
const actAs = (actor: Actor) => session.getCurrentUser.mockResolvedValue({ ...actor, email: `${actor.id}@example.test` });
const stored = (id: string) => prisma.request.findUniqueOrThrow({ where: { id } });
const sectorClock = async (sectorId: string): Promise<SlaClock> => ({ kind: "business", calendar: (await loadSectorBusinessCalendar(prisma, sectorId)).calendar });
const organizationClock = async (): Promise<SlaClock> => ({ kind: "business", calendar: await loadBusinessCalendar(prisma) });
const everyDay = ["1", "2", "3", "4", "5", "6", "7"];

/**
 * The organization works 10:00 to 11:00 UTC; the first sector, 06:00 to 08:00; the second, 14:00 to 16:00. Every
 * deadline then shows which calendar counted it.
 */
async function scenario(start = true) {
  const sector = await createDomainSector();
  const other = await createDomainSector();
  const category = await createDomainCategory();
  const admin = await createDomainUser({ role: "ADMIN" });
  const rita = await createDomainUser({ role: "REQUESTER" });
  const ana = await createDomainUser({ role: "ATTENDANT", sectorId: sector.id });
  const caio = await createDomainUser({ role: "ATTENDANT", sectorId: other.id });
  actAs(admin);
  await updateCalendar({ weekdays: everyDay, startTime: "10:00", endTime: "11:00", timeZone: "UTC" }, prisma);
  await saveSectorHours(sector.id, { weekdays: everyDay, startTime: "06:00", endTime: "08:00" }, prisma);
  await saveSectorHours(other.id, { weekdays: everyDay, startTime: "14:00", endTime: "16:00" }, prisma);
  const service = await createService(
    { name: `Úteis ${sector.id}`, description: "Reparo", categoryId: category.id, sectorId: sector.id, slaHours: "3", slaBusinessHours: true },
    prisma,
  );
  actAs(rita);
  const { id } = await createRequest({ serviceId: service.id, description: "Tomada" }, prisma);
  actAs(ana);
  await assumeRequest({ requestId: id }, prisma);
  if (start) await transitionRequestStatus({ requestId: id, toStatus: "IN_PROGRESS" }, prisma);
  return { sector, other, admin, rita, ana, caio, id };
}

describe("the kept calendar in the request's life (SF-255)", () => {
  it("a pause and its resume count the time left with the sector's calendar", async () => {
    const { sector, ana, id } = await scenario();
    expect((await stored(id)).slaCalendarSectorId).toBe(sector.id);
    actAs(ana);
    await pauseRequestSla({ requestId: id, reason: "Qual é o patrimônio?" }, prisma);
    const paused = await stored(id);
    await resumeRequestSla({ requestId: id }, prisma);
    const resumed = await stored(id);
    const pause = await prisma.requestSlaPause.findFirstOrThrow({ where: { requestId: id } });
    expect(resumed).toMatchObject(slaScheduleAfterResume(paused.dueAt!, paused.slaPausedAt!, pause.resumedAt!, 3, "NORMAL", await sectorClock(sector.id))!);
    // Not what the organization's calendar would give.
    expect(resumed.dueAt).not.toEqual(slaScheduleAfterResume(paused.dueAt!, paused.slaPausedAt!, pause.resumedAt!, 3, "NORMAL", await organizationClock())!.dueAt);
  });

  it("a priority change moves the deadline with the sector's calendar", async () => {
    const { sector, ana, id } = await scenario();
    const before = await stored(id);
    actAs(ana);
    await changeRequestPriority({ requestId: id, priority: "URGENT" }, prisma);
    expect(await stored(id)).toMatchObject(slaScheduleAfterPriorityChange(before.dueAt!, 3, "NORMAL", "URGENT", await sectorClock(sector.id))!);
  });

  it("sending the request to another sector keeps the calendar and the deadline (decision K8)", async () => {
    const { sector, other, ana, caio, id } = await scenario(false);
    const before = await stored(id);
    actAs(ana);
    await sendRequestToSector({ requestId: id, sectorId: other.id, note: "É do outro setor." }, prisma);
    const moved = await stored(id);
    expect(moved).toMatchObject({ sectorId: other.id, slaCalendarSectorId: sector.id, dueAt: before.dueAt });

    // Later changes still count with the calendar of the opening, not the new sector's.
    actAs(caio);
    await assumeRequest({ requestId: id }, prisma);
    await changeRequestPriority({ requestId: id, priority: "LOW" }, prisma);
    expect(await stored(id)).toMatchObject(slaScheduleAfterPriorityChange(moved.dueAt!, 3, "NORMAL", "LOW", await sectorClock(sector.id))!);
  });

  it("a reopening counts the new deadline with the sector's calendar", async () => {
    const { sector, rita, ana, id } = await scenario();
    actAs(ana);
    await transitionRequestStatus({ requestId: id, toStatus: "COMPLETED" }, prisma);
    actAs(rita);
    await reopenRequest({ requestId: id, note: "Voltou a falhar" }, prisma);
    const reopened = await stored(id);
    const event = await prisma.requestStatusEvent.findFirstOrThrow({ where: { requestId: id, toStatus: "OPEN", fromStatus: "COMPLETED" } });
    expect(reopened).toMatchObject(slaScheduleFrom(event.occurredAt, 3, "NORMAL", await sectorClock(sector.id))!);
  });
});
