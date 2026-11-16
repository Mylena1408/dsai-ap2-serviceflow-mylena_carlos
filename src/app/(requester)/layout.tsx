import Link from "next/link";
import { SignOutButton } from "@/modules/auth";
import { NotificationsLink } from "@/app/_components/notifications";
import { CollapsibleNav } from "@/app/_components/collapsible-nav";
import { AnnouncementStrip } from "@/app/_components/announcement-strip";
import { AnnouncementsLink } from "@/app/_components/announcement-history";
import type { ReactNode } from "react";

export default function RequesterLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      {/* SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 2: the area's layout is rendered when the person enters it. */}
      <AnnouncementStrip />
      <header className="app-topbar">
        <Link className="brand-link" href="/catalog">
          <span className="brand-mark" aria-hidden="true">S</span>
          ServiceFlow
        </Link>
        {/* SPEC 2026-11-15-acessibilidade, 4.1 item 1: behind the "Menu" button below 760 px. */}
        <CollapsibleNav label="Navegação principal">
          <Link href="/catalog">Catálogo</Link>
          {/* SPEC 2026-11-15-mapa-de-servicos, decision M1. */}
          <Link href="/catalog/map">Mapa de serviços</Link>
          <Link href="/requests">Minhas solicitações</Link>
          <NotificationsLink href="/notifications" />
          {/* SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 4: only with announcements. */}
          <AnnouncementsLink />
          {/* SPEC 2026-11-15-ajuda-faq, 2 item 4. */}
          <Link href="/help">Ajuda</Link>
          <Link href="/account/data">Meus dados</Link>
          <Link href="/account/api-tokens">Acesso à API</Link>
          <Link href="/account/password">Alterar senha</Link>
        </CollapsibleNav>
        <SignOutButton />
      </header>
      {children}
    </>
  );
}
