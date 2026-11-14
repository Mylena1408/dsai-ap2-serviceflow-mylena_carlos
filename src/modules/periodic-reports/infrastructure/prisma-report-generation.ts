import type { Prisma, PrismaClient } from "@prisma/client";
import { zonedDayOf } from "@/shared/time";
import type { PeriodicReportGenerationStore } from "../application/generate-reports";
import { createPrismaReportCountsReader } from "./prisma-report-counts";

// The generation in PostgreSQL (SPEC 2026-11-09-comunicacao-e-calendarios, 5.3 item 1; SF-248): the unique index of
// (kind, first day, sector), "no sector" counting as one value, settles two runs at once: `skipDuplicates` (ON CONFLICT
// DO NOTHING) keeps the first report and tells the other one nothing was written.

const dateOf = (day: string) => new Date(`${day}T00:00:00.000Z`);

export function createPrismaReportGenerationStore(database: PrismaClient): PeriodicReportGenerationStore {
  return {
    ...createPrismaReportCountsReader(database),
    async today() {
      const [row] = await database.$queryRaw<Array<{ now: Date }>>`SELECT now() AS "now"`;
      return zonedDayOf(row!.now);
    },
    async enabledKinds() {
      const rows = await database.periodicReportSetting.findMany({ where: { isEnabled: true }, select: { kind: true } });
      return rows.map(({ kind }) => kind);
    },
    async activeSectorIds() {
      const rows = await database.sector.findMany({ where: { isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true } });
      return rows.map(({ id }) => id);
    },
    async existingScopes(kind, period) {
      const rows = await database.periodicReport.findMany({ where: { kind, periodStart: dateOf(period.firstDay) }, select: { sectorId: true } });
      return rows.map(({ sectorId }) => sectorId);
    },
    async insert(report) {
      const { count } = await database.periodicReport.createMany({
        data: [
          {
            kind: report.kind,
            periodStart: dateOf(report.period.firstDay),
            periodEnd: dateOf(report.period.lastDay),
            sectorId: report.sectorId,
            generatedAt: new Date(),
            metrics: report.metrics as unknown as Prisma.InputJsonValue,
          },
        ],
        skipDuplicates: true,
      });
      return count === 1;
    },
  };
}
