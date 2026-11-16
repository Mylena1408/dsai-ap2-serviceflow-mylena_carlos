import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { SignOutButton } from "@/modules/auth";
import { STUDENT_GUIDE_PATH, STUDENT_GUIDE_TITLE, searchHelp, type HelpRole } from "@/modules/help";
import { getCurrentUser } from "@/server/auth";
import { HelpContent } from "@/app/_components/help";

// The page "Ajuda" (SPEC 2026-11-15-ajuda-faq; SF-271): open to everyone; without a session, the general topics;
// with one, the profile's topic first. Only the profile is read (rule 2); the way back is the person's area.

const homeByRole: Record<HelpRole, string> = { ADMIN: "/admin", REQUESTER: "/catalog", ATTENDANT: "/queue", MANAGER: "/approvals" };

type HelpPageProps = { searchParams: Promise<{ q?: string | string[] }> };

async function currentRole(): Promise<HelpRole | null> {
  try {
    return (await getCurrentUser())?.role ?? null;
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

export default async function HelpPage({ searchParams }: HelpPageProps) {
  const [role, { q }] = await Promise.all([currentRole(), searchParams]);
  const result = searchHelp(role, q);
  const home = role ? homeByRole[role] : "/";

  return (
    <>
      <header className="app-topbar account-topbar">
        <Link className="brand-link" href={home}>
          <span aria-hidden="true" className="brand-mark">S</span>
          ServiceFlow
        </Link>
        <nav aria-label="Navegação principal">
          <Link href={home}>{role ? "Voltar" : "Voltar à entrada"}</Link>
        </nav>
        {role ? <SignOutButton /> : null}
      </header>
      <main className="page-shell" id="conteudo" tabIndex={-1}>
        <header className="page-header">
          <div>
            <p className="eyebrow">Ajuda</p>
            <h1>Ajuda e perguntas frequentes</h1>
            <p>Como usar o ServiceFlow{role ? " no seu perfil" : ""}. Procure pela busca ou abra cada pergunta.</p>
            {/* SPEC 2026-11-16-guia-do-estudante, 2 item 7. */}
            <p>
              Estudante? Veja o <Link href={STUDENT_GUIDE_PATH}>{STUDENT_GUIDE_TITLE}</Link>, do primeiro acesso à avaliação.
            </p>
          </div>
        </header>
        <HelpContent result={result} />
      </main>
    </>
  );
}
