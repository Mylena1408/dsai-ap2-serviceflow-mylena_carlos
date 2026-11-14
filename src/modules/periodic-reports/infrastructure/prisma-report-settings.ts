import type { Prisma, PrismaClient } from "@prisma/client";
import { createPrismaAuditScope } from "@/modules/audit";
import { runSerializableTransaction } from "@/server/db/serializable-transaction";
import type { PeriodicReportSettingsReader, PeriodicReportSettingsStore, PeriodicReportSettingsTransaction } from "../application/report-settings";

// The activation in PostgreSQL (SPEC 2026-11-09-comunicacao-e-calendarios, 5.3 item 3; SF-251): one row per kind (the
// unique kind settles two first choices at once: the second one is a conflict, translated to the usual message).

export function createPrismaReportSettingsReader(database: PrismaClient): PeriodicReportSettingsReader {
  return {
    settings() {
      return database.periodicReportSetting.findMany({ orderBy: { kind: "asc" }, select: { kind: true, isEnabled: true } });
    },
  };
}

function transactionOf(client: Prisma.TransactionClient): PeriodicReportSettingsTransaction {
  return {
    ...createPrismaAuditScope(client),
    find(kind) {
      return client.periodicReportSetting.findUnique({ where: { kind }, select: { id: true, isEnabled: true } });
    },
    create(data) {
      return client.periodicReportSetting.create({ data: { ...data, updatedAt: new Date() }, select: { id: true } });
    },
    update(id, data) {
      return client.periodicReportSetting.update({ where: { id }, data: { ...data, updatedAt: new Date() }, select: { id: true } });
    },
  };
}

export function createPrismaReportSettingsStore(database: PrismaClient): PeriodicReportSettingsStore {
  return {
    run(work) {
      return runSerializableTransaction(database, (client) => work(transactionOf(client)), {
        translate: ["P2002", "P2034"],
        fallbackMessage: "Periodic report setting change failed.",
      });
    },
  };
}
