import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { RequesterKind as PrismaRequesterKind, Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainRequest, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});
const schedule = vi.hoisted(() => ({ scheduleEventProcessing: vi.fn() }));
vi.mock("@/server/jobs/schedule", () => schedule);

import { createUser } from "@/modules/users";
import { createService, getPublishedService, listPublishedServices, updateService } from "@/modules/services";
import { createRequest, searchAttendantQueue } from "@/modules/requests";
import { getServiceMap } from "@/modules/service-map";
import { createPrismaAnalyticsReader } from "@/modules/reports/infrastructure/prisma-analytics-reader";
import { createPrismaDashboardReader } from "@/modules/reports/infrastructure/prisma-dashboard-reader";
import { NotFoundError, ValidationError } from "@/server/errors";
import { REQUESTER_KINDS, offeredToFromLegacy, type RequesterKind } from "@/shared/requester-kinds";

// SPEC 2026-11-16-professores-e-tecnicos, part A (SF-285 and SF-286; CA-PRT-01 to 04 by the rules): the professor and
// the administrative technician as requester kinds, and "Oferecido a" as a list of kinds.

type Actor = { id: string; name: string; role: Role; sectorId: string | null; isActive: boolean };
const actAs = (actor: Actor) => session.getCurrentUser.mockResolvedValue({ ...actor, email: `${actor.id}@example.test` });
const ALL: RequesterKind[] = ["STUDENT", "PROFESSOR", "TECHNICIAN", "PUBLIC"];

async function person(kind: RequesterKind) {
  const user = await createDomainUser({ role: "REQUESTER" });
  await prisma.user.update({ where: { id: user.id }, data: { requesterKind: kind } });
  return user;
}

async function serviceFor(offeredTo: RequesterKind[]) {
  const created = await createDomainService({ categoryId: (await createDomainCategory()).id, sectorId: (await createDomainSector()).id });
  return prisma.service.update({ where: { id: created.id }, data: { offeredTo } });
}

/** The conversion written in the migration, run by the database itself on the three old values. */
async function convertedByTheMigration(): Promise<Record<string, string[]>> {
  const sql = readFileSync(join(process.cwd(), "prisma", "migrations", "20261116300100_service_offered_to", "migration.sql"), "utf8");
  const expression = /SET "offeredTo" = (CASE "audience"[\s\S]*?END);/.exec(sql)?.[1];
  expect(expression).toBeDefined();
  const rows = await prisma.$queryRawUnsafe<Array<{ audience: string; offered: string[] }>>(
    `SELECT "audience", (${expression})::text[] AS "offered" FROM (VALUES ('STUDENTS'), ('PUBLIC'), ('BOTH')) AS "old"("audience")`,
  );
  return Object.fromEntries(rows.map(({ audience, offered }) => [audience, offered]));
}

describe("the migration (P1; CA-PRT-03)", () => {
  it("converts the old audience so that students and the general public see exactly what they saw", async () => {
    const converted = await convertedByTheMigration();
    expect(converted).toEqual({ STUDENTS: ["STUDENT"], PUBLIC: ["PUBLIC"], BOTH: ALL });
    // The old rule: a student saw "only students" and "both"; the general public, "only public" and "both".
    const oldRule: Record<string, RequesterKind[]> = { STUDENTS: ["STUDENT"], PUBLIC: ["PUBLIC"], BOTH: ["STUDENT", "PUBLIC"] };
    for (const [audience, kinds] of Object.entries(oldRule)) {
      for (const kind of ["STUDENT", "PUBLIC"] as const) {
        expect(converted[audience]!.includes(kind), `${audience} / ${kind}`).toBe(kinds.includes(kind));
      }
      // The same conversion is the configuration's for a version 4 file (P4).
      expect(offeredToFromLegacy(audience as "STUDENTS" | "PUBLIC" | "BOTH")).toEqual(converted[audience]);
    }
    // "Both" is now also for professors and technicians.
    expect(converted.BOTH).toEqual(expect.arrayContaining(["PROFESSOR", "TECHNICIAN"]));
  });

  it("the database keeps the list with at least one kind, and a new service is for every kind", async () => {
    const created = await createDomainService({ categoryId: (await createDomainCategory()).id, sectorId: (await createDomainSector()).id });
    expect(created.offeredTo).toEqual(ALL);
    await expect(prisma.service.update({ where: { id: created.id }, data: { offeredTo: [] } })).rejects.toThrow();
    const [kinds] = await prisma.$queryRaw<Array<{ kinds: string[] }>>`
      SELECT enum_range(NULL::"RequesterKind")::text[] AS "kinds"`;
    expect(kinds!.kinds).toEqual(ALL);
  });
});

describe("registration and the service's list (part A items 1 and 2; CA-PRT-01)", () => {
  it("the administrator registers professors and technicians, and gives a service a list of kinds, audited", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    actAs({ ...admin, isActive: true });
    const stamp = Date.now();
    const professor = await createUser(
      { name: "Rui Prof", email: `rui.${stamp}@example.test`, password: "senha-de-teste-longa", role: "REQUESTER", sectorId: null, requesterKind: "PROFESSOR" },
      prisma,
    );
    expect(professor.requesterKind).toBe("PROFESSOR");
    const technician = await createUser(
      { name: "Teo Tec", email: `teo.${stamp}@example.test`, password: "senha-de-teste-longa", role: "REQUESTER", sectorId: null, requesterKind: "TECHNICIAN" },
      prisma,
    );
    expect(technician.requesterKind).toBe("TECHNICIAN");

    const category = await createDomainCategory();
    const sector = await createDomainSector();
    const base = { description: "Para servidores.", categoryId: category.id, sectorId: sector.id };
    const created = await createService({ name: `Reserva de auditório ${stamp}`, ...base, offeredTo: ["TECHNICIAN", "PROFESSOR", "PROFESSOR"] }, prisma);
    expect(created.offeredTo).toEqual(["PROFESSOR", "TECHNICIAN"]);
    await expect(createService({ name: `Sem público ${stamp}`, ...base, offeredTo: [] }, prisma)).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createService({ name: `Tipo errado ${stamp}`, ...base, offeredTo: ["TEACHER"] as unknown as RequesterKind[] }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
    const changed = await updateService(created.id, { name: created.name, ...base, offeredTo: ["STUDENT"] }, prisma);
    expect(changed.offeredTo).toEqual(["STUDENT"]);
    const audit = await prisma.auditEntry.findFirstOrThrow({ where: { entityId: created.id, action: "UPDATED" }, orderBy: { occurredAt: "desc" } });
    expect(JSON.stringify(audit.changes)).toContain("offeredTo");
  });
});

