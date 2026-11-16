import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { SignOutButton } from "@/modules/auth";
import { STAFF_GUIDE_TITLE, type GuideViewer } from "@/modules/help";
import { getCatalogReaderKind } from "@/modules/services";
import { getCurrentUser } from "@/server/auth";
import { StaffGuideContent } from "@/app/_components/staff-guide";

// The quick guide of professors and technicians (SPEC 2026-11-16-professores-e-tecnicos, part B; SF-293): open to everyone, like the help page. Only
// the profile and, for a requester, the kind are read (G3); the way back is the help page.

async function settled<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    unstable_rethrow(error);
    return fallback;
  }
}

async function currentViewer(): Promise<GuideViewer> {
  const role = await settled(async () => (await getCurrentUser())?.role ?? null, null);
  if (role !== "REQUESTER") return { role };
  return { role, requesterKind: await settled(() => getCatalogReaderKind(), null) };
}

export default async function StaffGuidePage() {
  const viewer = await currentViewer();

  return (
    <>
      <header className="app-topbar account-topbar">
        <Link className="brand-link" href="/help">
          <span aria-hidden="true" className="brand-mark">S</span>
          ServiceFlow
        </Link>
        <nav aria-label="Navegação principal">
          <Link href="/help">Voltar à Ajuda</Link>
        </nav>
        {viewer.role ? <SignOutButton /> : null}
      </header>
      <main className="page-shell student-guide staff-guide" id="conteudo" tabIndex={-1}>
        <header className="page-header">
          <div>
            <p className="eyebrow">Ajuda · Professores e técnicos</p>
            <h1>{STAFF_GUIDE_TITLE}</h1>
            <p>Como pedir serviços, reservar salas e laboratórios e pedir a alocação de provas pelo ServiceFlow.</p>
          </div>
        </header>
        <StaffGuideContent viewer={viewer} />
      </main>
    </>
  );
}
