import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/modules/auth";
import { getAnnouncementHistory, type AnnouncementHistoryItem } from "@/modules/announcements";
import { AuthenticationError } from "@/server/errors";
import { AnnouncementHistoryList } from "@/app/_components/announcement-history";
import { requireCurrentActor, type AuthorizationActor } from "@/server/authorization";

// The page "Avisos" (SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 4; SF-239): every profile, only the
// announcements of their own audience; the header of the account pages.

const homeByRole = {
  ADMIN: "/admin",
  REQUESTER: "/catalog",
  ATTENDANT: "/queue",
  MANAGER: "/approvals",
} as const;

export default async function AnnouncementsPage() {
  let actor: AuthorizationActor;
  let items: AnnouncementHistoryItem[];
  try {
    actor = await requireCurrentActor();
    items = await getAnnouncementHistory();
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/");
    throw error;
  }

  return (
    <>
      <header className="app-topbar account-topbar">
        <Link className="brand-link" href={homeByRole[actor.role]}>
          <span aria-hidden="true" className="brand-mark">S</span>
          ServiceFlow
        </Link>
        <nav aria-label="Navegação principal">
          <Link href={homeByRole[actor.role]}>Voltar</Link>
        </nav>
        <SignOutButton />
      </header>
      <main className="page-shell">
        <header className="page-header">
          <div>
            <p className="eyebrow">Comunicados</p>
            <h1>Avisos</h1>
            <p>Os avisos em vigor e os encerrados nos últimos 90 dias. Os que você dispensou continuam aqui.</p>
          </div>
        </header>
        <AnnouncementHistoryList items={items} />
      </main>
    </>
  );
}
