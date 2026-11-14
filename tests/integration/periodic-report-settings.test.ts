import { describe, expect, it, vi } from "vitest";
import { prisma } from "./fixtures";
import { createDomainSector, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 5.3 item 3 (SF-251; CA-REL-01): the administrator's activation against
// the real database, with the audit trail, and the generation following it.

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { generatePeriodicReports, getPeriodicReportSettings, setPeriodicReportEnabled } from "@/modules/periodic-reports";

async function signInAdmin() {
  const admin = await createDomainUser({ role: "ADMIN" });
  session.getCurrentUser.mockResolvedValue({ id: admin.id, name: "Admin", role: "ADMIN", sectorId: null, isActive: true, email: admin.email });
  return admin;
}

describe("turning the periodic reports on and off (SF-251)", () => {
  it("starts off, turns on and off with the audit trail, and turning off keeps the reports generated", async () => {
    await createDomainSector();
    const admin = await signInAdmin();
    expect(await getPeriodicReportSettings()).toEqual({ WEEKLY: false, MONTHLY: false });
    expect(await generatePeriodicReports({}, prisma)).toMatchObject({ generated: 0 });

    expect(await setPeriodicReportEnabled({ kind: "WEEKLY", enabled: "true" })).toEqual({ changed: true });
    expect(await setPeriodicReportEnabled({ kind: "WEEKLY", enabled: "true" })).toEqual({ changed: false });
    expect(await getPeriodicReportSettings()).toEqual({ WEEKLY: true, MONTHLY: false });
    const setting = await prisma.periodicReportSetting.findUniqueOrThrow({ where: { kind: "WEEKLY" } });
    expect(setting.updatedById).toBe(admin.id);

    const { generated } = await generatePeriodicReports({}, prisma);
    expect(generated).toBeGreaterThan(0);

    expect(await setPeriodicReportEnabled({ kind: "WEEKLY", enabled: "false" })).toEqual({ changed: true });
    expect(await prisma.periodicReport.count()).toBe(generated);
    expect(await generatePeriodicReports({}, prisma)).toEqual({ periods: [], generated: 0, alreadyThere: 0, notices: 0 });

    const entries = await prisma.auditEntry.findMany({
      where: { entityType: "PERIODIC_REPORT_SETTING", entityId: setting.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(entries.map(({ action, entityLabel, actorId }) => ({ action, entityLabel, actorId }))).toEqual([
      { action: "CREATED", entityLabel: "Relatório semanal", actorId: admin.id },
      { action: "UPDATED", entityLabel: "Relatório semanal", actorId: admin.id },
    ]);
    expect(entries[1]!.changes).toEqual([{ field: "isEnabled", before: true, after: false }]);
  });

  it("refuses a manager", async () => {
    const sector = await createDomainSector();
    const gabi = await createDomainUser({ role: "MANAGER", sectorId: sector.id });
    session.getCurrentUser.mockResolvedValue({ id: gabi.id, name: "Gabi", role: "MANAGER", sectorId: sector.id, isActive: true, email: gabi.email });
    await expect(setPeriodicReportEnabled({ kind: "WEEKLY", enabled: "true" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getPeriodicReportSettings()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.periodicReportSetting.count()).toBe(0);
  });
});
