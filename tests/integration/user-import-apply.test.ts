import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "./fixtures";
import { createDomainSector, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 3 and 4.3 items 3 and 4 (SF-243; decision K1; CA-IMP-03 and
// CA-IMP-04): the application against the real database.

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { applyUserImport, previewUserImport } from "@/modules/user-import";
import { setUserActive, updateUser } from "@/modules/users";
import { verifyPassword } from "@/modules/auth";

type Person = { id: string; name: string; role: Role; sectorId: string | null };
const as = (person: Person) => session.getCurrentUser.mockResolvedValue({ ...person, isActive: true, email: `${person.id}@example.test` });
const bytes = (text: string) => new TextEncoder().encode(text);

async function previewed(text: string) {
  const preview = await previewUserImport(bytes(text));
  if (!preview.ok) throw new Error(`refused: ${preview.error}`);
  return preview;
}

describe("applying an import (SF-243)", () => {
  it("creates the valid lines inactive and without a usable password, audits each one and the import", async () => {
    const sector = await createDomainSector();
    const sectorRow = await prisma.sector.findUniqueOrThrow({ where: { id: sector.id } });
    const admin = await createDomainUser({ role: "ADMIN" });
    await createDomainUser({ role: "REQUESTER", email: "existe@aplica.test" });
    as(admin);

    const file = [
      "nome;email;perfil;setor",
      "Ana Nova;ANA@aplica.test;solicitante;",
      `Diego;diego@aplica.test;atendente;${sectorRow.name}`,
      "Já Existe;existe@aplica.test;solicitante;",
      "Chefe;chefe@aplica.test;chefe;",
    ].join("\n");
    const preview = await previewed(file);
    const result = await applyUserImport({ content: preview.content, digest: preview.digest });
    expect(result.summary).toEqual({ create: 2, skip: 1, error: 1 });

    const created = await prisma.user.findMany({ where: { email: { in: ["ana@aplica.test", "diego@aplica.test"] } }, orderBy: { email: "asc" } });
    expect(created.map(({ name, email, role, sectorId, isActive, passwordHash }) => ({ name, email, role, sectorId, isActive, passwordHash }))).toEqual([
      { name: "Ana Nova", email: "ana@aplica.test", role: "REQUESTER", sectorId: null, isActive: false, passwordHash: "!importado" },
      { name: "Diego", email: "diego@aplica.test", role: "ATTENDANT", sectorId: sector.id, isActive: false, passwordHash: "!importado" },
    ]);
    expect(await verifyPassword("!importado", "qualquer")).toBe(false);

    const audits = await prisma.auditEntry.findMany({ where: { actorId: admin.id }, orderBy: { occurredAt: "asc" }, select: { action: true, entityType: true, entityId: true, changes: true } });
    expect(audits.map(({ action, entityType }) => `${action}:${entityType}`)).toEqual(["CREATED:USER", "CREATED:USER", "IMPORTED:USER_IMPORT"]);
    expect(audits[2]!.entityId).toBe(result.importId);
    expect(audits[2]!.changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "createdCount", after: 2 }), expect.objectContaining({ field: "errorCount", after: 1 })]),
    );

    const record = await prisma.userImport.findUniqueOrThrow({ where: { id: result.importId } });
    expect(record).toMatchObject({ actorId: admin.id, createdCount: 2, skippedCount: 1, errorCount: 1 });
    expect(record.report).toEqual([
      { line: 4, outcome: "skip", reasons: ["email_exists"], role: "solicitante", sector: "" },
      { line: 5, outcome: "error", reasons: ["role_invalid"], role: "chefe", sector: "" },
    ]);
    expect(JSON.stringify(record.report)).not.toMatch(/existe@aplica|Já Existe|Chefe|chefe@aplica/);
  });

  it("evaluates again with the database of the moment: an e-mail created after the preview is skipped", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    as(admin);
    const preview = await previewed("nome;email;perfil;setor\nAna;tarde@aplica.test;solicitante;\nBia;bia@aplica.test;solicitante;");
    expect(preview.summary).toEqual({ create: 2, skip: 0, error: 0 });
    await createDomainUser({ role: "REQUESTER", email: "tarde@aplica.test" });

    const result = await applyUserImport({ content: preview.content, digest: preview.digest });
    expect(result.summary).toEqual({ create: 1, skip: 1, error: 0 });
    expect(result.lines.map(({ line, outcome }) => [line, outcome])).toEqual([
      [2, "skip"],
      [3, "create"],
    ]);
  });

  it("refuses a changed text and writes nothing", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    as(admin);
    const preview = await previewed("nome;email;perfil;setor\nAna;mudou@aplica.test;solicitante;");
    const [users, imports] = await Promise.all([prisma.user.count(), prisma.userImport.count()]);
    await expect(applyUserImport({ content: `${preview.content}\nBia;bia2@aplica.test;solicitante;`, digest: preview.digest })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await prisma.user.count()).toBe(users);
    expect(await prisma.userImport.count()).toBe(imports);
  });

  it("the administrator activates an imported person and sets the password with the screen of today (K1)", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    as(admin);
    const preview = await previewed("nome;email;perfil;setor\nRita Nova;rita@aplica.test;solicitante;");
    await applyUserImport({ content: preview.content, digest: preview.digest });
    const rita = await prisma.user.findUniqueOrThrow({ where: { email: "rita@aplica.test" } });

    await updateUser(rita.id, { name: rita.name, email: rita.email, role: rita.role, sectorId: null, password: "senha-forte-123" });
    await setUserActive(rita.id, true);
    const active = await prisma.user.findUniqueOrThrow({ where: { id: rita.id } });
    expect(active.isActive).toBe(true);
    expect(await verifyPassword(active.passwordHash, "senha-forte-123")).toBe(true);
  });

  it("refuses a manager", async () => {
    const sector = await createDomainSector();
    const admin = await createDomainUser({ role: "ADMIN" });
    as(admin);
    const preview = await previewed("nome;email;perfil;setor\nAna;gestor@aplica.test;solicitante;");
    const manager = await createDomainUser({ role: "MANAGER", sectorId: sector.id });
    as({ ...manager, role: "MANAGER" });
    await expect(applyUserImport({ content: preview.content, digest: preview.digest })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.user.count({ where: { email: "gestor@aplica.test" } })).toBe(0);
  });
});

describe("the import record in the database", () => {
  it("refuses counts out of 1 to 500 and a report that does not match the lines left out", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    for (const data of [
      { createdCount: 0, skippedCount: 0, errorCount: 0, report: [] },
      { createdCount: 501, skippedCount: 0, errorCount: 0, report: [] },
      { createdCount: -1, skippedCount: 2, errorCount: 0, report: [{}, {}] },
      { createdCount: 1, skippedCount: 1, errorCount: 0, report: [] },
      { createdCount: 1, skippedCount: 0, errorCount: 0, report: {} },
    ]) {
      await expect(prisma.userImport.create({ data: { ...data, actorId: admin.id } })).rejects.toThrow(/UserImport_counts_check/);
    }
    await expect(prisma.userImport.create({ data: { createdCount: 1, skippedCount: 1, errorCount: 0, report: [{ line: 2 }], actorId: admin.id } })).resolves.toBeDefined();
  });
});
