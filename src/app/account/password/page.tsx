import Link from "next/link";
import { AnnouncementStrip } from "@/app/_components/announcement-strip";
import { redirect } from "next/navigation";
import { ChangePasswordForm, SignOutButton } from "@/modules/auth";
import { requireCurrentActor } from "@/server/authorization";
import { AuthenticationError } from "@/server/errors";
import type { AuthorizationActor } from "@/server/authorization";
import { changeOwnPasswordAction } from "./actions";

const homeByRole = {
  ADMIN: "/admin",
  REQUESTER: "/catalog",
  ATTENDANT: "/queue",
  // SPEC 2026-11-01-aprovacoes, 5.1: the manager area (SF-082).
  MANAGER: "/approvals",
} as const;

export default async function ChangePasswordPage() {
  let actor: AuthorizationActor;
  try {
    actor = await requireCurrentActor();
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/");
    throw error;
  }

  return (
    <>
      {/* SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 2: rendered with the page, so it is fresh on each visit. */}
      <AnnouncementStrip />
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
      <main className="page-shell" id="conteudo" tabIndex={-1}>
        <section aria-labelledby="password-title" className="account-card">
          <p className="eyebrow">Segurança da conta</p>
          <h1 id="password-title">Alterar senha</h1>
          <p>Confirme sua senha atual para definir uma nova senha com pelo menos 12 caracteres.</p>
          <ChangePasswordForm action={changeOwnPasswordAction} cancelHref={homeByRole[actor.role]} />
        </section>
      </main>
    </>
  );
}
