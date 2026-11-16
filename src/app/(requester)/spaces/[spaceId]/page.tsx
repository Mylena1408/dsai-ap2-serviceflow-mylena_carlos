import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CHOOSABLE_PURPOSES,
  MAX_WEEKS,
  RESERVATION_PURPOSE_LABELS,
  RESERVATION_STATUS_LABELS,
  SPACE_CONFIRMATION_LABELS,
  SPACE_KIND_LABELS,
  dayLabel,
  getSpaceAgenda,
} from "@/modules/spaces";
import { NotFoundError } from "@/server/errors";
import { problemsOf, spaceErrorText } from "@/app/_components/space-messages";
import { requireRequesterPageAccess } from "../../page-access";
import { createReservationAction } from "../actions";

type SpacePageProps = {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ week?: string; reserved?: string; count?: string; error?: string; problems?: string }>;
};

const WEEKDAY_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// A space's week and the reservation form (SPEC 2026-11-16-professores-e-tecnicos, P7, P8 and P12). The agenda shows
// who reserved and why, the same for everyone (P17).
export default async function SpacePage({ params, searchParams }: SpacePageProps) {
  await requireRequesterPageAccess();
  const [{ spaceId }, query] = await Promise.all([params, searchParams]);
  let agenda;
  try {
    agenda = await getSpaceAgenda(spaceId, query.week);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { space } = agenda;
  const problems = problemsOf(query.problems);
  const error = spaceErrorText(query.error);
  const count = Number(query.count);
  const reserved =
    query.reserved === "confirmed"
      ? count > 1
        ? `Reserva semanal confirmada: ${count} datas.`
        : "Reserva confirmada."
      : query.reserved === "pending"
        ? count > 1
          ? `Reserva semanal enviada ao setor: ${count} datas aguardam confirmação.`
          : "Reserva enviada ao setor; ela aguarda confirmação."
        : null;

  return (
    <main className="page-shell" id="conteudo" tabIndex={-1}>
      <header className="detail-heading">
        <nav aria-label="Navegação dos espaços">
          <Link href="/spaces">Espaços</Link>
          <Link href="/spaces/reservations">Minhas reservas</Link>
        </nav>
      </header>
      <article className="surface-card">
        <p className="eyebrow">{SPACE_KIND_LABELS[space.kind]}</p>
        <h1>{space.name}</h1>
        <p>
          {space.capacity === 1 ? "1 lugar" : `${space.capacity} lugares`} · {space.sectorName}
        </p>
        {space.location ? <p>Local: {space.location}</p> : null}
        {space.resources ? <p>Recursos: {space.resources}</p> : null}
        <p className="metadata">Confirmação: {SPACE_CONFIRMATION_LABELS[space.confirmation].toLowerCase()}</p>
      </article>

      {reserved ? (
        <p className="feedback" role="status">
          {reserved}
        </p>
      ) : null}
      {error ? (
        <p className="feedback feedback-error" role="alert">
          {error}
        </p>
      ) : null}
      {problems.length > 0 ? (
        <div className="feedback feedback-error" role="alert">
          <p>Nada foi reservado. Datas com problema:</p>
          <ul>
            {problems.map((problem) => (
              <li key={`${problem.day}-${problem.text}`}>
                {problem.day}: {problem.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section aria-labelledby="agenda-heading" className="surface-card content-section">
        <div className="section-heading">
          <h2 id="agenda-heading">Semana de {dayLabel(agenda.monday)}</h2>
          <nav aria-label="Semanas" className="filter-links">
            <Link href={`/spaces/${space.id}?week=${agenda.previousWeek}`}>Semana anterior</Link>
            <Link href={`/spaces/${space.id}`}>Esta semana</Link>
            <Link href={`/spaces/${space.id}?week=${agenda.nextWeek}`}>Próxima semana</Link>
          </nav>
        </div>
        <ol className="agenda-days">
          {agenda.days.map(({ day, entries }, index) => (
            <li key={day}>
              <h3>
                {WEEKDAY_NAMES[index]}, {dayLabel(day)}
              </h3>
              {entries.length === 0 ? (
                <p className="metadata">Livre</p>
              ) : (
                <ul>
                  {entries.map((entry) => (
                    <li key={`${entry.start}-${entry.end}-${entry.requesterName}`}>
                      <strong>
                        {entry.start} às {entry.end}
                      </strong>{" "}
                      {RESERVATION_PURPOSE_LABELS[entry.purpose]} · {entry.requesterName} ·{" "}
                      <span className="status-pill">{RESERVATION_STATUS_LABELS[entry.status]}</span>
                      <span className="metadata"> {entry.description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="reserve-heading" className="surface-card content-section">
        <h2 id="reserve-heading">Reservar</h2>
        <p className="section-description">
          Das 07:00 às 23:00, em horários de 15 em 15 minutos, de 30 minutos a 8 horas; não em feriados. Para repetir toda
          semana, informe até quando (no máximo {MAX_WEEKS} datas): se alguma data estiver ocupada, nada é gravado.
        </p>
        <form action={createReservationAction} className="stacked-form">
          <input name="spaceId" type="hidden" value={space.id} />
          <label>
            Finalidade
            <select defaultValue="CLASS" name="purpose">
              {CHOOSABLE_PURPOSES.map((purpose) => (
                <option key={purpose} value={purpose}>
                  {RESERVATION_PURPOSE_LABELS[purpose]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Descrição
            <input maxLength={500} name="description" placeholder="Disciplina, turma ou assunto" required type="text" />
          </label>
          <label>
            Número de pessoas
            <input defaultValue={1} max={space.capacity} min={1} name="attendees" required type="number" />
          </label>
          <label>
            Data
            <input defaultValue={agenda.monday} name="day" required type="date" />
          </label>
          <label>
            Início
            <input defaultValue="08:00" max="22:30" min="07:00" name="start" required step={900} type="time" />
          </label>
          <label>
            Fim
            <input defaultValue="10:00" max="23:00" min="07:30" name="end" required step={900} type="time" />
          </label>
          <label>
            Repetir toda semana até (opcional)
            <input name="repeatUntil" type="date" />
          </label>
          <button type="submit">Reservar</button>
        </form>
      </section>
    </main>
  );
}
