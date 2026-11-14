import type { Prisma } from "@prisma/client";
import type { NotificationCategory } from "../domain/email";
import type { ReportNoticeWriter } from "../application/report-notices";

// The notices of a new report, written with the transaction that writes the report (SF-250). The unique index of
// (report, person) keeps a second write from adding a notice or an email.

export function createPrismaReportNoticeWriter(transaction: Prisma.TransactionClient): ReportNoticeWriter {
  return {
    async sectorManagerIds(sectorId) {
      const rows = await transaction.user.findMany({
        where: { sectorId, role: "MANAGER", isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      return rows.map(({ id }) => id);
    },
    async emailCategories(userIds) {
      const rows = await transaction.notificationPreference.findMany({
        where: { userId: { in: userIds }, emailEnabled: true },
        select: { userId: true, category: true },
      });
      const categories = new Map<string, Set<NotificationCategory>>();
      for (const { userId, category } of rows) categories.set(userId, (categories.get(userId) ?? new Set()).add(category));
      return categories;
    },
    async insert(notices) {
      if (notices.length === 0) return 0;
      const wantEmail = new Set(notices.filter(({ sendEmail }) => sendEmail).map(({ recipientId }) => recipientId));
      const inserted = await transaction.requestNotification.createManyAndReturn({
        data: notices.map(({ reportId, recipientId, createdAt }) => ({ reportId, recipientId, type: "report.ready", createdAt })),
        skipDuplicates: true,
        select: { id: true, recipientId: true, createdAt: true },
      });
      const deliveries = inserted
        .filter(({ recipientId }) => wantEmail.has(recipientId))
        .map(({ id, recipientId, createdAt }) => ({ notificationId: id, recipientId, availableAt: createdAt, createdAt }));
      if (deliveries.length > 0) await transaction.emailDelivery.createMany({ data: deliveries, skipDuplicates: true });
      return inserted.length;
    },
  };
}
