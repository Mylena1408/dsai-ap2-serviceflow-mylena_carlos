import { describe, expect, it, vi } from "vitest";
import type { ApprovalState, Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainRequest, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { registerAbsence } from "@/modules/absences";
import { grantPermission } from "@/modules/permissions";
import { MANAGER_APPROVALS_PAGE_SIZE, listManagerApprovals, pageManagerApprovals } from "@/modules/requests";
import { organizationToday } from "@/modules/requests/infrastructure/approval-coverage";
import { addDays } from "@/shared/time";

// SPEC 2026-11-16-paginacao-aprovacoes (SF-284; CA-PAP-01; the API's CA-PAP-02 is in approvals-pagination-api.test.ts): the pages of "Aprovações", read from the
// database, are exactly the old list, in the same order, for the three filters and with an absence's coverage.

type Actor = { id: string; name: string; role: Role; sectorId: string | null; isActive: boolean };

function actAs(actor: Actor) {
  session.getCurrentUser.mockResolvedValue({ ...actor, email: `${actor.id}@example.test` });
}

const MINUTE = 60_000;

/** Requests of a sector with the given approval states, each opened a minute apart (two at the same instant). */
async function openRequests(sectorId: string, requesterId: string, states: Array<ApprovalState | null>, start: Date) {
  const service = await createDomainService({ categoryId: (await createDomainCategory()).id, sectorId });
  const ids: string[] = [];
  for (const [index, state] of states.entries()) {
    const request = await createDomainRequest({ requesterId, serviceId: service.id, sectorId });
    // Index 1 and 2 share the instant, so the identifier breaks the tie (Q1).
    const createdAt = new Date(start.getTime() + (index === 2 ? 1 : index) * MINUTE);
    // A rejection cancels the request (the database's check).
    const status = state === "REJECTED" ? ("CANCELLED" as const) : undefined;
    await prisma.request.update({ where: { id: request.id }, data: { approvalState: state, createdAt, status, cancelledAt: status ? createdAt : undefined } });
    ids.push(request.id);
  }
  return ids;
}

/** A shuffled mix: pending and decided interleaved in time, plus requests without approval. */
function mix(pending: number, decided: number, plain: number): Array<ApprovalState | null> {
  const states: Array<ApprovalState | null> = [
    ...Array.from({ length: pending }, () => "PENDING" as const),
    ...Array.from({ length: decided }, (_, index) => (index % 2 === 0 ? ("APPROVED" as const) : ("REJECTED" as const))),
    ...Array.from({ length: plain }, () => null),
  ];
  // A fixed interleaving (no randomness): every third pending moves after the decided ones.
  return states.map((_, index) => states[(index * 7) % states.length]!);
}

async function scenario() {
  const purchasing = await createDomainSector();
  const finance = await createDomainSector();
  const rita = await createDomainUser({ role: "REQUESTER" });
  const gabi = await createDomainUser({ role: "MANAGER", sectorId: purchasing.id });
  const fred = await createDomainUser({ role: "MANAGER", sectorId: finance.id });
  const start = new Date(Date.now() - 10 * 24 * 60 * MINUTE);
  await openRequests(purchasing.id, rita.id, mix(27, 14, 4), start);
  await openRequests(finance.id, rita.id, mix(9, 3, 1), new Date(start.getTime() + 30 * MINUTE));
  return { purchasing, finance, gabi, fred };
}

/** Every page, one after the other, and what each page said. */
async function allPages(filter: string) {
  const first = await pageManagerApprovals(filter, 1, prisma);
  const pages = [first];
  for (let page = 2; page <= first.pageCount; page += 1) pages.push(await pageManagerApprovals(filter, page, prisma));
  return { first, pages, ids: pages.flatMap(({ items }) => items.map(({ id }) => id)) };
}

async function expectSameAsList(filter: string) {
  const list = (await listManagerApprovals(filter, prisma)).map(({ id }) => id);
  const { first, pages, ids } = await allPages(filter);
  expect(ids, filter).toEqual(list);
  expect(new Set(ids).size, filter).toBe(ids.length);
  expect(first.total, filter).toBe(list.length);
  expect(first.pageCount, filter).toBe(Math.max(1, Math.ceil(list.length / MANAGER_APPROVALS_PAGE_SIZE)));
  for (const [index, page] of pages.entries()) {
    expect(page.page).toBe(index + 1);
    expect(page.items.length).toBeLessThanOrEqual(MANAGER_APPROVALS_PAGE_SIZE);
  }
  return list;
}

describe("the pages of \"Aprovações\" (SF-284)", () => {
  it("are the old list, page by page, for pending, all and the whole sector (CA-PAP-01)", async () => {
    const { gabi } = await scenario();
    actAs(await createDomainUser({ role: "ADMIN" }));
    await grantPermission({ userId: gabi.id, permission: "SECTOR_REQUESTS_READ" }, prisma);
    actAs(gabi);

    expect(await expectSameAsList("pending")).toHaveLength(27);
    const all = await expectSameAsList("all");
    expect(all).toHaveLength(41);
    expect(await expectSameAsList("sector")).toHaveLength(45);

    // Pending first: the first 27 of "all" are the pending ones, and the second page joins the two groups.
    const states = await prisma.request.findMany({ where: { id: { in: all } }, select: { id: true, approvalState: true } });
    const stateOf = new Map(states.map(({ id, approvalState }) => [id, approvalState]));
    expect(all.slice(0, 27).every((id) => stateOf.get(id) === "PENDING")).toBe(true);
    expect(all.slice(27).every((id) => stateOf.get(id) !== "PENDING")).toBe(true);
    const second = await pageManagerApprovals("all", 2, prisma);
    expect(second.items.map(({ approvalState }) => approvalState).slice(6, 8)).toEqual(["PENDING", expect.not.stringMatching("PENDING")]);
  });

  it("a page past the last is the last one, and an invalid number is the first (Q2)", async () => {
    const { gabi } = await scenario();
    actAs(gabi);
    const last = await pageManagerApprovals("all", 99, prisma);
    expect(last).toMatchObject({ page: 3, pageCount: 3, total: 41 });
    expect(last.items).toHaveLength(1);
    expect((await pageManagerApprovals("all", Number.NaN, prisma)).page).toBe(1);
    expect((await pageManagerApprovals("all", 0, prisma)).page).toBe(1);
  });

  it("keeps who sees what: the substitute's pages add the absent manager's sector (rule 1)", async () => {
    const { gabi, fred } = await scenario();
    actAs(fred);
    const before = await expectSameAsList("pending");
    expect(before).toHaveLength(9);

    actAs(gabi);
    const today = (await organizationToday(prisma)).toISOString().slice(0, 10);
    await registerAbsence({ substituteId: fred.id, startsOn: today, endsOn: addDays(today, 2) }, prisma);

    actAs(fred);
    expect(await expectSameAsList("pending")).toHaveLength(9 + 27);
    expect(await expectSameAsList("all")).toHaveLength(12 + 41);
  });
});
