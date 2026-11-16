import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { ValidationError } from "@/server/errors";
import { createDomainCategory, createDomainRequest, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { searchAttendantQueue } from "@/modules/requests";
import { parseSearchCriteria } from "@/modules/requests/domain/search-criteria";
import { LIST_PARAMETERS } from "@/modules/saved-views/domain/saved-view";

// SPEC 2026-11-16-tipos-de-solicitante, 4.3 (SF-279; CA-TIP-03): the queue knows and filters who asked, by the kind kept
// in the request.

type Actor = { id: string; name: string; role: Role; sectorId: string | null; isActive: boolean };
const actAs = (actor: Actor) => session.getCurrentUser.mockResolvedValue({ ...actor, email: `${actor.id}@example.test` });

describe("\"Tipo de solicitante\" in the queue (4.3 item 2)", () => {
  it("is the queue's only filter, a kind or nothing, and a saved view keeps it", () => {
    expect(parseSearchCriteria({ kind: "PUBLIC" }, "attendant").requesterKind).toBe("PUBLIC");
    expect(parseSearchCriteria({ kind: "" }, "attendant").requesterKind).toBeUndefined();
    expect(parseSearchCriteria({ kind: "PUBLIC" }, "requester").requesterKind).toBeUndefined();
    expect(() => parseSearchCriteria({ kind: "TEACHER" }, "attendant")).toThrow(ValidationError);
    expect(LIST_PARAMETERS.QUEUE).toContain("kind");
  });

  it("separates the requests of students and of the general public, by the kind each request kept", async () => {
    const sector = await createDomainSector();
    const service = await createDomainService({ categoryId: (await createDomainCategory()).id, sectorId: sector.id });
    const student = await createDomainUser({ role: "REQUESTER" });
    const outsider = await createDomainUser({ role: "REQUESTER" });
    await prisma.user.update({ where: { id: outsider.id }, data: { requesterKind: "PUBLIC" } });
    const fromStudent = await createDomainRequest({ requesterId: student.id, serviceId: service.id, sectorId: sector.id });
    const fromPublic = await createDomainRequest({ requesterId: outsider.id, serviceId: service.id, sectorId: sector.id });
    // The request kept the kind; changing the person later does not move it (rule 4).
    await prisma.user.update({ where: { id: outsider.id }, data: { requesterKind: "STUDENT" } });

    const attendant = await createDomainUser({ role: "ATTENDANT", sectorId: sector.id });
    actAs(attendant);
    const all = await searchAttendantQueue({});
    expect(all.items.map(({ id }) => id).sort()).toEqual([fromStudent.id, fromPublic.id].sort());
    expect(Object.fromEntries(all.items.map((item) => [item.id, item.requesterKindSnapshot]))).toEqual({
      [fromStudent.id]: "STUDENT",
      [fromPublic.id]: "PUBLIC",
    });
    expect((await searchAttendantQueue({ kind: "PUBLIC" })).items.map(({ id }) => id)).toEqual([fromPublic.id]);
    expect((await searchAttendantQueue({ kind: "STUDENT" })).items.map(({ id }) => id)).toEqual([fromStudent.id]);
  });
});
