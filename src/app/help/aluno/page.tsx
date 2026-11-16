import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { SignOutButton } from "@/modules/auth";
import { STUDENT_GUIDE_TITLE, type GuideViewer } from "@/modules/help";
import { getCatalogReaderKind } from "@/modules/services";
import { getCurrentUser } from "@/server/auth";
import { StudentGuideContent } from "@/app/_components/student-guide";

// The student's quick guide (SPEC 2026-11-16-guia-do-estudante; SF-282): open to everyone, like the help page. Only
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

export default async function StudentGuidePage() {
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
      <main className="page-shell student-guide" id="conteudo" tabIndex={-1}>
        <header className="page-header">
          <div>
            <p className="eyebrow">Ajuda · Estudantes</p>
            <h1>{STUDENT_GUIDE_TITLE}</h1>
            <p>Como pedir um serviço à sua instituição pelo ServiceFlow, do primeiro acesso à avaliação.</p>
          </div>
        </header>
        <StudentGuideContent viewer={viewer} />
      </main>
    </>
  );
}
