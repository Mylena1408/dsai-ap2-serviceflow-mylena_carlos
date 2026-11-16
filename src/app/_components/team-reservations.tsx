import {
  RESERVATION_PURPOSE_LABELS,
  RESERVATION_STATUS_LABELS,
  SPACE_KIND_LABELS,
  canCancelBySector,
  examTitle,
  type ReservationRecord,
  type SectorExams,
  type SectorReservations,
} from "@/modules/spaces";
import { periodText, problemsOf, spaceErrorText, spaceNoticeText } from "./space-messages";
import { allocateExamAction, decideReservationAction, refuseExamAction } from "./team-reservation-actions";

// The team's page "Reservas" (SPEC 2026-11-16-professores-e-tecnicos, part D item 3 and part E item 2): the pending
// reservations of the sector's spaces to confirm or refuse, the confirmed ones to cancel, and the exams to allocate,
// with the suggestion already checked.

type TeamReservationsProps = {
  returnTo: "/queue/reservations" | "/approvals/reservations";
  reservations: SectorReservations;
  exams: SectorExams;
  query: { error?: string; notice?: string; problems?: string };
};

function ReservationLine({ reservation }: { reservation: ReservationRecord }) {
  return (
    <>
      <h3>
        {reservation.spaceName} · {periodText(reservation.startsAt, reservation.endsAt)}
      </h3>
      <p>
        <span className="status-pill">{RESERVATION_STATUS_LABELS[reservation.status]}</span>{" "}
        {RESERVATION_PURPOSE_LABELS[reservation.purpose]} · {reservation.requesterName} ·{" "}
        {reservation.attendees === 1 ? "1 pessoa" : `${reservation.attendees} pessoas`}
        {reservation.seriesId ? " · reserva semanal" : ""}
      </p>
      <p>{reservation.description}</p>
    </>
  );
}

export function TeamReservations({ returnTo, reservations, exams, query }: TeamReservationsProps) {
  const now = new Date();
  const error = spaceErrorText(query.error);
  const notice = spaceNoticeText(query.notice);
  const problems = problemsOf(query.problems);

  return (
    <>
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
      {problems.length > 0 ? (
        <p className="feedback feedback-error" role="alert">
          Nada foi gravado: {problems.map((problem) => `${problem.day}, ${problem.text}`).join("; ")}.
        </p>
      ) : null}

      <section aria-labelledby="pending-reservations" className="surface-card content-section">
        <h2 id="pending-reservations">Reservas para confirmar</h2>
        {reservations.pending.length === 0 ? (
          <p className="empty-state">Nenhuma reserva aguardando confirmação.</p>
        ) : (
          <ul className="content-list">
            {reservations.pending.map((reservation) => (
              <li key={reservation.id}>
                <ReservationLine reservation={reservation} />
                <div className="decision-forms">
                  <form action={decideReservationAction} className="inline-form">
                    <input name="returnTo" type="hidden" value={returnTo} />
                    <input name="reservationId" type="hidden" value={reservation.id} />
                    <input name="decision" type="hidden" value="confirm" />
                    <button type="submit">Confirmar reserva</button>
                  </form>
                  <details className="lifecycle-panel">
                    <summary>Recusar reserva</summary>
                    <form action={decideReservationAction} className="stacked-form">
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <input name="reservationId" type="hidden" value={reservation.id} />
                      <input name="decision" type="hidden" value="refuse" />
                      <label>
                        Motivo
                        <input maxLength={500} name="note" required type="text" />
                      </label>
                      <button type="submit">Confirmar recusa</button>
                    </form>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="confirmed-reservations" className="surface-card content-section">
        <h2 id="confirmed-reservations">Reservas confirmadas</h2>
        {reservations.upcoming.length === 0 ? (
          <p className="empty-state">Nenhuma reserva confirmada a seguir.</p>
        ) : (
          <ul className="content-list">
            {reservations.upcoming.map((reservation) => (
              <li key={reservation.id}>
                <ReservationLine reservation={reservation} />
                {canCancelBySector(reservation, now) ? (
                  <details className="lifecycle-panel">
                    <summary>Cancelar reserva</summary>
                    <form action={decideReservationAction} className="stacked-form">
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <input name="reservationId" type="hidden" value={reservation.id} />
                      <input name="decision" type="hidden" value="cancel" />
                      <label>
                        Motivo
                        <input maxLength={500} name="note" required type="text" />
                      </label>
                      <button type="submit">Confirmar cancelamento</button>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="provas-heading" className="surface-card content-section" id="provas">
        <h2 id="provas-heading">Provas</h2>
        <h3 id="provas-pending">Pedidos para alocar</h3>
        {exams.pending.length === 0 ? (
          <p className="empty-state">Nenhum pedido de prova aguardando alocação.</p>
        ) : (
          <ul className="content-list">
            {exams.pending.map(({ exam, candidates, suggestion }) => {
              const suggested = new Set((suggestion ?? []).map(({ id }) => id));
              return (
                <li key={exam.id}>
                  <h4>{examTitle(exam)}</h4>
                  <p>
                    {periodText(exam.startsAt, exam.endsAt)} · {exam.students === 1 ? "1 aluno" : `${exam.students} alunos`} ·{" "}
                    {SPACE_KIND_LABELS[exam.spaceKind]} · {exam.professorName}
                  </p>
                  {exam.notes ? <p className="metadata">Observações: {exam.notes}</p> : null}
                  {candidates.length === 0 ? (
                    <p className="metadata">Nenhum espaço desse tipo está livre nesse horário.</p>
                  ) : (
                    <form action={allocateExamAction} className="stacked-form">
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <input name="examId" type="hidden" value={exam.id} />
                      <fieldset>
                        <legend>
                          Espaços livres
                          {suggestion
                            ? ` (sugestão: ${suggestion.map(({ name }) => name).join(", ")})`
                            : " (os livres não comportam todos os alunos)"}
                        </legend>
                        {candidates.map((space) => (
                          <label key={space.id}>
                            <input defaultChecked={suggested.has(space.id)} name="spaceId" type="checkbox" value={space.id} /> {space.name} (
                            {space.capacity} lugares)
                          </label>
                        ))}
                      </fieldset>
                      <button type="submit">Alocar prova</button>
                    </form>
                  )}
                  <details className="lifecycle-panel">
                    <summary>Recusar pedido</summary>
                    <form action={refuseExamAction} className="stacked-form">
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <input name="examId" type="hidden" value={exam.id} />
                      <label>
                        Motivo
                        <input maxLength={500} name="note" required type="text" />
                      </label>
                      <button type="submit">Confirmar recusa</button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <h3 id="provas-allocated">Provas alocadas</h3>
        {exams.allocated.length === 0 ? (
          <p className="empty-state">Nenhuma prova alocada a seguir.</p>
        ) : (
          <ul className="content-list">
            {exams.allocated.map((exam) => (
              <li key={exam.id}>
                <h4>{examTitle(exam)}</h4>
                <p>
                  {periodText(exam.startsAt, exam.endsAt)} · {exam.professorName} · Espaços:{" "}
                  {exam.spaces.map(({ name }) => name).join(", ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
