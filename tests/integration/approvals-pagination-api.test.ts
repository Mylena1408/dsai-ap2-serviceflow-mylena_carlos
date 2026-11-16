import { describe, expect, it, vi } from "vitest";
import type { ApprovalState } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainRequest, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";

vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});
const schedule = vi.hoisted(() => ({ scheduleEventProcessing: vi.fn() }));
vi.mock("@/server/jobs/schedule", () => schedule);

import { generateApiToken } from "@/modules/api-tokens";
import { getRequests } from "@/modules/public-api";

// SPEC 2026-11-16-paginacao-aprovacoes, 2 item 3 (SF-284; CA-PAP-02): the manager's API reads the same pages from the
// database, in the order of the screen (pending first, oldest first). The session is not mocked: the API reads the
// caller from the token.

const MINUTE = 60_000;

async function tokenFor(userId: string) {
  const token = generateApiToken();
  const now = new Date();
  await prisma.apiToken.create({
    data: { userId, name: "api", scope: "READ", tokenHash: token.hash, lastFour: token.lastFour, createdAt: now, expiresAt: new Date(now.getTime() + 86_400_000) },
  });
  return { authorization: `Bearer ${token.value}` };
}

type Page = { items: Array<{ id: string }>; page: number; pageCount: number; total: number };

describe("the manager's API pages (CA-PAP-02)", () => {
  it("returns 20 per page in the screen's order, the last page past the end, and refuses an invalid number", async () => {
    const sector = await createDomainSector();
    const rita = await createDomainUser({ role: "REQUESTER" });
    const gabi = await createDomainUser({ role: "MANAGER", sectorId: sector.id });
    const service = await createDomainService({ categoryId: (await createDomainCategory()).id, sectorId: sector.id });
    const start = Date.now() - 5 * 24 * 60 * MINUTE;
    const pending: string[] = [];
    const decided: string[] = [];
    // 26 pending and 16 approved, interleaved in time.
    for (let index = 0; index < 42; index += 1) {
      const state: ApprovalState = index % 5 < 3 ? "PENDING" : "APPROVED";
      const request = await createDomainRequest({ requesterId: rita.id, serviceId: service.id, sectorId: sector.id });
      await prisma.request.update({ where: { id: request.id }, data: { approvalState: state, createdAt: new Date(start + index * MINUTE) } });
      (state === "PENDING" ? pending : decided).push(request.id);
    }
    const expected = [...pending, ...decided];
    const headers = await tokenFor(gabi.id);
    const read = async (query: string) => {
      const response = await getRequests(new Request(`https://serviceflow.test/api/v1/requests${query}`, { headers }));
      return { status: response.status, body: (await response.json()) as Page };
    };

    const pages = [await read("?filter=all"), await read("?filter=all&page=2"), await read("?filter=all&page=3")];
    for (const [index, { status, body }] of pages.entries()) {
      expect(status).toBe(200);
      expect(body).toMatchObject({ page: index + 1, pageCount: 3, total: 42 });
    }
    expect(pages.flatMap(({ body }) => body.items.map(({ id }) => id))).toEqual(expected);
    expect(pending).toHaveLength(26);
    expect((await read("?filter=pending")).body).toMatchObject({ total: 26, pageCount: 2 });
    expect((await read("?filter=all&page=9")).body.page).toBe(3);
    expect((await read("?page=0")).status).toBe(400);
  });
});
