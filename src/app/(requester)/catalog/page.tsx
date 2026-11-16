import Link from "next/link";
import { getCatalogReaderKind, groupPublishedServices, listPublishedServices } from "@/modules/services";
import { CATALOG_SECTION_TITLES, type RequesterKind } from "@/shared/requester-kinds";
import { listCatalogBundles } from "@/modules/service-bundles";
import { STAFF_GUIDE_PATH, STAFF_GUIDE_TITLE, STUDENT_GUIDE_PATH, STUDENT_GUIDE_TITLE } from "@/modules/help";
import { requireRequesterPageAccess } from "../page-access";

// SPEC 2026-11-16-tipos-de-solicitante, 4.2 item 1, and professores e técnicos, part A item 3.
const CATALOG_AUDIENCE_PHRASES: Record<RequesterKind, string> = {
  STUDENT: "aos alunos",
  PROFESSOR: "aos professores",
  TECHNICIAN: "aos técnicos-administrativos",
  PUBLIC: "ao público geral",
};

export default async function CatalogPage() {
  await requireRequesterPageAccess();
  const services = await listPublishedServices();
  const categories = groupPublishedServices(services);
  // SPEC 2026-11-07-operacao-e-automacao, 3.3 item 2 (decision H20): only bundles that can be opened.
  const bundles = await listCatalogBundles();
  // SPEC 2026-11-16-tipos-de-solicitante, 4.2 item 1: the subsection of the person's kind.
  const kind = await getCatalogReaderKind();

  return (
    <main className="page-shell" id="conteudo" tabIndex={-1}>
      <header className="page-header">
        <div>
          <p className="eyebrow">Descubra os serviços</p>
        <h1>Catálogo de serviços</h1>
        <p>Escolha um serviço para consultar os detalhes e abrir uma solicitação.</p>
        </div>
        <nav className="page-nav" aria-label="Navegação do solicitante">
          <Link href="/requests">Minhas solicitações</Link>
          {/* SPEC 2026-11-15-mapa-de-servicos, section 3 item 5. */}
          <Link href="/catalog/map">Mapa de serviços</Link>
        </nav>
      </header>
      <section aria-labelledby="catalog-audience" className="audience-note">
        <h2 id="catalog-audience">{CATALOG_SECTION_TITLES[kind]}</h2>
        <p>
          Você vê os serviços oferecidos {CATALOG_AUDIENCE_PHRASES[kind]} e os que valem para todos.
        </p>
        {/* SPEC 2026-11-16-guia-do-estudante, 2 item 7: the guide for the students. */}
        {kind === "STUDENT" ? (
          <p>
            <Link href={STUDENT_GUIDE_PATH}>{STUDENT_GUIDE_TITLE}</Link>: como pedir, acompanhar e avaliar um serviço.
          </p>
        ) : null}
        {/* SPEC 2026-11-16-professores-e-tecnicos, part B item 3 and P9: the guide and the spaces for professors and technicians. */}
        {kind === "PROFESSOR" || kind === "TECHNICIAN" ? (
          <p>
            <Link href={STAFF_GUIDE_PATH}>{STAFF_GUIDE_TITLE}</Link>: serviços, reserva de <Link href="/spaces">espaços</Link>
            {kind === "PROFESSOR" ? <> e <Link href="/spaces/exams">alocação de provas</Link></> : null}.
          </p>
        ) : null}
      </section>
      {bundles.length > 0 ? (
        <section className="content-section" aria-labelledby="catalog-bundles">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Vários serviços de uma vez</p>
              <h2 id="catalog-bundles">Pacotes</h2>
            </div>
          </div>
          <ul className="service-grid">
            {bundles.map((bundle) => (
              <li className="service-card" key={bundle.id}>
                <h3>
                  <Link href={`/catalog/bundles/${bundle.id}`}>{bundle.name}</Link>
                </h3>
                {bundle.description ? <p>{bundle.description}</p> : null}
                <p className="metadata">{bundle.services.map(({ name }) => name).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {categories.size === 0 ? (
        <p className="empty-state">Nenhum serviço está disponível no momento.</p>
      ) : (
        [...categories].map(([categoryName, categoryServices]) => (
          <section className="content-section" key={categoryName} aria-labelledby={`category-${categoryName}`}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Categoria</p>
                <h2 id={`category-${categoryName}`}>{categoryName}</h2>
              </div>
            </div>
            <ul className="service-grid">
              {categoryServices.map((service) => (
                <li className="service-card" key={service.id}>
                  <h3>
                    <Link href={`/catalog/${service.id}`}>{service.name}</Link>
                  </h3>
                  <p>{service.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
