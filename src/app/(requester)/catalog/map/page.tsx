import Link from "next/link";
import { getServiceMap } from "@/modules/service-map";
import { ServiceMapView } from "@/app/_components/service-map";
import { requireRequesterPageAccess } from "../../page-access";

// SPEC 2026-11-15-mapa-de-servicos (SF-274; decision M1): the requester's map of services, read from the published
// configuration on each visit, so it follows the catalog without anyone keeping it.
export default async function ServiceMapPage() {
  await requireRequesterPageAccess();
  const map = await getServiceMap();

  return (
    <main className="page-shell" id="conteudo" tabIndex={-1}>
      <header className="page-header">
        <div>
          <p className="eyebrow">Onde pedir</p>
          <h1>Mapa de serviços</h1>
          <p>
            Veja quais setores atendem, como os serviços se ligam e o que você resolve sozinho, o que precisa de
            atendimento e o que passa por mais de um processo.
          </p>
        </div>
        <nav className="page-nav" aria-label="Navegação do mapa">
          <Link href="/catalog">Catálogo</Link>
          <Link href="/requests">Minhas solicitações</Link>
        </nav>
      </header>
      <ServiceMapView map={map} />
    </main>
  );
}
