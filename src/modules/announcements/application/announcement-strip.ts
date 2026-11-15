import { requireCurrentActor } from "@/server/authorization";
import {
  announcementsInForce,
  canDismiss,
  maintenancePhase,
  visibleAnnouncements,
  type AnnouncementRecord,
  type AnnouncementViewer,
} from "../domain/announcement";

// The strip at the top of the screens (SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 2 and 3.3 items 2 to 4;
// SF-236): the announcements of the signed-in person's audience shown now, urgent first, at most three, without the
// information notices they dismissed. The instant is the database's.

export interface AnnouncementStripItem extends AnnouncementRecord {
  /** 3.3 item 4: only an information notice. */
  dismissible: boolean;
  /** 3.1 item 3 (SF-238): a maintenance before its window or during it, at the database's instant; null for a notice. */
  phase: "scheduled" | "in_progress" | null;
}

export interface AnnouncementStripReader {
  now(): Promise<Date>;
  /**
   * The announcements that may be shown at `now` for this audience: not ended, and starting (with the longest
   * lead) by then. The rules choose among them.
   */
  candidates(viewer: AnnouncementViewer, now: Date): Promise<AnnouncementRecord[]>;
  /** Which of these announcements the person dismissed. */
  dismissedIds(userId: string, announcementIds: readonly string[]): Promise<string[]>;
}

export async function getAnnouncementStrip(reader: AnnouncementStripReader): Promise<AnnouncementStripItem[]> {
  const actor = await requireCurrentActor();
  const viewer: AnnouncementViewer = { id: actor.id, role: actor.role, sectorId: actor.sectorId };
  const now = await reader.now();
  const candidates = await reader.candidates(viewer, now);
  if (candidates.length === 0) return [];
  const dismissed = new Set(await reader.dismissedIds(viewer.id, candidates.filter(canDismiss).map(({ id }) => id)));
  return visibleAnnouncements(candidates, viewer, now, dismissed).map((announcement) => ({
    ...announcement,
    dismissible: canDismiss(announcement),
    phase: maintenancePhase(announcement, now),
  }));
}

export interface AnnouncementInForce extends AnnouncementStripItem {
  /** Whether the person dismissed it on the screens (only an information notice can be). */
  dismissed: boolean;
}

/**
 * SPEC 2026-11-09-comunicacao-e-calendarios, 7 item 2 (SF-258): the announcements in force for the signed-in person,
 * for the public API: the strip's rules (audience, period with the lead) without its limit, each with whether they
 * dismissed it. The instant is the database's.
 */
export async function getAnnouncementsInForce(reader: AnnouncementStripReader): Promise<AnnouncementInForce[]> {
  const actor = await requireCurrentActor();
  const viewer: AnnouncementViewer = { id: actor.id, role: actor.role, sectorId: actor.sectorId };
  const now = await reader.now();
  const shown = announcementsInForce(await reader.candidates(viewer, now), viewer, now);
  if (shown.length === 0) return [];
  const dismissed = new Set(await reader.dismissedIds(viewer.id, shown.filter(canDismiss).map(({ id }) => id)));
  return shown.map((announcement) => ({
    ...announcement,
    dismissible: canDismiss(announcement),
    phase: maintenancePhase(announcement, now),
    dismissed: dismissed.has(announcement.id),
  }));
}
