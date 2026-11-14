import type { PrismaClient } from "@prisma/client";
import type { AnnouncementHistoryReader } from "../application/announcement-history";
import { MAX_LEAD_HOURS, type AnnouncementRecord } from "../domain/announcement";
import { announcementColumns } from "./prisma-announcement-admin";
import { audienceWhere } from "./prisma-announcement-strip";

// The page "Avisos" in PostgreSQL (SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 4): the database narrows by
// the audience, the 90 days and a start no later than the longest lead; the rules in the domain decide.

export function createPrismaAnnouncementHistoryReader(database: PrismaClient): AnnouncementHistoryReader {
  return {
    async now() {
      const [row] = await database.$queryRaw<Array<{ now: Date }>>`SELECT now() AS "now"`;
      return row!.now;
    },
    async list(viewer, endedSince, now) {
      const latestStart = new Date(now.getTime() + MAX_LEAD_HOURS * 3_600_000);
      const rows = await database.announcement.findMany({
        where: { AND: [audienceWhere(viewer), { endsAt: { gt: endedSince } }, { startsAt: { lte: latestStart } }] },
        select: announcementColumns,
      });
      return rows as AnnouncementRecord[];
    },
  };
}
