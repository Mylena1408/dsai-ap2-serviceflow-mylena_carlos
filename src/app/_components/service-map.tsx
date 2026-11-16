import Link from "next/link";
import type { MapBundleEntry, MapServiceEntry, SectorLink, ServiceMap } from "@/modules/service-map";
import { CATALOG_SECTION_TITLES } from "@/shared/requester-kinds";

// SPEC 2026-11-15-mapa-de-servicos, section 3 (SF-274): the requester's map. A drawing of the sectors and the links
// between them, with the same information in text; then the three groups, in the order the person should think:
// what they solve alone, what needs attendance, what needs specialized attendance. Each service shows its way.

const WIDTH = 640;
const HEIGHT = 340;
const BOX_WIDTH = 150;
const BOX_HEIGHT = 46;

/** The drawing's height: one or two sectors fit in a single row, more go around an ellipse. */
export function drawingHeight(sectors: number): number {
  return sectors <= 2 ? 100 : HEIGHT;
}

/** The sectors around an ellipse, the first at the top, so any number of sectors fits the drawing. */
export function sectorPositions(names: readonly string[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const height = drawingHeight(names.length);
  const centerX = WIDTH / 2;
  const centerY = height / 2;
  if (names.length <= 2) {
    // One in the middle; two side by side, far enough apart for the line between them to show.
    names.forEach((name, index) => {
      positions.set(name, { x: names.length === 1 ? centerX : index === 0 ? WIDTH / 4 : (3 * WIDTH) / 4, y: centerY });
    });
    return positions;
  }
  const radiusX = WIDTH / 2 - BOX_WIDTH / 2 - 10;
  const radiusY = height / 2 - BOX_HEIGHT / 2 - 10;
  names.forEach((name, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / names.length;
    positions.set(name, { x: Math.round(centerX + radiusX * Math.cos(angle)), y: Math.round(centerY + radiusY * Math.sin(angle)) });
  });
  return positions;
}

/** A link in words, for the text beside the drawing and for the drawing's own description. */
export function linkSentence(link: SectorLink): string {
  const through = link.through.join(", ");
  return link.kind === "approval"
    ? `${link.from} aprova pedidos de ${link.to} (${through}).`
    : `O pacote ${through} junta serviços de ${link.from} e ${link.to}.`;
}

function hours(value: number | null): string | null {
  return value === null ? null : `Prazo-base: ${value} h`;
}

function samePair(a: SectorLink, b: SectorLink): boolean {
  return (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);
}

/**
 * The line of a link from the edge of one box to the edge of the other (so the arrow's head is not under a box),
 * moved sideways by `offset` when two links join the same sectors.
 */
export function linkLine(from: { x: number; y: number }, to: { x: number; y: number }, offset = 0) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const margin = 4;
  const toEdge = Math.min(
    ux === 0 ? Number.POSITIVE_INFINITY : (BOX_WIDTH / 2 + margin) / Math.abs(ux),
    uy === 0 ? Number.POSITIVE_INFINITY : (BOX_HEIGHT / 2 + margin) / Math.abs(uy),
  );
  const shiftX = -uy * offset;
  const shiftY = ux * offset;
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    x1: round(from.x + ux * toEdge + shiftX),
    y1: round(from.y + uy * toEdge + shiftY),
    x2: round(to.x - ux * toEdge + shiftX),
    y2: round(to.y - uy * toEdge + shiftY),
  };
}

