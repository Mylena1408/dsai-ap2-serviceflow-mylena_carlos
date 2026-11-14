import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import {
  ANNOUNCEMENT_KIND_LABELS,
  ANNOUNCEMENT_LEVEL_LABELS,
  formatAnnouncementInstant,
  getAnnouncementHistory,
  type AnnouncementHistoryItem,
  type AnnouncementHistoryState,
} from "@/modules/announcements";

// The page "Avisos" and its link (SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 4; SF-239).

export const ANNOUNCEMENTS_PATH = "/announcements";

const STATE_LABELS: Record<AnnouncementHistoryState, string> = {
  current: "Em vigor",
  maintenance_scheduled: "Manutenção programada",
  maintenance_in_progress: "Manutenção em andamento",
  ended: "Encerrado",
};

export function historyKind(item: Pick<AnnouncementHistoryItem, "kind" | "level">): string {
  return item.kind === "MAINTENANCE" ? ANNOUNCEMENT_KIND_LABELS.MAINTENANCE : `${ANNOUNCEMENT_KIND_LABELS.NOTICE} · ${ANNOUNCEMENT_LEVEL_LABELS[item.level]}`;
}

export function AnnouncementHistoryList({ items }: { items: readonly AnnouncementHistoryItem[] }) {
  if (items.length === 0) {
    return <p className="empty-state">Nenhum aviso em vigor nem encerrado nos últimos 90 dias.</p>;
  }
  return (
    <ul className="content-list announcement-history">
      {items.map((item) => (
        <li key={item.id}>
          <article aria-label={item.title}>
            <p className="metadata">
              {historyKind(item)} · <strong>{STATE_LABELS[item.state]}</strong>
            </p>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
            <p className="metadata">
              {item.kind === "MAINTENANCE" ? "Janela" : "Período"}: de {formatAnnouncementInstant(item.startsAt)} a {formatAnnouncementInstant(item.endsAt)}
            </p>
          </article>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Avisos" in an area's navigation, only for a person who has some announcement on the page: without
 * announcements, the screens do not change (CA-AVI-01). Never breaks the page.
 */
export async function AnnouncementsLink() {
  let count = 0;
  try {
    count = (await getAnnouncementHistory()).length;
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
  return count > 0 ? <Link href={ANNOUNCEMENTS_PATH}>Avisos</Link> : null;
}
