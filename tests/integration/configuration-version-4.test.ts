import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-16-tipos-de-solicitante, decision T8 (SF-277; CA-TIP-01 and CA-TIP-05): the portable configuration's
// version 4 carries each service's audience, round trip; a version 3 file has none and leaves the destination's
// services as they are.

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

describe("the portable configuration's version 4", () => {
  it("exports each service's audience and imports a change of it, shown in the preview", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    actAs({ ...admin, name: admin.name });
    const created = await createDomainService({ categoryId: (await createDomainCategory()).id, sectorId: (await createDomainSector()).id });
    await prisma.service.update({ where: { id: created.id }, data: { audience: "STUDENTS" } });

    const file = await exported();
    expect(file.version).toBe(4);
    const item = file.data.services.find(({ name }) => name === created.name)!;
    expect(item.offeredTo).toBe("STUDENTS");

    item.offeredTo = "PUBLIC";
    const { preview } = await apply(file);
    const change = preview.items.find((entry) => entry.kind === "service" && entry.label === created.name);
    expect(change).toMatchObject({ status: "changed" });
    expect(JSON.stringify(change)).toContain("offeredTo");
    await expect(prisma.service.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({ audience: "PUBLIC" });
  });

  it("a version 3 file keeps the destination's audience, and a new service in it is for both", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    actAs({ ...admin, name: admin.name });
    const created = await createDomainService({ categoryId: (await createDomainCategory()).id, sectorId: (await createDomainSector()).id });
    await prisma.service.update({ where: { id: created.id }, data: { audience: "PUBLIC" } });

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
    await expect(prisma.service.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({ audience: "PUBLIC" });
    await expect(prisma.service.findFirstOrThrow({ where: { name: newName } })).resolves.toMatchObject({ audience: "BOTH" });
  });
});
