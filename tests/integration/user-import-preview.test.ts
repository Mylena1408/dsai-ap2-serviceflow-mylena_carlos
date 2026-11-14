import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainSector, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 2 and 4.3 (SF-242; CA-IMP-02): the preview against the real
// database writes nothing.

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { previewUserImport } from "@/modules/user-import";

type Person = { id: string; name: string; role: Role; sectorId: string | null };
const as = (person: Person) => session.getCurrentUser.mockResolvedValue({ ...person, isActive: true, email: `${person.id}@example.test` });
const bytes = (text: string) => new TextEncoder().encode(text);

describe("the import preview (SF-242)", () => {
  it("finds e-mails in use ignoring case, sectors by name among the active ones, and writes nothing", async () => {
    const active = await prisma.sector.create({ data: { name: "Central de Serviços Importação" } });
    await prisma.sector.create({ data: { name: "Arquivo Importação", isActive: false } });
    const admin = await createDomainUser({ role: "ADMIN" });
    await createDomainUser({ role: "REQUESTER", email: "existente@importacao.test" });
    as(admin);

    const file = [
      "nome;email;perfil;setor",
      "Ana Nova;ana@importacao.test;solicitante;",
      "Já Existe;EXISTENTE@importacao.test;solicitante;",
      "Diego;diego@importacao.test;atendente;central de serviços importação",
      "Gil;gil@importacao.test;gestor;Arquivo Importação",
    ].join("\n");
    const [users, audits] = await Promise.all([prisma.user.count(), prisma.auditEntry.count()]);

    const preview = await previewUserImport(bytes(file));
    expect(preview.ok && preview.lines.map((line) => (line.outcome === "error" ? line.errors : line.outcome))).toEqual([
      "create",
      "skip",
      "create",
      ["sector_unknown"],
    ]);
    expect(preview.ok && preview.lines[2]).toMatchObject({ person: { sectorId: active.id, role: "ATTENDANT", email: "diego@importacao.test" } });
    expect(preview).toMatchObject({ summary: { create: 2, skip: 1, error: 1 } });

    expect(await prisma.user.count()).toBe(users);
    expect(await prisma.auditEntry.count()).toBe(audits);
  });

  it("refuses a manager and an attendant", async () => {
    const sector = await createDomainSector();
    for (const role of ["MANAGER", "ATTENDANT"] as const) {
      const person = await createDomainUser({ role, sectorId: sector.id });
      as({ ...person, role });
      await expect(previewUserImport(bytes("nome;email;perfil;setor\nAna;a@x.test;solicitante;"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
