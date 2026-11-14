-- SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 4 and 5.3 item 4 (decision K3; SF-250): when the report of a
-- sector is generated, its managers get a notice in the application and, if they chose the new category "Relatórios",
-- an email. A notice now points to a request or to a periodic report, exactly one of the two. Additive for the existing
-- rows: every notice written so far has its request, so the constraint holds for all of them.

-- AlterEnum
ALTER TYPE "public"."NotificationCategory" ADD VALUE 'REPORTS';

-- AlterTable
ALTER TABLE "public"."RequestNotification" ADD COLUMN     "reportId" UUID,
ALTER COLUMN "requestId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RequestNotification_reportId_recipientId_key" ON "public"."RequestNotification"("reportId", "recipientId");

-- AddForeignKey
ALTER TABLE "public"."RequestNotification" ADD CONSTRAINT "RequestNotification_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."PeriodicReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A request or a report, never both and never none.
ALTER TABLE "public"."RequestNotification" ADD CONSTRAINT "RequestNotification_target_check" CHECK (("requestId" IS NULL) <> ("reportId" IS NULL));
