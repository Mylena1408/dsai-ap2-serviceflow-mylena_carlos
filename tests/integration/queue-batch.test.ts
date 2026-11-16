import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainRequest, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-07-operacao-e-automacao, 7.3 item 2 (SF-192; CA-LOT-03 and 04).

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { runQueueBatch } from "@/modules/requests";

type Actor = { id: string; name: string; role: Role; sectorId: string | null; isActive: boolean };
const actAs = (actor: Actor) => session.getCurrentUser.mockResolvedValue({ ...actor, email: `${actor.id}@example.test` });

async function scenario(count = 3) {
  const sector = await createDomainSector();
  const other = await createDomainSector();
  const category = await createDomainCategory();
  const service = await createDomainService({ categoryId: category.id, sectorId: sector.id });
  const otherService = await createDomainService({ categoryId: category.id, sectorId: other.id });
  const ana = await createDomainUser({ role: "ATTENDANT", sectorId: sector.id });
  const bia = await createDomainUser({ role: "ATTENDANT", sectorId: sector.id });
  await createDomainUser({ role: "ATTENDANT", sectorId: other.id });
  const rita = await createDomainUser({ role: "REQUESTER" });
  const requests = [];
  for (let index = 0; index < count; index += 1) {
    requests.push(await createDomainRequest({ requesterId: rita.id, serviceId: service.id, sectorId: sector.id, status: "OPEN" }));
  }
  const foreign = await createDomainRequest({ requesterId: rita.id, serviceId: otherService.id, sectorId: other.id, status: "OPEN" });
  return { sector, other, ana, bia, rita, requests, foreign };
}

describe("batch actions in the queue (7.3 item 2; CA-LOT-03 and 04)", () => {
  it("assume: each item as the individual action, with its history, event and warning; refused items stay as they were", async () => {
    const { ana, bia, requests, foreign } = await scenario();
    await prisma.request.update({ where: { id: requests[1].id }, data: { assigneeId: bia.id } });

    actAs(ana);
    const result = await runQueueBatch({ action: "assume", requestIds: [...requests.map(({ id }) => id), foreign.id] });
    expect(result.items).toEqual([
      { requestId: requests[0].id, outcome: "done" },
      { requestId: requests[1].id, outcome: "refused", reason: "taken" },
      { requestId: requests[2].id, outcome: "done" },
      { requestId: foreign.id, outcome: "refused", reason: "no_access" },
    ]);

    const rows = await prisma.request.findMany({ where: { id: { in: requests.map(({ id }) => id) } }, select: { id: true, assigneeId: true } });
    expect(new Map(rows.map((row) => [row.id, row.assigneeId]))).toEqual(
      new Map([
        [requests[0].id, ana.id],
        [requests[1].id, bia.id],
        [requests[2].id, ana.id],
      ]),
    );
    for (const request of [requests[0], requests[2]]) {
      expect(await prisma.requestAssignmentEvent.findMany({ where: { requestId: request.id }, select: { actorId: true, fromAssigneeId: true, toAssigneeId: true, reason: true } })).toEqual([
        { actorId: ana.id, fromAssigneeId: null, toAssigneeId: ana.id, reason: null },
      ]);
      expect(await prisma.outboxEvent.count({ where: { requestId: request.id, type: "request.assignment_changed" } })).toBe(1);
    }
    expect(await prisma.requestAssignmentEvent.count({ where: { requestId: { in: [requests[1].id, foreign.id] } } })).toBe(0);
  });

  it("transfer, priority and sending: the same data for all, the individual rules per item", async () => {
    const { ana, bia, other, requests } = await scenario();
    actAs(ana);
    await runQueueBatch({ action: "assume", requestIds: requests.map(({ id }) => id) });

    // The colleague must be an active attendant of the sector: refused for every item.
    const stranger = await createDomainUser({ role: "ATTENDANT", sectorId: other.id });
    await expect(runQueueBatch({ action: "transfer", requestIds: [requests[0].id], assigneeId: stranger.id })).resolves.toMatchObject({
      items: [{ outcome: "refused", reason: "invalid_colleague" }],
    });
    await expect(runQueueBatch({ action: "transfer", requestIds: [requests[0].id], assigneeId: bia.id })).resolves.toMatchObject({ done: 1 });
    expect(await prisma.request.findUniqueOrThrow({ where: { id: requests[0].id } })).toMatchObject({ assigneeId: bia.id });

    await prisma.request.update({ where: { id: requests[2].id }, data: { priority: "HIGH" } });
    const priority = await runQueueBatch({ action: "priority", requestIds: [requests[1].id, requests[2].id, requests[0].id], priority: "HIGH" });
    // The last one is Bia's now: Ana is not its assignee.
    expect(priority.items.map((item) => (item.outcome === "done" ? "done" : item.reason))).toEqual(["done", "same_priority", "not_allowed"]);
    expect(await prisma.requestPriorityEvent.findMany({ where: { requestId: requests[1].id }, select: { fromPriority: true, toPriority: true, actorId: true } })).toEqual([
      { fromPriority: "NORMAL", toPriority: "HIGH", actorId: ana.id },
    ]);

    const sending = await runQueueBatch({ action: "sector", requestIds: [requests[1].id, requests[2].id], sectorId: other.id, note: "Pertence ao outro setor" });
    expect(sending).toMatchObject({ done: 2, refused: 0 });
    const moved = await prisma.requestSectorEvent.findMany({ where: { requestId: { in: [requests[1].id, requests[2].id] } }, select: { note: true, toSectorId: true, actorId: true } });
    expect(moved).toEqual([
      { note: "Pertence ao outro setor", toSectorId: other.id, actorId: ana.id },
      { note: "Pertence ao outro setor", toSectorId: other.id, actorId: ana.id },
    ]);
    expect(await prisma.outboxEvent.count({ where: { requestId: { in: [requests[1].id, requests[2].id] }, type: "request.sector_changed" } })).toBe(2);
  });

  it("two batches at once on the same requests: no request is assumed twice", async () => {
    const { ana, requests } = await scenario(6);
    actAs(ana);
    const ids = requests.map(({ id }) => id);
    const results = await Promise.all([runQueueBatch({ action: "assume", requestIds: ids }), runQueueBatch({ action: "assume", requestIds: [...ids].reverse() })]);

    // Each item runs in its own Serializable transaction (decision H18). Two batches racing on the same requests can
    // also abort an item in both (a serialization failure is refused as "taken", "mudou enquanto você agia", and the
    // person tries again); what never happens is a request assumed twice. The CI met this case on 2026-11-16.
    const items = [...results[0].items, ...results[1].items];
    const doneById = new Map<string, number>();
    for (const item of items) if (item.outcome === "done") doneById.set(item.requestId, (doneById.get(item.requestId) ?? 0) + 1);
    expect([...doneById.values()].every((times) => times === 1)).toBe(true);
    const done = results[0].done + results[1].done;
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThanOrEqual(ids.length);
    expect(items.filter((item) => item.outcome === "refused").every((item) => item.outcome === "refused" && item.reason === "taken")).toBe(true);
    const events = await prisma.requestAssignmentEvent.groupBy({ by: ["requestId"], where: { requestId: { in: ids } }, _count: { _all: true } });
    expect(events.every(({ _count }) => _count._all === 1)).toBe(true);
    expect(events).toHaveLength(done);
  });
});
