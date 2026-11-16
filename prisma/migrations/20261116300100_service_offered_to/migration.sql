-- SPEC 2026-11-16-professores-e-tecnicos, part A (SF-285; decision P1): who a service is offered to becomes a list of
-- kinds. The old value is converted so that students and the general public see exactly the same services as before
-- (rule 4.2.4): "only students" -> [STUDENT]; "only general public" -> [PUBLIC]; "both" (for everyone) -> every kind.

-- AlterTable
ALTER TABLE "public"."Service" ADD COLUMN     "offeredTo" "public"."RequesterKind"[] DEFAULT ARRAY['STUDENT', 'PROFESSOR', 'TECHNICIAN', 'PUBLIC']::"public"."RequesterKind"[];

UPDATE "public"."Service"
SET "offeredTo" = CASE "audience"
  WHEN 'STUDENTS' THEN ARRAY['STUDENT']::"public"."RequesterKind"[]
  WHEN 'PUBLIC' THEN ARRAY['PUBLIC']::"public"."RequesterKind"[]
  ELSE ARRAY['STUDENT', 'PROFESSOR', 'TECHNICIAN', 'PUBLIC']::"public"."RequesterKind"[]
END;

-- Rule 4.2.2: at least one kind, and no more than the four (the application keeps them unique and in order).
ALTER TABLE "public"."Service" ADD CONSTRAINT "Service_offeredTo_check" CHECK (
    "offeredTo" IS NOT NULL
    AND cardinality("offeredTo") BETWEEN 1 AND 4
);

-- AlterTable
ALTER TABLE "public"."Service" DROP COLUMN "audience";

-- DropEnum
DROP TYPE "public"."ServiceAudience";
