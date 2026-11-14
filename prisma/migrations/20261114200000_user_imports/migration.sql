-- SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 items 3 and 4 (decision K1): each import of people from a CSV file
-- is recorded with its counts and the report of the lines left out. Additive only: a new table, its index, key and
-- constraint; the audit trail gains the import as an entity.

-- AlterEnum
ALTER TYPE "public"."AuditEntityType" ADD VALUE 'USER_IMPORT';

-- CreateTable
CREATE TABLE "public"."UserImport" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "report" JSONB NOT NULL,

    CONSTRAINT "UserImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserImport_createdAt_idx" ON "public"."UserImport"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."UserImport" ADD CONSTRAINT "UserImport_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4.3 item 1: from 1 to 500 lines in all, no count below zero; the report is a list with one entry per line left
-- out (skipped or refused). Every column is NOT NULL, so the CHECK never sees a NULL.
ALTER TABLE "public"."UserImport"
ADD CONSTRAINT "UserImport_counts_check"
CHECK (
    "createdCount" >= 0
    AND "skippedCount" >= 0
    AND "errorCount" >= 0
    AND "createdCount" + "skippedCount" + "errorCount" BETWEEN 1 AND 500
    AND jsonb_typeof("report") = 'array'
    AND jsonb_array_length("report") = "skippedCount" + "errorCount"
);