function SectorDiagram({ map }: { map: ServiceMap }) {
  const positions = sectorPositions(map.sectors.map(({ name }) => name));
  return (
    <svg
      aria-labelledby="map-drawing-title map-drawing-description"
      className="map-diagram"
      role="img"
      viewBox={`0 0 ${WIDTH} ${drawingHeight(map.sectors.length)}`}
    >
      <title id="map-drawing-title">Setores que atendem e como se ligam</title>
      <desc id="map-drawing-description">
        {map.links.length > 0 ? map.links.map(linkSentence).join(" ") : "Cada setor atende sozinho os próprios serviços."}
      </desc>
      <defs>
        <marker id="map-arrow" markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="7" refY="4" viewBox="0 0 8 8">
          <path className="map-arrow-head" d="M0,0 L8,4 L0,8 z" />
        </marker>
      </defs>
      {map.links.map((link, index) => {
        const from = positions.get(link.from);
        const to = positions.get(link.to);
        if (!from || !to) return null;
        // Two links between the same sectors (an approval and a bundle) are drawn side by side.
        const pair = map.links.filter((other) => samePair(other, link));
        // The side is taken from the pair in alphabetical order, so links of opposite directions do not swap sides.
        const reversed = link.from.localeCompare(link.to, "pt-BR") > 0 ? -1 : 1;
        const offset = pair.length > 1 ? (pair.indexOf(link) === 0 ? -7 : 7) * reversed : 0;
        const line = linkLine(from, to, offset);
        return (
          <line
            className={link.kind === "approval" ? "map-link map-link-approval" : "map-link map-link-bundle"}
            key={`${link.kind}-${link.from}-${link.to}-${index}`}
            markerEnd={link.kind === "approval" ? "url(#map-arrow)" : undefined}
            {...line}
          />
        );
      })}
      {map.sectors.map(({ name, services }) => {
        const { x, y } = positions.get(name)!;
        return (
          <g className="map-sector" key={name}>
            <rect height={BOX_HEIGHT} rx="10" width={BOX_WIDTH} x={x - BOX_WIDTH / 2} y={y - BOX_HEIGHT / 2} />
            <text className="map-sector-name" textAnchor="middle" x={x} y={y - 4}>
              {name.length > 20 ? `${name.slice(0, 19)}…` : name}
            </text>
            <text className="map-sector-count" textAnchor="middle" x={x} y={y + 14}>
              {services === 1 ? "1 serviço" : `${services} serviços`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ServicePath({ entry }: { entry: MapServiceEntry }) {
  return (
    <ol aria-label={`Caminho de ${entry.service.name}`} className="map-path">
      <li className="map-step map-step-you">Você pede</li>
      {entry.steps.map((step, index) => (
        <li className={`map-step map-step-${step.kind}`} key={`${step.label}-${index}`}>
          <span className="map-step-label">
            {step.label}
            {step.conditional ? " (pode ocorrer)" : ""}
          </span>
          <span className="map-step-sector">{step.sectorName}</span>
        </li>
      ))}
      <li className="map-step map-step-done">Concluída</li>
    </ol>
  );
}

function ServiceCard({ entry }: { entry: MapServiceEntry }) {
  const { service } = entry;
  const deadline = hours(service.slaHours);
  return (
    <li className="map-card">
      <h4>{service.name}</h4>
      <p className="metadata">
        {service.categoryName} · {service.sectorName}
        {deadline ? ` · ${deadline}` : ""} · {entry.processes === 1 ? "1 processo" : `${entry.processes} processos`}
      </p>
      <p>{service.description}</p>
      {entry.reasons.length > 0 ? (
        <ul className="map-reasons">
          {entry.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <ServicePath entry={entry} />
      {service.documents.length > 0 ? (
        <p className="map-documents">
          Tenha em mãos:{" "}
          {service.documents.map(({ name, required }) => `${name}${required ? "" : " (opcional)"}`).join(", ")}.
        </p>
      ) : null}
      <p>
        <Link href={`/catalog/${service.id}`}>Ver e pedir {service.name}</Link>
      </p>
    </li>
  );
}

function BundleCard({ entry }: { entry: MapBundleEntry }) {
  return (
    <li className="map-card">
      <h4>Pacote: {entry.bundle.name}</h4>
      <p className="metadata">{entry.processes} processos, um por serviço</p>
      {entry.bundle.description ? <p>{entry.bundle.description}</p> : null}
      <ul className="map-reasons">
        {entry.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p>
        <Link href={`/catalog/bundles/${entry.bundle.id}`}>Ver e pedir o pacote {entry.bundle.name}</Link>
      </p>
    </li>
  );
}

export function ServiceMapView({ map }: { map: ServiceMap }) {
  const articles = map.selfService.articles;
  return (
    <>
      {map.requesterKind ? (
        // SPEC 2026-11-16-tipos-de-solicitante, 4.2 item 2: whose services the map shows.
        <p className="audience-note">
          <strong>{CATALOG_SECTION_TITLES[map.requesterKind]}.</strong> O mapa mostra os serviços oferecidos a você e os
          que valem para todos.
        </p>
      ) : null}
      <section aria-labelledby="map-overview" className="surface-card">
        <h2 id="map-overview">Como os setores se ligam</h2>
        <p className="section-description">
          Cada caixa é um setor que atende. Uma seta mostra um setor que aprova pedidos de outro; uma linha tracejada,
          um pacote que junta serviços de setores diferentes.
        </p>
        {map.sectors.length === 0 ? (
          <p className="empty-state">Nenhum serviço está disponível no momento.</p>
        ) : (
          <>
            <SectorDiagram map={map} />
            <ul aria-label="Ligações entre os setores" className="map-links">
              {map.links.length > 0 ? (
                map.links.map((link) => <li key={`${link.kind}-${link.from}-${link.to}`}>{linkSentence(link)}</li>)
              ) : (
                <li>Cada setor atende sozinho os próprios serviços.</li>
              )}
            </ul>
          </>
        )}
        <ul aria-label="Os três grupos" className="map-legend">
          <li className="map-legend-self">
            <strong>Você resolve sozinho</strong> {articles.length} {articles.length === 1 ? "artigo" : "artigos"} e{" "}
            {map.selfService.accountActions.length} ações da sua conta
          </li>
          <li className="map-legend-attendance">
            <strong>Precisa de atendimento</strong> {map.attendance.length} com um só processo
          </li>
          <li className="map-legend-specialized">
            <strong>Atendimento especializado</strong> {map.specialized.length} com mais de um processo
          </li>
        </ul>
      </section>

      <section aria-labelledby="map-self" className="surface-card">
        <p className="eyebrow">Sem abrir solicitação</p>
        <h2 id="map-self">Você resolve sozinho</h2>
        <p className="section-description">Antes de pedir, veja se um destes caminhos resolve.</p>
        <h3>Na sua conta</h3>
        <ul className="map-actions">
          {map.selfService.accountActions.map(({ label, href }) => (
            <li key={href}>
              <Link href={href}>{label}</Link>
            </li>
          ))}
        </ul>
        <h3>Artigos da base de conhecimento</h3>
        {articles.length === 0 ? (
          <p className="metadata">Ainda não há artigos publicados.</p>
        ) : (
          <ul className="map-actions">
            {articles.map((article) => (
              <li key={article.id}>
                <Link href={`/catalog/${article.serviceId}`}>{article.title}</Link>{" "}
                <span className="metadata">({article.serviceName})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="map-attendance" className="surface-card">
        <p className="eyebrow">Um só processo</p>
        <h2 id="map-attendance">Precisa de atendimento</h2>
        <p className="section-description">Um setor recebe o pedido e o resolve do começo ao fim.</p>
        {map.attendance.length === 0 ? (
          <p className="metadata">Nenhum serviço neste grupo.</p>
        ) : (
          <ul className="map-cards">
            {map.attendance.map((entry) => (
              <ServiceCard entry={entry} key={entry.service.id} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="map-specialized" className="surface-card">
        <p className="eyebrow">Mais de um processo</p>
        <h2 id="map-specialized">Atendimento especializado ou acompanhamento</h2>
        <p className="section-description">
          O pedido passa por mais de um processo (aprovação, várias etapas ou vários serviços) até terminar. Acompanhe o
          andamento em &quot;Minhas solicitações&quot;.
        </p>
        {map.specialized.length === 0 ? (
          <p className="metadata">Nenhum serviço neste grupo.</p>
        ) : (
          <ul className="map-cards">
            {map.specialized.map((entry) =>
              entry.kind === "service" ? (
                <ServiceCard entry={entry} key={entry.service.id} />
              ) : (
                <BundleCard entry={entry} key={entry.bundle.id} />
              ),
            )}
          </ul>
        )}
      </section>
    </>
  );
}
