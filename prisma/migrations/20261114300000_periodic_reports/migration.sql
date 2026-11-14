-- SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 and 5.3 (decisions K3 and K7): the periodic reports, kept with the
-- numbers of the moment they were generated, and whether each kind is on. Additive only: a new enum, two tables,
-- indexes, keys and constraints; the audit trail gains the report setting. The notification category "Relatórios"
-- comes with the notice itself (SF-250).

-- CreateEnum
CREATE TYPE "public"."PeriodicReportKind" AS ENUM ('WEEKLY', 'MONTHLY');

-- AlterEnum
ALTER TYPE "public"."AuditEntityType" ADD VALUE 'PERIODIC_REPORT_SETTING';

-- CreateTable
CREATE TABLE "public"."PeriodicReport" (
    "id" UUID NOT NULL,
    "kind" "public"."PeriodicReportKind" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "sectorId" UUID,
    "generatedAt" TIMESTAMPTZ NOT NULL,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "PeriodicReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PeriodicReportSetting" (
    "id" UUID NOT NULL,
    "kind" "public"."PeriodicReportKind" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "PeriodicReportSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PeriodicReport_periodStart_idx" ON "public"."PeriodicReport"("periodStart");

-- CreateIndex
CREATE INDEX "PeriodicReport_sectorId_idx" ON "public"."PeriodicReport"("sectorId");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodicReportSetting_kind_key" ON "public"."PeriodicReportSetting"("kind");

-- AddForeignKey
ALTER TABLE "public"."PeriodicReport" ADD CONSTRAINT "PeriodicReport_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "public"."Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PeriodicReportSetting" ADD CONSTRAINT "PeriodicReportSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5.3 item 1: one report per (kind, first day, sector). The organization's report has no sector: NULLS NOT DISTINCT
-- (PostgreSQL 15 onward) makes "no sector" one value, so the job run twice never keeps two.
CREATE UNIQUE INDEX "PeriodicReport_kind_periodStart_sectorId_key" ON "public"."PeriodicReport"("kind", "periodStart", "sectorId") NULLS NOT DISTINCT;

-- 5.1 item 2 (decision K7): a week runs from Monday to Sunday and a month from its first to its last day; the numbers
-- are an object. The only optional column, "sectorId", is not in this CHECK.
ALTER TABLE "public"."PeriodicReport"
ADD CONSTRAINT "PeriodicReport_period_check"
CHECK (
    jsonb_typeof("metrics") = 'object'
    AND (
        (
            "kind" = 'WEEKLY'
            AND EXTRACT(ISODOW FROM "periodStart") = 1
            AND "periodEnd" = "periodStart" + 6
        )
        OR (
            "kind" = 'MONTHLY'
            AND EXTRACT(DAY FROM "periodStart") = 1
            AND "periodEnd" = ("periodStart" + interval '1 month' - interval '1 day')::date
        )
    )
);
