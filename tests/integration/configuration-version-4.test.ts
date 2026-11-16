import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-16-tipos-de-solicitante, decision T8 (SF-277; CA-TIP-01 and CA-TIP-05): the portable configuration's
// version 4 carries each service's audience; a version 3 file has none and leaves the destination's services as they
// are. SPEC 2026-11-16-professores-e-tecnicos, P4 (SF-286; CA-PRT-01): the export writes version 5, with the list of
// kinds; a version 4 file is still accepted and converted as the migration did (the assertions on the exported version
// and value changed with P4, an exception registered in that SPEC).

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { applyConfigurationImport, exportConfiguration, previewConfigurationImport, type ConfigurationFile } from "@/modules/configuration";

type Actor = { id: string; name: string; role: Role; sectorId: string | null; isActive: boolean };
const actAs = (actor: Actor) => session.getCurrentUser.mockResolvedValue({ ...actor, email: `${actor.id}@example.test` });

async function exported(): Promise<ConfigurationFile> {
  return JSON.parse((await exportConfiguration(prisma)).content) as ConfigurationFile;
}

async function apply(file: ConfigurationFile) {
  const content = JSON.stringify(file);
  const preview = await previewConfigurationImport(content, prisma);
  if (!preview.accepted) throw new Error(JSON.stringify(preview.problems));
  return { preview, result: await applyConfigurationImport({ content, digest: preview.digest, destinationDigest: preview.destinationDigest }, prisma) };
}

describe("the portable configuration's versions 4 and 5", () => {
  it("exports each service's list of kinds (version 5) and imports a change of it, shown in the preview", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    actAs({ ...admin, name: admin.name });
    const created = await createDomainService({ categoryId: (await createDomainCategory()).id, sectorId: (await createDomainSector()).id });
    await prisma.service.update({ where: { id: created.id }, data: { offeredTo: ["STUDENT"] } });

    const file = await exported();
    expect(file.version).toBe(5);
    const item = file.data.services.find(({ name }) => name === created.name)!;
    expect(item.offeredTo).toEqual(["STUDENT"]);

    item.offeredTo = ["TECHNICIAN", "PROFESSOR"];
    const { preview } = await apply(file);
    const change = preview.items.find((entry) => entry.kind === "service" && entry.label === created.name);
    expect(change).toMatchObject({ status: "changed" });
    expect(JSON.stringify(change)).toContain("offeredTo");
    await expect(prisma.service.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({ offeredTo: ["PROFESSOR", "TECHNICIAN"] });
  });

  it("a version 4 file is converted as the migration did: only students, only public, both = every kind (P4)", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    actAs({ ...admin, name: admin.name });
    const category = (await createDomainCategory()).id;
    const sector = (await createDomainSector()).id;
    const services = await Promise.all([1, 2, 3].map(() => createDomainService({ categoryId: category, sectorId: sector })));
    await prisma.service.updateMany({ where: { id: { in: services.map(({ id }) => id) } }, data: { offeredTo: ["TECHNICIAN"] } });

    const file = await exported();
    const legacyValues = ["STUDENTS", "PUBLIC", "BOTH"] as const;
    const legacy = {
      ...file,
      version: 4,
      data: {
        ...file.data,
        services: file.data.services.map((service) => {
          const index = services.findIndex(({ name }) => name === service.name);
          return { ...service, offeredTo: index >= 0 ? legacyValues[index] : "BOTH" };
        }),
      },
    } as unknown as ConfigurationFile;
    await apply(legacy);
    const stored = await prisma.service.findMany({ where: { id: { in: services.map(({ id }) => id) } }, select: { id: true, offeredTo: true } });
    const byId = new Map(stored.map(({ id, offeredTo }) => [id, offeredTo]));
    expect(byId.get(services[0]!.id)).toEqual(["STUDENT"]);
    expect(byId.get(services[1]!.id)).toEqual(["PUBLIC"]);
    expect(byId.get(services[2]!.id)).toEqual(["STUDENT", "PROFESSOR", "TECHNICIAN", "PUBLIC"]);

    // A version 5 file with the old single value, or a version 4 file with a list, is refused.
    const wrong = { ...file, data: { ...file.data, services: file.data.services.map((service) => ({ ...service, offeredTo: "BOTH" })) } };
    const preview = await previewConfigurationImport(JSON.stringify(wrong), prisma);
    expect(preview.accepted).toBe(false);
  });

  it("a version 3 file keeps the destination's list, and a new service in it is for every kind", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    actAs({ ...admin, name: admin.name });
    const created = await createDomainService({ categoryId: (await createDomainCategory()).id, sectorId: (await createDomainSector()).id });
    await prisma.service.update({ where: { id: created.id }, data: { offeredTo: ["PUBLIC"] } });

    const file = await exported();
    const base = file.data.services.find(({ name }) => name === created.name)!;
    const newName = `${created.name} (cópia v3)`;
    const legacy: ConfigurationFile = {
      ...file,
      version: 3,
      data: {
        ...file.data,
        services: [...file.data.services, { ...base, name: newName }].map(({ offeredTo: _offeredTo, ...service }) => {
          void _offeredTo;
          return service;
        }),
      },
    };
    await apply(legacy);
    await expect(prisma.service.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({ offeredTo: ["PUBLIC"] });
    await expect(prisma.service.findFirstOrThrow({ where: { name: newName } })).resolves.toMatchObject({
      offeredTo: ["STUDENT", "PROFESSOR", "TECHNICIAN", "PUBLIC"],
    });
  });
});
