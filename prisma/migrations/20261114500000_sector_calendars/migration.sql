-- SPEC 2026-11-09-comunicacao-e-calendarios, part D, 6.1 and 6.3 (decisions K4, K8 and K9; SF-252): a sector may have
-- its own business hours and its own holidays; a request opened in business hours keeps which sector's calendar counted
-- its deadline. Additive only: two audit entity types, two tables, one nullable column, indexes, keys and constraints.
-- Every request already open keeps an empty column, so it stays on the organization's calendar (CA-CAL-01).

-- AlterEnum
ALTER TYPE "public"."AuditEntityType" ADD VALUE 'SECTOR_CALENDAR';
ALTER TYPE "public"."AuditEntityType" ADD VALUE 'SECTOR_HOLIDAY';

-- AlterTable
ALTER TABLE "public"."Request" ADD COLUMN     "slaCalendarSectorId" UUID;

-- CreateTable
CREATE TABLE "public"."SectorCalendar" (
    "id" UUID NOT NULL,
    "sectorId" UUID NOT NULL,
    "weekdays" INTEGER[],
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "SectorCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SectorHoliday" (
    "id" UUID NOT NULL,
    "sectorId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "yearly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,

    CONSTRAINT "SectorHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SectorCalendar_sectorId_key" ON "public"."SectorCalendar"("sectorId");

-- CreateIndex
CREATE UNIQUE INDEX "SectorHoliday_sectorId_day_key" ON "public"."SectorHoliday"("sectorId", "day");

-- AddForeignKey
ALTER TABLE "public"."Request" ADD CONSTRAINT "Request_slaCalendarSectorId_fkey" FOREIGN KEY ("slaCalendarSectorId") REFERENCES "public"."Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SectorCalendar" ADD CONSTRAINT "SectorCalendar_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "public"."Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SectorCalendar" ADD CONSTRAINT "SectorCalendar_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SectorHoliday" ADD CONSTRAINT "SectorHoliday_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "public"."Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SectorHoliday" ADD CONSTRAINT "SectorHoliday_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6.3 item 2: the same window and days as the organization's calendar (one to seven ISO weekdays, start before end,
-- inside the day). No time zone: the sector uses the organization's.
ALTER TABLE "public"."SectorCalendar"
ADD CONSTRAINT "SectorCalendar_check"
CHECK (
    "weekdays" IS NOT NULL
    AND cardinality("weekdays") BETWEEN 1 AND 7
    AND "weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]
    AND "startMinute" >= 0
    AND "startMinute" < "endMinute"
    AND "endMinute" <= 1440
);

-- 6.1 item 2: a name of 1 to 80 characters without surrounding spaces, as the organization's holidays.
ALTER TABLE "public"."SectorHoliday"
ADD CONSTRAINT "SectorHoliday_name_check"
CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 80);

-- 6.3 item 3: only a request counted in business hours names the sector of its calendar.
ALTER TABLE "public"."Request"
ADD CONSTRAINT "Request_slaCalendarSectorId_check"
CHECK ("slaCalendarSectorId" IS NULL OR "slaBusinessHours" = true);