describe("what each kind sees and opens (part A item 3; CA-PRT-02)", () => {
  it("each kind lists, opens and maps only the services offered to it; another one is not found", async () => {
    const forProfessors = await serviceFor(["PROFESSOR"]);
    const forStaff = await serviceFor(["PROFESSOR", "TECHNICIAN"]);
    const forStudents = await serviceFor(["STUDENT"]);
    const forEveryone = await serviceFor(ALL);
    const ids = [forProfessors.id, forStaff.id, forStudents.id, forEveryone.id];

    const expected: Record<RequesterKind, string[]> = {
      STUDENT: [forStudents.id, forEveryone.id],
      PROFESSOR: [forProfessors.id, forStaff.id, forEveryone.id],
      TECHNICIAN: [forStaff.id, forEveryone.id],
      PUBLIC: [forEveryone.id],
    };
    for (const kind of REQUESTER_KINDS) {
      const reader = await person(kind);
      actAs({ ...reader, isActive: true });
      const listed = (await listPublishedServices(prisma)).map(({ id }) => id).filter((id) => ids.includes(id));
      expect(listed.sort(), kind).toEqual([...expected[kind]].sort());
      const map = await getServiceMap(prisma);
      const mapped = [...map.attendance, ...map.specialized]
        .flatMap((entry) => (entry.kind === "service" ? [entry.service.id] : []))
        .filter((id) => ids.includes(id));
      expect(mapped.sort(), kind).toEqual([...expected[kind]].sort());
      for (const id of ids.filter((id) => !expected[kind].includes(id))) {
        await expect(getPublishedService(id, prisma), kind).rejects.toBeInstanceOf(NotFoundError);
        await expect(createRequest({ serviceId: id, description: "Quero pedir." }, prisma), kind).rejects.toBeInstanceOf(NotFoundError);
      }
    }
    await expect(prisma.request.count({ where: { serviceId: forProfessors.id } })).resolves.toBe(0);
  });

  it("the map tells the kind of the reader", async () => {
    const reader = await person("TECHNICIAN");
    actAs({ ...reader, isActive: true });
    await expect(getServiceMap(prisma)).resolves.toMatchObject({ requesterKind: "TECHNICIAN" });
  });
});

describe("the queue and the numbers with the four kinds (part A item 4; CA-PRT-04)", () => {
  async function scenario() {
    const sector = await createDomainSector();
    const service = await createDomainService({ categoryId: (await createDomainCategory()).id, sectorId: sector.id });
    const opened: Record<RequesterKind, string> = {} as Record<RequesterKind, string>;
    for (const kind of REQUESTER_KINDS) {
      const requester = await person(kind);
      opened[kind] = (await createDomainRequest({ requesterId: requester.id, serviceId: service.id, sectorId: sector.id })).id;
    }
    return { sector, opened };
  }

  it("each request keeps the kind of who opened it, and the queue filters each of the four", async () => {
    const { sector, opened } = await scenario();
    const stored = await prisma.request.findMany({ where: { id: { in: Object.values(opened) } }, select: { id: true, requesterKindSnapshot: true } });
    expect(Object.fromEntries(stored.map(({ id, requesterKindSnapshot }) => [id, requesterKindSnapshot]))).toEqual(
      Object.fromEntries(REQUESTER_KINDS.map((kind) => [opened[kind], kind as PrismaRequesterKind])),
    );
    const attendant = await createDomainUser({ role: "ATTENDANT", sectorId: sector.id });
    actAs({ ...attendant, isActive: true });
    for (const kind of REQUESTER_KINDS) {
      expect((await searchAttendantQueue({ kind })).items.map(({ id }) => id), kind).toEqual([opened[kind]]);
    }
  });

  it("the dashboard, the analytics and the export count the four kinds", async () => {
    const { sector, opened } = await scenario();
    const range = { from: new Date(Date.now() - 86_400_000), before: new Date(Date.now() + 3_600_000) };
    const scope = { sectorId: sector.id };
    const totals = await createPrismaDashboardReader(prisma).periodTotals(scope, range);
    expect([...(totals.byRequesterKind ?? [])].sort((a, b) => a.kind.localeCompare(b.kind))).toEqual(
      [...REQUESTER_KINDS].sort().map((kind) => ({ kind, count: 1 })),
    );
    const rows = await createPrismaAnalyticsReader(prisma).byRequesterKind!(scope, range);
    expect(rows.map(({ kind }) => kind).sort()).toEqual([...REQUESTER_KINDS].sort());
    const exported = await createPrismaDashboardReader(prisma).listForExport(scope, range, 100);
    expect(Object.fromEntries(exported.map((row) => [row.id, row.requesterKind]))).toEqual(
      Object.fromEntries(REQUESTER_KINDS.map((kind) => [opened[kind], kind])),
    );
  });
});
