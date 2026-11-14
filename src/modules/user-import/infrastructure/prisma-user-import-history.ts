import type { PrismaClient } from "@prisma/client";
import type { UserImportHistoryReader } from "../application/import-history";
import type { ImportReportEntry } from "../domain/user-import";

// The history in PostgreSQL (SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 4): the author by their name of today.

export function createPrismaUserImportHistoryReader(database: PrismaClient): UserImportHistoryReader {
  return {
    async list(limit) {
      const rows = await database.userImport.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: { id: true, createdAt: true, createdCount: true, skippedCount: true, errorCount: true, actor: { select: { name: true } } },
      });
      return rows.map(({ actor, ...row }) => ({ ...row, actorName: actor.name }));
    },
    async report(importId) {
      const row = await database.userImport.findUnique({ where: { id: importId }, select: { createdAt: true, report: true } });
      return row && { createdAt: row.createdAt, report: row.report as unknown as ImportReportEntry[] };
    },
  };
}
