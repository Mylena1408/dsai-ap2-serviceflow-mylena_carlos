import { describe, expect, it, vi } from "vitest";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-16-tipos-de-solicitante (SF-276; CA-TIP-01 to 03 and 05 by the rules): the requester's kind and the
// service's audience in the database, in the registration, in the catalog and in the opening.

const authorization = vi.hoisted(() => ({
  requireConfigurationAdministrator: vi.fn(),
  requireRequestCreator: vi.fn(),
  requirePublishedCatalogReader: vi.fn(),
  requireCatalogEditor: vi.fn(),
  assertCatalogSector: vi.fn(),
}));
vi.mock("@/server/authorization", () => authorization);

import { createUser, updateUser } from "@/modules/users";
import { createService, getPublishedService, listPublishedServices, updateService } from "@/modules/services";
import { createRequest } from "@/modules/requests";
import { NotFoundError, ValidationError } from "@/server/errors";

const actor = (user: { id: string; role: string; sectorId: string | null }) => ({ ...user, isActive: true });

async function asAdministrator() {
  const admin = await createDomainUser({ role: "ADMIN" });
  authorization.requireConfigurationAdministrator.mockResolvedValue(actor(admin));
  authorization.requireCatalogEditor.mockResolvedValue({ actor: actor(admin), sectorId: null });
  return admin;
}

async function asRequester(kind: "STUDENT" | "PUBLIC") {
  const requester = await createDomainUser({ role: "REQUESTER" });
  await prisma.user.update({ where: { id: requester.id }, data: { requesterKind: kind } });
  authorization.requireRequestCreator.mockResolvedValue(actor(requester));
  authorization.requirePublishedCatalogReader.mockResolvedValue(actor(requester));
  return requester;
}

async function service(audience: "STUDENTS" | "PUBLIC" | "BOTH") {
  const category = await createDomainCategory();
  const sector = await createDomainSector();
  const created = await createDomainService({ categoryId: category.id, sectorId: sector.id });
  return prisma.service.update({ where: { id: created.id }, data: { audience } });
}

