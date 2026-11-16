-- SPEC 2026-11-16-professores-e-tecnicos, parts C to E (SF-287; decisions P5, P7 to P11, P13 and P14): spaces
-- (classrooms, laboratories, auditoriums), their reservations and the exam allocations. Additive: new tables, two new
-- nullable columns in the notices and a new audited kind of record; nothing that exists changes.
--
-- The rule that two pending or confirmed reservations of a space never overlap (P11) is kept by the database with an
-- exclusion constraint over the time range, which needs the btree_gist extension for the equality on the space.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "public"."SpaceKind" AS ENUM ('CLASSROOM', 'LABORATORY', 'AUDITORIUM', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."SpaceConfirmation" AS ENUM ('AUTOMATIC', 'SECTOR');

-- CreateEnum
CREATE TYPE "public"."ReservationPurpose" AS ENUM ('CLASS', 'LAB_USE', 'MEETING', 'EVENT', 'EXAM', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REFUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ExamRequestStatus" AS ENUM ('PENDING', 'ALLOCATED', 'REFUSED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "public"."AuditEntityType" ADD VALUE 'SPACE';

-- AlterTable
ALTER TABLE "public"."RequestNotification" ADD COLUMN     "examRequestId" UUID,
ADD COLUMN     "reservationId" UUID;

-- CreateTable
CREATE TABLE "public"."Space" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "public"."SpaceKind" NOT NULL,
    "sectorId" UUID NOT NULL,
    "capacity" INTEGER NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "resources" TEXT NOT NULL DEFAULT '',
    "confirmation" "public"."SpaceConfirmation" NOT NULL DEFAULT 'SECTOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SpaceReservation" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "purpose" "public"."ReservationPurpose" NOT NULL,
    "description" TEXT NOT NULL,
    "attendees" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "status" "public"."ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "seriesId" UUID,
    "examRequestId" UUID,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ,
    "decisionNote" TEXT,
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMPTZ,
    "cancelNote" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExamRequest" (
    "id" UUID NOT NULL,
    "professorId" UUID NOT NULL,
    "sectorId" UUID NOT NULL,
    "course" TEXT NOT NULL,
    "classGroup" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "students" INTEGER NOT NULL,
    "spaceKind" "public"."SpaceKind" NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "public"."ExamRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ,
    "refusalNote" TEXT,
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMPTZ,
    "cancelNote" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Space_isActive_kind_idx" ON "public"."Space"("isActive", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Space_sectorId_name_key" ON "public"."Space"("sectorId", "name");

-- CreateIndex
CREATE INDEX "SpaceReservation_spaceId_startsAt_idx" ON "public"."SpaceReservation"("spaceId", "startsAt");

-- CreateIndex
CREATE INDEX "SpaceReservation_requesterId_startsAt_idx" ON "public"."SpaceReservation"("requesterId", "startsAt");

-- CreateIndex
CREATE INDEX "SpaceReservation_status_startsAt_idx" ON "public"."SpaceReservation"("status", "startsAt");

-- CreateIndex
CREATE INDEX "SpaceReservation_seriesId_idx" ON "public"."SpaceReservation"("seriesId");

-- CreateIndex
CREATE INDEX "SpaceReservation_examRequestId_idx" ON "public"."SpaceReservation"("examRequestId");

-- CreateIndex
CREATE INDEX "ExamRequest_sectorId_status_startsAt_idx" ON "public"."ExamRequest"("sectorId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "ExamRequest_professorId_startsAt_idx" ON "public"."ExamRequest"("professorId", "startsAt");

-- CreateIndex
CREATE INDEX "RequestNotification_reservationId_idx" ON "public"."RequestNotification"("reservationId");

-- CreateIndex
CREATE INDEX "RequestNotification_examRequestId_idx" ON "public"."RequestNotification"("examRequestId");

-- AddForeignKey
ALTER TABLE "public"."RequestNotification" ADD CONSTRAINT "RequestNotification_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "public"."SpaceReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RequestNotification" ADD CONSTRAINT "RequestNotification_examRequestId_fkey" FOREIGN KEY ("examRequestId") REFERENCES "public"."ExamRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Space" ADD CONSTRAINT "Space_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "public"."Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SpaceReservation" ADD CONSTRAINT "SpaceReservation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SpaceReservation" ADD CONSTRAINT "SpaceReservation_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SpaceReservation" ADD CONSTRAINT "SpaceReservation_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SpaceReservation" ADD CONSTRAINT "SpaceReservation_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SpaceReservation" ADD CONSTRAINT "SpaceReservation_examRequestId_fkey" FOREIGN KEY ("examRequestId") REFERENCES "public"."ExamRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamRequest" ADD CONSTRAINT "ExamRequest_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamRequest" ADD CONSTRAINT "ExamRequest_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "public"."Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamRequest" ADD CONSTRAINT "ExamRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamRequest" ADD CONSTRAINT "ExamRequest_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rule 6.2.1: a space holds 1 to 1,000 people and has a name.
ALTER TABLE "public"."Space" ADD CONSTRAINT "Space_capacity_check" CHECK ("capacity" BETWEEN 1 AND 1000);
ALTER TABLE "public"."Space" ADD CONSTRAINT "Space_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 120);

-- P7: a reservation ends after it starts and has at least one person.
ALTER TABLE "public"."SpaceReservation" ADD CONSTRAINT "SpaceReservation_period_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "public"."SpaceReservation" ADD CONSTRAINT "SpaceReservation_attendees_check" CHECK ("attendees" BETWEEN 1 AND 1000);

-- P10: a refused reservation has the reason; a cancelled one has who and when.
ALTER TABLE "public"."SpaceReservation" ADD CONSTRAINT "SpaceReservation_refused_check" CHECK (
    "status" <> 'REFUSED'
    OR ("decisionNote" IS NOT NULL AND length(btrim("decisionNote")) > 0 AND "decidedAt" IS NOT NULL)
);
ALTER TABLE "public"."SpaceReservation" ADD CONSTRAINT "SpaceReservation_cancelled_check" CHECK (
    "status" <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL)
);

-- P11 and rule 7.2.1: no two pending or confirmed reservations of a space at the same time, even when written at the
-- same instant by two people. Half-open ranges: a reservation may start when another one ends.
ALTER TABLE "public"."SpaceReservation" ADD CONSTRAINT "SpaceReservation_no_overlap" EXCLUDE USING gist (
    "spaceId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("status" IN ('PENDING', 'CONFIRMED'));

-- P13: an exam request ends after it starts and has 1 to 5,000 students; a refusal has the reason.
ALTER TABLE "public"."ExamRequest" ADD CONSTRAINT "ExamRequest_period_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "public"."ExamRequest" ADD CONSTRAINT "ExamRequest_students_check" CHECK ("students" BETWEEN 1 AND 5000);
ALTER TABLE "public"."ExamRequest" ADD CONSTRAINT "ExamRequest_refused_check" CHECK (
    "status" <> 'REFUSED'
    OR ("refusalNote" IS NOT NULL AND length(btrim("refusalNote")) > 0 AND "decidedAt" IS NOT NULL)
);

-- P14: a notice points to exactly one thing: a request, a report, a reservation or an exam request.
ALTER TABLE "public"."RequestNotification" DROP CONSTRAINT "RequestNotification_target_check";
ALTER TABLE "public"."RequestNotification" ADD CONSTRAINT "RequestNotification_target_check" CHECK (
    num_nonnulls("requestId", "reportId", "reservationId", "examRequestId") = 1
);
