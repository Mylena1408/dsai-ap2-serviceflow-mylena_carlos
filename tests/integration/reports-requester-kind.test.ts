import { describe, expect, it } from "vitest";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainRequest, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";
import { createPrismaAnalyticsReader } from "@/modules/reports/infrastructure/prisma-analytics-reader";
import { createPrismaDashboardReader } from "@/modules/reports/infrastructure/prisma-dashboard-reader";

// SPEC 2026-11-16-tipos-de-solicitante, 4.4 (SF-280; CA-TIP-04): the dashboard, the analytics and the export count by
// the kind kept in each request.

const HOUR = 3_600_000;

async function scenario() {
  const sector = await createDomainSector();
  const service = await createDomainService({ categoryId: (await createDomainCategory()).id, sectorId: sector.id });
  const student = await createDomainUser({ role: "REQUESTER" });
  const outsider = await createDomainUser({ role: "REQUESTER" });
  await prisma.user.update({ where: { id: outsider.id }, data: { requesterKind: "PUBLIC" } });
  const opened = new Date(Date.now() - 10 * HOUR);
  const fromStudent = await createDomainRequest({ requesterId: student.id, serviceId: service.id, sectorId: sector.id });
  const fromPublic = await createDomainRequest({ requesterId: outsider.id, serviceId: service.id, sectorId: sector.id });
  const secondPublic = await createDomainRequest({ requesterId: outsider.id, serviceId: service.id, sectorId: sector.id });
  await prisma.request.updateMany({ where: { id: { in: [fromStudent.id, fromPublic.id, secondPublic.id] } }, data: { createdAt: opened } });
  // One request of the general public completed in 4 hours, and rated 4.
  const completedAt = new Date(opened.getTime() + 4 * HOUR);
  await prisma.request.update({ where: { id: fromPublic.id }, data: { status: "COMPLETED", completedAt } });
  await prisma.requestSatisfaction.create({
    data: { requestId: fromPublic.id, requesterId: outsider.id, rating: 4, completedAtSnapshot: completedAt, ratedAt: new Date(completedAt.getTime() + HOUR) },
  });
  const range = { from: new Date(Date.now() - 24 * HOUR), before: new Date(Date.now() + HOUR) };
  return { scope: { sectorId: sector.id }, range, fromStudent, fromPublic };
}

describe("the numbers by requester kind (4.4)", () => {
  it("the dashboard counts the requests opened in the period by kind (item 1)", async () => {
    const { scope, range } = await scenario();
    const totals = await createPrismaDashboardReader(prisma).periodTotals(scope, range);
    expect([...(totals.byRequesterKind ?? [])].sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([
      { kind: "PUBLIC", count: 2 },
      { kind: "STUDENT", count: 1 },
    ]);
  });

  it("the analytics give opened, completed, the average time and the average rating by kind (item 2)", async () => {
    const { scope, range } = await scenario();
    const rows = await createPrismaAnalyticsReader(prisma).byRequesterKind!(scope, range);
    const byKind = Object.fromEntries(rows.map((row) => [row.kind, row]));
    expect(byKind.PUBLIC).toMatchObject({ opened: 2, completed: 1, averageRating: 4 });
    expect(byKind.PUBLIC!.averageMs).toBeCloseTo(4 * HOUR, -3);
    expect(byKind.STUDENT).toMatchObject({ opened: 1, completed: 0, averageMs: null, averageRating: null });
  });

  it("the export carries the kind of each request (item 3)", async () => {
    const { scope, range, fromStudent, fromPublic } = await scenario();
    const rows = await createPrismaDashboardReader(prisma).listForExport(scope, range, 100);
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.requesterKind]));
    expect(byId[fromStudent.id]).toBe("STUDENT");
    expect(byId[fromPublic.id]).toBe("PUBLIC");
  });
});
