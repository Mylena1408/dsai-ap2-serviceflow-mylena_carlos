-- SPEC 2026-11-16-tipos-de-solicitante (SF-276; decisions T1 and T4 to T6): the kind of a requester (student, internal;
-- general public, external), who each service is offered to, and the kind kept in each request. Additive: the
-- requesters before the change become students and the services before it are for both, so nothing changes for them.

-- CreateEnum
CREATE TYPE "public"."RequesterKind" AS ENUM ('STUDENT', 'PUBLIC');

-- CreateEnum
CREATE TYPE "public"."ServiceAudience" AS ENUM ('STUDENTS', 'PUBLIC', 'BOTH');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "requesterKind" "public"."RequesterKind";

-- AlterTable (decision T5)
ALTER TABLE "public"."Service" ADD COLUMN     "audience" "public"."ServiceAudience" NOT NULL DEFAULT 'BOTH';

-- AlterTable (decision T6: the requests before the change were opened by students)
ALTER TABLE "public"."Request" ADD COLUMN     "requesterKindSnapshot" "public"."RequesterKind" NOT NULL DEFAULT 'STUDENT';

-- Decision T4 and section 4.1 item 1: a requester saved without a kind is a student; a person whose role is no longer
-- requester has no kind. The application sends the kind; the trigger keeps the rule for every other writer.
CREATE FUNCTION "public"."user_requester_kind"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."role" = 'REQUESTER' THEN
    IF NEW."requesterKind" IS NULL THEN
      NEW."requesterKind" := 'STUDENT';
    END IF;
  ELSE
    NEW."requesterKind" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "User_requesterKind_sync"
BEFORE INSERT OR UPDATE OF "role", "requesterKind"
ON "public"."User"
FOR EACH ROW EXECUTE FUNCTION "public"."user_requester_kind"();

-- The requesters before the change (decision T4).
UPDATE "public"."User" SET "requesterKind" = 'STUDENT' WHERE "role" = 'REQUESTER';

-- Rule 3: every requester has a kind and the other roles have none.
ALTER TABLE "public"."User" ADD CONSTRAINT "User_requesterKind_role_check" CHECK (
  ("role" = 'REQUESTER' AND "requesterKind" IS NOT NULL)
  OR ("role" <> 'REQUESTER' AND "requesterKind" IS NULL)
);

-- Rule 4 (decision T6): a new request keeps the kind its requester has when it is opened, whatever path opens it
-- (screen, API, recurring schedule, bundle); later changes of the person do not touch it.
CREATE FUNCTION "public"."request_requester_kind_snapshot"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  kind "public"."RequesterKind";
BEGIN
  SELECT "requesterKind" INTO kind FROM "public"."User" WHERE "id" = NEW."requesterId";
  IF kind IS NOT NULL THEN
    NEW."requesterKindSnapshot" := kind;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Request_requesterKindSnapshot_on_insert"
BEFORE INSERT
ON "public"."Request"
FOR EACH ROW EXECUTE FUNCTION "public"."request_requester_kind_snapshot"();

-- Section 4.3 item 2: the queue filters by the kind.
CREATE INDEX "Request_sectorId_requesterKindSnapshot_idx" ON "public"."Request"("sectorId", "requesterKindSnapshot");
