import { requireCurrentActor } from "@/server/authorization";
import {
  ANNOUNCEMENT_HISTORY_DAYS,
  announcementHistory,
  isShownAt,
  maintenancePhase,
  type AnnouncementRecord,
  type AnnouncementViewer,
} from "../domain/announcement";

// The page "Avisos" (SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 4; SF-239): the announcements of the
// signed-in person's audience whose strip has started, shown now or ended in the last 90 days; the dismissed ones
// stay. The instant is the database's.

export type AnnouncementHistoryState = "current" | "maintenance_scheduled" | "maintenance_in_progress" | "ended";

export interface AnnouncementHistoryItem extends AnnouncementRecord {
  state: AnnouncementHistoryState;
}

export interface AnnouncementHistoryReader {
  now(): Promise<Date>;
  /** The announcements of the audience not ended before `endedSince` and starting (with the longest lead) by `now`. */
  list(viewer: AnnouncementViewer, endedSince: Date, now: Date): Promise<AnnouncementRecord[]>;
}

const DAY_MS = 86_400_000;

function stateOf(announcement: AnnouncementRecord, now: Date): AnnouncementHistoryState {
  if (!isShownAt(announcement, now)) return "ended";
  const phase = maintenancePhase(announcement, now);
  if (phase === "scheduled") return "maintenance_scheduled";
  if (phase === "in_progress") return "maintenance_in_progress";
  return "current";
}

export async function getAnnouncementHistory(reader: AnnouncementHistoryReader): Promise<AnnouncementHistoryItem[]> {
  const actor = await requireCurrentActor();
  const viewer: AnnouncementViewer = { id: actor.id, role: actor.role, sectorId: actor.sectorId };
  const now = await reader.now();
  const rows = await reader.list(viewer, new Date(now.getTime() - ANNOUNCEMENT_HISTORY_DAYS * DAY_MS), now);
  return announcementHistory(rows, viewer, now).map((announcement) => ({ ...announcement, state: stateOf(announcement, now) }));
}
