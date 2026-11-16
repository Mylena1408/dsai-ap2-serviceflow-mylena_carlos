-- SPEC 2026-11-16-professores-e-tecnicos, part A (SF-285; decision P2): two more kinds of requester, a professor and an
-- administrative technician, in the order the screens list them. Additive: nobody has them until the administrator
-- chooses (P3). A value added to an enum is usable only after its own migration, so the list of the services that
-- uses them comes in the next one.

-- AlterEnum
ALTER TYPE "public"."RequesterKind" ADD VALUE 'PROFESSOR' BEFORE 'PUBLIC';
ALTER TYPE "public"."RequesterKind" ADD VALUE 'TECHNICIAN' BEFORE 'PUBLIC';