describe("the kind in the database (rule 3; decision T4)", () => {
  it("a requester saved without a kind is a student; another role never keeps one", async () => {
    const requester = await createDomainUser({ role: "REQUESTER" });
    expect(requester.requesterKind).toBe("STUDENT");
    const attendant = await createDomainUser({ role: "ATTENDANT", sectorId: (await createDomainSector()).id });
    expect(attendant.requesterKind).toBeNull();

    // A requester cannot lose the kind; a role change clears it (section 4.1 item 1).
    const cleared = await prisma.user.update({ where: { id: requester.id }, data: { requesterKind: null } });
    expect(cleared.requesterKind).toBe("STUDENT");
    const admin = await prisma.user.update({ where: { id: requester.id }, data: { role: "ADMIN" } });
    expect(admin.requesterKind).toBeNull();
    await expect(prisma.user.update({ where: { id: attendant.id }, data: { requesterKind: "PUBLIC" } })).resolves.toMatchObject({ requesterKind: null });

    const [check] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS "count" FROM pg_constraint WHERE conname = 'User_requesterKind_role_check'`;
    expect(Number(check!.count)).toBe(1);
  });

  it("a service created without an audience is for both (decision T5)", async () => {
    const created = await createDomainService({ categoryId: (await createDomainCategory()).id, sectorId: (await createDomainSector()).id });
    expect(created.audience).toBe("BOTH");
  });
});

describe("the registration (section 4.1; CA-TIP-01)", () => {
  it("creates and changes a requester's kind, audited, and refuses a kind for another role", async () => {
    const admin = await asAdministrator();
    const created = await createUser(
      { name: "Pessoa da comunidade", email: `comunidade-${Date.now()}@exemplo.test`, password: "senha-de-teste-longa", role: "REQUESTER", requesterKind: "PUBLIC" },
      prisma,
    );
    expect(created.requesterKind).toBe("PUBLIC");

    const updated = await updateUser(created.id, { name: created.name, email: created.email, role: "REQUESTER", requesterKind: "STUDENT" }, prisma);
    expect(updated.requesterKind).toBe("STUDENT");
    const audit = await prisma.auditEntry.findFirstOrThrow({ where: { entityId: created.id, action: "UPDATED" }, orderBy: { occurredAt: "desc" } });
    expect(JSON.stringify(audit.changes)).toContain("requesterKind");

    // Without a kind, a requester is a student; another role with a kind is refused.
    const student = await createUser({ name: "Aluna", email: `aluna-${Date.now()}@exemplo.test`, password: "senha-de-teste-longa", role: "REQUESTER" }, prisma);
    expect(student.requesterKind).toBe("STUDENT");
    await expect(
      createUser({ name: "Gestão", email: `adm-${Date.now()}@exemplo.test`, password: "senha-de-teste-longa", role: "ADMIN", requesterKind: "PUBLIC" }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(admin.role).toBe("ADMIN");
  });

  it("creates and changes a service's audience, audited", async () => {
    await asAdministrator();
    const category = await createDomainCategory();
    const sector = await createDomainSector();
    const created = await createService(
      { name: `Declaração de matrícula ${Date.now()}`, description: "Para alunos.", categoryId: category.id, sectorId: sector.id, audience: "STUDENTS" },
      prisma,
    );
    expect(created.audience).toBe("STUDENTS");
    const kept = await updateService(created.id, { name: created.name, description: created.description, categoryId: category.id, sectorId: sector.id }, prisma);
    expect(kept.audience).toBe("STUDENTS");
    const changed = await updateService(
      created.id,
      { name: created.name, description: created.description, categoryId: category.id, sectorId: sector.id, audience: "PUBLIC" },
      prisma,
    );
    expect(changed.audience).toBe("PUBLIC");
    const audit = await prisma.auditEntry.findFirstOrThrow({ where: { entityId: created.id, action: "UPDATED" }, orderBy: { occurredAt: "desc" } });
    expect(JSON.stringify(audit.changes)).toContain("serviceAudience");
  });
});

describe("the catalog and the opening (sections 4.2; rules 2, 4 and 5; CA-TIP-02 and 03)", () => {
  it("each kind sees and opens only the services of its audience or both; another one is not found", async () => {
    const forStudents = await service("STUDENTS");
    const forPublic = await service("PUBLIC");
    const forBoth = await service("BOTH");

    await asRequester("PUBLIC");
    const publicIds = (await listPublishedServices(prisma)).map(({ id }) => id);
    expect(publicIds).toEqual(expect.arrayContaining([forPublic.id, forBoth.id]));
    expect(publicIds).not.toContain(forStudents.id);
    await expect(getPublishedService(forStudents.id, prisma)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createRequest({ serviceId: forStudents.id, description: "Quero pedir." }, prisma)).rejects.toBeInstanceOf(NotFoundError);
    await expect(prisma.request.count({ where: { serviceId: forStudents.id } })).resolves.toBe(0);

    await asRequester("STUDENT");
    const studentIds = (await listPublishedServices(prisma)).map(({ id }) => id);
    expect(studentIds).toEqual(expect.arrayContaining([forStudents.id, forBoth.id]));
    expect(studentIds).not.toContain(forPublic.id);
    await expect(createRequest({ serviceId: forPublic.id, description: "Quero pedir." }, prisma)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a request keeps the kind of who opened it, also after the person changes (decision T6)", async () => {
    const forBoth = await service("BOTH");
    const person = await asRequester("PUBLIC");
    const opened = await createRequest({ serviceId: forBoth.id, description: "Pedido do público geral." }, prisma);
    const stored = await prisma.request.findUniqueOrThrow({ where: { id: opened.id } });
    expect(stored.requesterKindSnapshot).toBe("PUBLIC");

    await prisma.user.update({ where: { id: person.id }, data: { requesterKind: "STUDENT" } });
    await expect(prisma.request.findUniqueOrThrow({ where: { id: opened.id } })).resolves.toMatchObject({ requesterKindSnapshot: "PUBLIC" });
    const next = await createRequest({ serviceId: forBoth.id, description: "Agora como aluno." }, prisma);
    await expect(prisma.request.findUniqueOrThrow({ where: { id: next.id } })).resolves.toMatchObject({ requesterKindSnapshot: "STUDENT" });
  });
});
