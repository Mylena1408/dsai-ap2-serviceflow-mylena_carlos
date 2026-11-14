import type { Prisma, PrismaClient } from "@prisma/client";
import { createPrismaAuditScope } from "@/modules/audit";
import { runSerializableTransaction } from "@/server/db/serializable-transaction";
import type { UserImportStore, UserImportTransaction } from "../application/apply-import";
import { createPrismaUserImportReader } from "./prisma-user-import";

// Applying an import in PostgreSQL (SPEC 2026-11-09-comunicacao-e-calendarios, 4.3 items 3 and 4): one serializable
// transaction; an e-mail created by someone else meanwhile (unique index, or a serialization failure) refuses the
// whole import and nothing is written. Up to 500 people, each with its audit entry: the limit is raised to 60 s.

const APPLY_TIMEOUT_MS = 60_000;

function transactionOf(client: Prisma.TransactionClient): UserImportTransaction {
  return {
    ...createPrismaAuditScope(client),
    ...createPrismaUserImportReader(client),
    createUser(person) {
      return client.user.create({ data: person, select: { id: true } });
    },
    recordImport(record) {
      return client.userImport.create({ data: { ...record, report: record.report as unknown as Prisma.InputJsonValue }, select: { id: true } });
    },
  };
}

export function createPrismaUserImportStore(database: PrismaClient): UserImportStore {
  return {
    run(work) {
      return runSerializableTransaction(database, (client) => work(transactionOf(client)), {
        translate: ["P2002", "P2003", "P2034"],
        fallbackMessage: "User import failed.",
      }, { timeoutMs: APPLY_TIMEOUT_MS });
    },
  };
}
