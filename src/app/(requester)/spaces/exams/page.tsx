import Link from "next/link";
import {
  EXAM_SPACE_KINDS,
  EXAM_STATUS_LABELS,
  SPACE_KIND_LABELS,
  canCancelExam,
  examTitle,
  listMyExams,
  listReservableSpaces,
} from "@/modules/spaces";
import { periodText, problemsOf, spaceErrorText, spaceNoticeText } from "@/app/_components/space-messages";
import { requireRequesterPageAccess } from "../../page-access";
import { cancelExamAction, requestExamAction } from "../actions";

type ExamsPageProps = { searchParams: Promise<{ error?: string; notice?: string; problems?: string }> };

// "Alocação de provas" (SPEC 2026-11-16-professores-e-tecnicos, part E; decision P13): the request, shown to professors
// (P9 and P17), and "Minhas provas" with the spaces allocated and the cancellation until the exam starts.
export default async function ExamsPage({ searchParams }: ExamsPageProps) {
  await requireRequesterPageAccess();
  const [query, exams, reservable] = await Promise.all([searchParams, listMyExams(), listReservableSpaces(null)]);
  const now = new Date();
  // P13: the sectors that have active classrooms or laboratories.
  const examSectorIds = new Set(
    reservable.spaces.filter((space) => (EXAM_SPACE_KINDS as readonly string[]).includes(space.kind)).map(({ sectorId }) => sectorId),
  );
  const sectors = reservable.sectors.filter(({ id }) => examSectorIds.has(id));
  const problems = problemsOf(query.problems);
  const error = spaceErrorText(query.error);
  const notice = spaceNoticeText(query.notice);

  return (
    <main className="page-shell" id="conteudo" tabIndex={-1}>
      <header className="page-header">
        <div className="page-intro">
          <p className="eyebrow">Professores</p>
          <h1>Alocação de provas</h1>
          <p>
            Informe a prova e o número de alunos: a equipe do setor escolhe uma ou mais salas livres que comportem todos e
            confirma.
          </p>
        </div>
        <nav aria-label="Reservas e provas" className="filter-links">
          <Link href="/spaces">Espaços</Link>
          <Link href="/spaces/reservations">Minhas reservas</Link>
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
      {problems.length > 0 ? (
        <p className="feedback feedback-error" role="alert">
          Pedido não enviado: {problems.map((problem) => `${problem.day}, ${problem.text}`).join("; ")}.
        </p>
      ) : null}

      <section aria-labelledby="exam-request-heading" className="surface-card content-section">
        <h2 id="exam-request-heading">Pedir alocação de prova</h2>
        {sectors.length === 0 ? (
          <p className="empty-state">Nenhum setor tem salas ou laboratórios cadastrados ainda.</p>
        ) : (
          <form action={requestExamAction} className="stacked-form">
            <label>
              Setor que aloca
              <select name="sectorId" required>
                {sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>
                    {sector.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Disciplina
              <input maxLength={120} name="course" required type="text" />
            </label>
            <label>
              Turma
              <input maxLength={60} name="classGroup" required type="text" />
            </label>
            <label>
              Data
              <input name="day" required type="date" />
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
              Número de alunos
              <input min={1} max={5000} name="students" required type="number" />
            </label>
            <label>
              Tipo de espaço
              <select defaultValue="CLASSROOM" name="spaceKind">
                {EXAM_SPACE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {SPACE_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Observações (opcional)
              <input maxLength={500} name="notes" placeholder="Por exemplo, acessibilidade" type="text" />
            </label>
            <button type="submit">Pedir alocação</button>
          </form>
        )}
      </section>

      <section aria-labelledby="my-exams-heading" className="content-section">
        <h2 id="my-exams-heading">Minhas provas</h2>
        {exams.length === 0 ? (
          <p className="empty-state">Você não pediu alocação de provas.</p>
        ) : (
          <ul className="content-list">
            {exams.map((exam) => (
              <li key={exam.id}>
                <h3>{examTitle(exam)}</h3>
                <p>
                  <span className="status-pill">{EXAM_STATUS_LABELS[exam.status]}</span> {periodText(exam.startsAt, exam.endsAt)} ·{" "}
                  {exam.students === 1 ? "1 aluno" : `${exam.students} alunos`} · {exam.sectorName}
                </p>
                {exam.spaces.length > 0 ? (
                  <p>Espaços: {exam.spaces.map((space) => `${space.name} (${space.capacity})`).join(", ")}</p>
                ) : null}
                {exam.refusalNote ? <p className="metadata">Motivo da recusa: {exam.refusalNote}</p> : null}
                {canCancelExam(exam, now) ? (
                  <details className="lifecycle-panel">
                    <summary>Cancelar pedido</summary>
                    <form action={cancelExamAction} className="stacked-form">
                      <input name="examId" type="hidden" value={exam.id} />
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
      </section>
    </main>
  );
}
