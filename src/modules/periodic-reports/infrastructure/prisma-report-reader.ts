import type { PrismaClient } from "@prisma/client";
import type { PeriodicReportReader, PeriodicReportSummary } from "../application/read-reports";

// Reading the reports in PostgreSQL (SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 3): the newest period first; in
// the same period the organization's before the sectors', by name. The scope filter is applied by the database.

const select = {
  id: true,
  kind: true,
  periodStart: true,
  periodEnd: true,
  sectorId: true,
  generatedAt: true,
  sector: { select: { name: true } },
} as const;

const day = (value: Date) => value.toISOString().slice(0, 10);

function summaryOf(row: { id: string; kind: "WEEKLY" | "MONTHLY"; periodStart: Date; periodEnd: Date; sectorId: string | null; generatedAt: Date; sector: { name: string } | null }): PeriodicReportSummary {
  return {
    id: row.id,
    kind: row.kind,
    firstDay: day(row.periodStart),
    lastDay: day(row.periodEnd),
    sectorId: row.sectorId,
    sectorName: row.sector?.name ?? null,
    generatedAt: row.generatedAt,
  };
}

export function createPrismaPeriodicReportReader(database: PrismaClient): PeriodicReportReader {
  return {
    async list(filter, limit) {
      const rows = await database.periodicReport.findMany({
        where: filter.sectorId === undefined ? {} : { sectorId: filter.sectorId },
        // Nulls first in ascending order: the organization's report before the sectors' of the same period.
        orderBy: [{ periodStart: "desc" }, { kind: "asc" }, { sectorId: { sort: "asc", nulls: "first" } }, { id: "asc" }],
        take: limit,
        select,
      });
      const summaries = rows.map(summaryOf);
      // By the sector's name within a period, as the screens name them.
      return summaries.sort(
        (left, right) =>
          right.firstDay.localeCompare(left.firstDay) ||
          left.kind.localeCompare(right.kind) ||
          Number(left.sectorId !== null) - Number(right.sectorId !== null) ||
          (left.sectorName ?? "").localeCompare(right.sectorName ?? "", "pt-BR"),
      );
    },
    async find(reportId) {
      const row = await database.periodicReport.findUnique({ where: { id: reportId }, select: { ...select, metrics: true } });
      return row && { ...summaryOf(row), metrics: row.metrics };
    },
    sectors() {
      return database.sector.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } });
    },
  };
}
