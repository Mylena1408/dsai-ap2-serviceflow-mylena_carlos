import Link from "next/link";
import { SPACE_CONFIRMATION_LABELS, SPACE_KINDS, SPACE_KIND_LABELS, listReservableSpaces } from "@/modules/spaces";
import { requireRequesterPageAccess } from "../page-access";

type SpacesPageProps = { searchParams: Promise<{ kind?: string; capacity?: string; sector?: string }> };

// "Espaços" (SPEC 2026-11-16-professores-e-tecnicos, part C item 2): the active classrooms, laboratories and
// auditoriums, with filters, each leading to its week and the reservation form. Shown to professors and technicians;
// open to every requester (P9 and P17).
export default async function SpacesPage({ searchParams }: SpacesPageProps) {
  await requireRequesterPageAccess();
  const { filter, spaces, sectors } = await listReservableSpaces(await searchParams);

  return (
    <main className="page-shell" id="conteudo" tabIndex={-1}>
      <header className="page-header">
        <div className="page-intro">
          <p className="eyebrow">Professores e técnicos</p>
          <h1>Espaços</h1>
          <p>Salas de aula, laboratórios e auditórios para reservar. Veja a semana de cada espaço antes de pedir.</p>
        </div>
        <nav aria-label="Reservas e provas" className="filter-links">
          <Link href="/spaces/reservations">Minhas reservas</Link>
          <Link href="/spaces/exams">Alocação de provas</Link>
        </nav>
      </header>

      <form action="/spaces" aria-label="Filtrar espaços" className="inline-form" method="get" role="search">
        <label>
          Tipo
          <select defaultValue={filter.kind ?? ""} name="kind">
            <option value="">Todos</option>
            {SPACE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {SPACE_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Capacidade mínima
          <input defaultValue={filter.minCapacity ?? ""} inputMode="numeric" min={1} name="capacity" type="number" />
        </label>
        <label>
          Setor
          <select defaultValue={filter.sectorId ?? ""} name="sector">
            <option value="">Todos</option>
            {sectors.map((sector) => (
              <option key={sector.id} value={sector.id}>
                {sector.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filtrar</button>
      </form>

      <p aria-live="polite" className="metadata">
        {spaces.length === 1 ? "1 espaço." : `${spaces.length} espaços.`}
        {filter.kind || filter.minCapacity || filter.sectorId ? (
          <>
            {" "}
            <Link href="/spaces">Ver todos</Link>
          </>
        ) : null}
      </p>

      {spaces.length === 0 ? (
        <p className="empty-state">Nenhum espaço com esses filtros.</p>
      ) : (
        <ul className="content-list space-list">
          {spaces.map((space) => (
            <li key={space.id}>
              <h2>
                <Link href={`/spaces/${space.id}`}>{space.name}</Link>
              </h2>
              <p>
                {SPACE_KIND_LABELS[space.kind]} · {space.capacity === 1 ? "1 lugar" : `${space.capacity} lugares`} · {space.sectorName}
              </p>
              {space.location ? <p className="metadata">Local: {space.location}</p> : null}
              {space.resources ? <p className="metadata">Recursos: {space.resources}</p> : null}
              <p className="metadata">Confirmação: {SPACE_CONFIRMATION_LABELS[space.confirmation].toLowerCase()}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
