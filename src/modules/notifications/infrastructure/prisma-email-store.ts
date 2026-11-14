import type { PrismaClient } from "@prisma/client";
import type { NotificationType } from "../domain/recipients";
import type { EmailDeliveryLog, EmailDeliveryStore } from "../application/ports";
import { periodicReportMetricsSchema } from "@/modules/periodic-reports";
import { REPORT_OF_NOTICE, noticeSubject, ruleNamesOf, stageNamesOf } from "./prisma-notification-store";

/** SPEC 2026-11-09-comunicacao-e-calendarios, 5.3 item 4: only the main numbers go to the email. */
function reportNumbers(report: { id: string; sectorId: string | null; metrics: unknown }) {
  const metrics = periodicReportMetricsSchema.parse(report.metrics);
  return {
    id: report.id,
    sectorId: report.sectorId,
    opened: metrics.opened,
    completed: metrics.completed,
    cancelled: metrics.cancelled,
    onTimePercentage: metrics.onTimePercentage,
  };
}

export function createPrismaEmailStore(database: PrismaClient): EmailDeliveryStore {
  return {
    async claimPending(limit, leaseMs) {
      // Same reservation as the outbox: lock due rows (skipping rows another run holds) and push
      // their availableAt forward, so they stay reserved after commit.
      const { ids, now } = await database.$transaction(async (transaction) => {
        const [{ now }] = await transaction.$queryRaw<Array<{ now: Date }>>`SELECT now() AS "now"`;
        const rows = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "EmailDelivery"
          WHERE "status" = 'PENDING' AND "availableAt" <= ${now}
          ORDER BY "createdAt", "id"
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        `;
        const ids = rows.map(({ id }) => id);

        if (ids.length > 0) {
          await transaction.emailDelivery.updateMany({
            where: { id: { in: ids } },
            data: { availableAt: new Date(now.getTime() + leaseMs) },
          });
        }
        return { ids, now };
      });

      if (ids.length === 0) {
        return { deliveries: [], now };
      }

      const rows = await database.emailDelivery.findMany({
        where: { id: { in: ids } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          status: true,
          attempts: true,
          availableAt: true,
          sentAt: true,
          lastErrorCode: true,
          recipient: { select: { email: true, isActive: true, role: true, sectorId: true } },
          notification: {
            select: {
              type: true,
              requestId: true,
              request: { select: { serviceNameSnapshot: true } },
              report: REPORT_OF_NOTICE,
              event: { select: { payload: true } },
            },
          },
        },
      });
      const sources = rows.map(({ notification }) => notification);
      const [stageNames, ruleNames] = await Promise.all([stageNamesOf(database, sources), ruleNamesOf(database, sources)]);

      return {
        now,
        deliveries: rows.map(({ notification, ...delivery }, index) => ({
          ...delivery,
          notification: {
            type: notification.type as NotificationType,
            requestId: notification.requestId,
            serviceName: noticeSubject(notification),
            ...(stageNames[index] ? { stageName: stageNames[index] } : {}),
            ...(ruleNames[index] ? { ruleName: ruleNames[index] } : {}),
            ...(notification.report ? { report: reportNumbers(notification.report) } : {}),
          },
        })),
      };
    },
    async save(deliveryId, state) {
      await database.emailDelivery.update({
        where: { id: deliveryId },
        data: {
          status: state.status,
          attempts: state.attempts,
          availableAt: state.availableAt,
          sentAt: state.sentAt,
          lastErrorCode: state.lastErrorCode,
        },
      });
    },
  };
}

export function createPrismaEmailLog(database: PrismaClient): EmailDeliveryLog {
  return {
    async listRecent(limit) {
      const rows = await database.emailDelivery.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: {
          id: true,
          status: true,
          attempts: true,
          createdAt: true,
          sentAt: true,
          lastErrorCode: true,
          recipient: { select: { name: true, email: true } },
          notification: { select: { type: true } },
        },
      });
      return rows.map(({ recipient, notification, ...row }) => ({
        ...row,
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        type: notification.type as NotificationType,
      }));
    },
  };
}
