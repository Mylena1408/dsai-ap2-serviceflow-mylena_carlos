import { Prisma, type PrismaClient } from "@prisma/client";
import type { PeriodicReportCountsReader } from "../application/report-metrics";

// The numbers of a period in PostgreSQL (SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 1; SF-247), with the
// definitions of "Análises" (`prisma-analytics-reader`) and the time report (`prisma-time-report`): the request's current
// sector, completions with the status "Concluída", on time by `completedLate`, the median from opening to completion.

const scopeOf = (sectorId: string | null) => (sectorId ? Prisma.sql`AND r."sectorId" = ${sectorId}::uuid` : Prisma.empty);

export function createPrismaReportCountsReader(database: PrismaClient | Prisma.TransactionClient): PeriodicReportCountsReader {
  return {
    async counts(sectorId, range) {
      const scope = scopeOf(sectorId);
      const [[requests], [completion], [ratings], [time], tags] = await Promise.all([
        database.$queryRaw<Array<{ opened: number; cancelled: number }>>`
          SELECT
            (count(*) FILTER (WHERE r."createdAt" >= ${range.from} AND r."createdAt" < ${range.before}))::int AS "opened",
            (count(*) FILTER (WHERE r."status" = 'CANCELLED' AND r."cancelledAt" >= ${range.from} AND r."cancelledAt" < ${range.before}))::int AS "cancelled"
          FROM "Request" r
          WHERE ((r."createdAt" >= ${range.from} AND r."createdAt" < ${range.before})
            OR (r."cancelledAt" >= ${range.from} AND r."cancelledAt" < ${range.before})) ${scope}`,
        database.$queryRaw<Array<{ completed: number; withDueDate: number; onTime: number; medianMs: number | null }>>`
          SELECT
            count(*)::int AS "completed",
            (count(*) FILTER (WHERE r."completedLate" IS NOT NULL))::int AS "withDueDate",
            (count(*) FILTER (WHERE r."completedLate" = false))::int AS "onTime",
            percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (r."completedAt" - r."createdAt")) * 1000)::float8 AS "medianMs"
          FROM "Request" r
          WHERE r."status" = 'COMPLETED' AND r."completedAt" >= ${range.from} AND r."completedAt" < ${range.before} ${scope}`,
        database.$queryRaw<Array<{ count: number; sum: number | null }>>`
          SELECT count(*)::int AS "count", sum(s."rating")::int AS "sum"
          FROM "RequestSatisfaction" s
          JOIN "Request" r ON r."id" = s."requestId"
          WHERE s."ratedAt" >= ${range.from} AND s."ratedAt" < ${range.before} ${scope}`,
        database.$queryRaw<Array<{ minutes: number | null }>>`
          SELECT sum(e."minutes")::int AS "minutes"
          FROM "RequestTimeEntry" e
          JOIN "Request" r ON r."id" = e."requestId"
          WHERE e."deletedAt" IS NULL
            AND e."workedOn" BETWEEN ${range.firstDay}::date AND ${range.lastDay}::date ${scope}`,
        database.$queryRaw<Array<{ name: string; sectorName: string; count: number }>>`
          SELECT t."name"::text AS "name", s."name"::text AS "sectorName", count(*)::int AS "count"
          FROM "RequestTag" rt
          JOIN "Request" r ON r."id" = rt."requestId"
          JOIN "SectorTag" t ON t."id" = rt."tagId"
          JOIN "Sector" s ON s."id" = t."sectorId"
          WHERE r."createdAt" >= ${range.from} AND r."createdAt" < ${range.before} ${scope}
          GROUP BY t."id", t."name", s."name"`,
      ]);
      return {
        opened: requests?.opened ?? 0,
        cancelled: requests?.cancelled ?? 0,
        completed: completion?.completed ?? 0,
        completedWithDueDate: completion?.withDueDate ?? 0,
        completedOnTime: completion?.onTime ?? 0,
        medianResolutionMs: completion && completion.completed > 0 ? completion.medianMs : null,
        ratingCount: ratings?.count ?? 0,
        ratingSum: ratings?.sum ?? 0,
        minutesLogged: time?.minutes ?? 0,
        // The organization's report names each tag with its sector, as "Análises" does over every sector.
        tags: tags.map((tag) => ({ name: sectorId ? tag.name : `${tag.name} (${tag.sectorName})`, count: tag.count })),
      };
    },
  };
}
