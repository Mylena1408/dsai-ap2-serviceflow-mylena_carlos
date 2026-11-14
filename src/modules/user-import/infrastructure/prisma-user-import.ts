import type { Prisma, PrismaClient } from "@prisma/client";
import type { UserImportReader } from "../application/preview-import";

// The import's reading in PostgreSQL (SPEC 2026-11-09-comunicacao-e-calendarios, 4.3 item 2): the e-mail column is
// citext, so `in` already ignores case; the sectors are the active ones.

/** Reads with the client or inside a transaction (the application evaluates again in its own). */
export function createPrismaUserImportReader(database: PrismaClient | Prisma.TransactionClient): UserImportReader {
  return {
    async existingEmails(emails) {
      const rows = await database.user.findMany({ where: { email: { in: [...emails] } }, select: { email: true } });
      return rows.map(({ email }) => email);
    },
    activeSectors() {
      return database.sector.findMany({ where: { isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } });
    },
  };
}
