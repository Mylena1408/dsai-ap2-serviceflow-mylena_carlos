import Link from "next/link";
import { RESERVATION_PURPOSE_LABELS, RESERVATION_STATUS_LABELS, canCancelOwn, listMyReservations } from "@/modules/spaces";
import { periodText, problemsOf, spaceErrorText, spaceNoticeText } from "@/app/_components/space-messages";
import { requireRequesterPageAccess } from "../../page-access";
import { cancelReservationAction } from "../actions";

type MyReservationsPageProps = { searchParams: Promise<{ error?: string; notice?: string; problems?: string }> };

// "Minhas reservas" (SPEC 2026-11-16-professores-e-tecnicos, part D item 2): the person's reservations from a week ago
// on, with the situation and, until each starts, the cancellation of that date or of it and the following ones of a
// weekly series (P8 and P10).
export default async function MyReservationsPage({ searchParams }: MyReservationsPageProps) {
  await requireRequesterPageAccess();
  const [query, reservations] = await Promise.all([searchParams, listMyReservations()]);
  const now = new Date();
  const error = spaceErrorText(query.error) ?? (problemsOf(query.problems).length > 0 ? spaceErrorText("state") : null);
  const notice = spaceNoticeText(query.notice);

  return (
    <main className="page-shell" id="conteudo" tabIndex={-1}>
      <header className="page-header">
        <div className="page-intro">
          <p className="eyebrow">Professores e técnicos</p>
          <h1>Minhas reservas</h1>
          <p>Suas reservas de espaços, da semana passada em diante. As pendentes aguardam a confirmação do setor do espaço.</p>
        </div>
        <nav aria-label="Reservas e provas" className="filter-links">
          <Link href="/spaces">Espaços</Link>
          <Link href="/spaces/exams">Alocação de provas</Link>
        </nav>
      </header>
      {notice ? (
        <p className="feedback" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="feedback feedback-error" role="alert">
          {error}
        </p>
      ) : null}
      {reservations.length === 0 ? (
        <p className="empty-state">
          Você não tem reservas. <Link href="/spaces">Ver os espaços</Link>
        </p>
      ) : (
        <ul className="content-list reservation-list">
          {reservations.map((reservation) => (
            <li key={reservation.id}>
              <h2>
                <Link href={`/spaces/${reservation.spaceId}`}>{reservation.spaceName}</Link>
              </h2>
              <p>
                <span className="status-pill">{RESERVATION_STATUS_LABELS[reservation.status]}</span>{" "}
                {periodText(reservation.startsAt, reservation.endsAt)} · {RESERVATION_PURPOSE_LABELS[reservation.purpose]}
                {reservation.seriesId ? " · reserva semanal" : ""}
              </p>
              <p>{reservation.description}</p>
              {reservation.decisionNote ? <p className="metadata">Observação do setor: {reservation.decisionNote}</p> : null}
              {reservation.cancelNote ? <p className="metadata">Motivo do cancelamento: {reservation.cancelNote}</p> : null}
              {canCancelOwn(reservation, now) ? (
                <details className="lifecycle-panel">
                  <summary>Cancelar reserva</summary>
                  <form action={cancelReservationAction} className="stacked-form">
                    <input name="reservationId" type="hidden" value={reservation.id} />
                    {reservation.seriesId ? (
                      <fieldset>
                        <legend>O que cancelar</legend>
                        <label>
                          <input defaultChecked name="scope" type="radio" value="one" /> Só esta data
                        </label>
                        <label>
                          <input name="scope" type="radio" value="series" /> Esta e as próximas datas da série
                        </label>
                      </fieldset>
                    ) : null}
                    <label>
                      Motivo (opcional)
                      <input maxLength={500} name="note" type="text" />
                    </label>
                    <button type="submit">Confirmar cancelamento</button>
                  </form>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
