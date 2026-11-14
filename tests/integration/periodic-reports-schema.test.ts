import { describe, expect, it } from "vitest";
import { prisma } from "./fixtures";
import { createDomainSector, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 and 5.3 by the database (SF-246; decision K7; the rules of CA-REL-02).

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const metrics = { opened: 0 };

describe("periodic reports in the database (5.3 item 1)", () => {
  it("keeps one report per kind, first day and sector, the organization's ('no sector') included", async () => {
    const sector = await createDomainSector();
    const week = { kind: "WEEKLY" as const, periodStart: day("2026-11-09"), periodEnd: day("2026-11-15"), generatedAt: new Date(), metrics };

    await prisma.periodicReport.create({ data: { ...week, sectorId: null } });
    await prisma.periodicReport.create({ data: { ...week, sectorId: sector.id } });
    await expect(prisma.periodicReport.create({ data: { ...week, sectorId: null } })).rejects.toMatchObject({ code: "P2002" });
    await expect(prisma.periodicReport.create({ data: { ...week, sectorId: sector.id } })).rejects.toMatchObject({ code: "P2002" });
    // Another kind or another period is another report.
    await expect(
      prisma.periodicReport.create({ data: { kind: "MONTHLY", periodStart: day("2026-11-01"), periodEnd: day("2026-11-30"), generatedAt: new Date(), metrics, sectorId: null } }),
    ).resolves.toBeDefined();
    await expect(prisma.periodicReport.create({ data: { ...week, periodStart: day("2026-11-16"), periodEnd: day("2026-11-22"), sectorId: null } })).resolves.toBeDefined();
  });

  it("accepts a week from Monday to Sunday and a month from the 1st to its last day, a leap February included", async () => {
    for (const [kind, start, end] of [
      ["WEEKLY", "2026-12-28", "2027-01-03"],
      ["MONTHLY", "2028-02-01", "2028-02-29"],
      ["MONTHLY", "2026-12-01", "2026-12-31"],
    ] as const) {
      await expect(prisma.periodicReport.create({ data: { kind, periodStart: day(start), periodEnd: day(end), generatedAt: new Date(), metrics } })).resolves.toBeDefined();
    }
  });

  it("refuses any other period, and numbers that are not an object", async () => {
    for (const [kind, start, end, numbers] of [
      ["WEEKLY", "2026-11-10", "2026-11-16", metrics],
      ["WEEKLY", "2026-11-09", "2026-11-14", metrics],
      ["MONTHLY", "2026-11-02", "2026-11-30", metrics],
      ["MONTHLY", "2026-11-01", "2026-11-29", metrics],
      ["MONTHLY", "2026-02-01", "2026-02-29", metrics],
      ["WEEKLY", "2026-11-09", "2026-11-15", [1, 2]],
    ] as const) {
      await expect(
        prisma.periodicReport.create({ data: { kind, periodStart: day(start), periodEnd: day(end), generatedAt: new Date(), metrics: numbers as object } }),
      ).rejects.toThrow(/PeriodicReport_period_check|date\/time field value out of range/);
    }
  });
});

describe("the activation in the database (5.3 item 3)", () => {
  it("keeps one setting per kind, named by a UUID for the audit trail", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    const setting = await prisma.periodicReportSetting.create({ data: { kind: "WEEKLY", isEnabled: true, updatedAt: new Date(), updatedById: admin.id } });
    expect(setting.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(prisma.periodicReportSetting.create({ data: { kind: "WEEKLY", isEnabled: false, updatedAt: new Date(), updatedById: admin.id } })).rejects.toMatchObject({
      code: "P2002",
    });
    await expect(
      prisma.auditEntry.create({
        data: { actorId: admin.id, actorRole: "ADMIN", action: "UPDATED", entityType: "PERIODIC_REPORT_SETTING", entityId: setting.id, entityLabel: "Relatório semanal", changes: [] },
      }),
    ).resolves.toMatchObject({ entityType: "PERIODIC_REPORT_SETTING" });
  });
});
