import { listSectorExams, listSectorReservations } from "@/modules/spaces";
import { TeamReservations } from "@/app/_components/team-reservations";
import { requireAttendantPageAccess } from "../../page-access";

// "Reservas" of the sector (SPEC 2026-11-16-professores-e-tecnicos, part D item 3 and part E item 2; P10 and P13).

type ReservationsPageProps = { searchParams: Promise<{ error?: string; notice?: string; problems?: string }> };

export default async function AttendantReservationsPage({ searchParams }: ReservationsPageProps) {
  await requireAttendantPageAccess();
  const [query, reservations, exams] = await Promise.all([searchParams, listSectorReservations(), listSectorExams()]);

  return (
    <main className="page-shell" id="conteudo" tabIndex={-1}>
      <header className="page-header">
        <div className="page-intro">
          <p className="eyebrow">Fila</p>
          <h1>Reservas</h1>
          <p>Reservas dos espaços do seu setor e pedidos de alocação de provas.</p>
        </div>
      </header>
      <TeamReservations exams={exams} query={query} reservations={reservations} returnTo="/queue/reservations" />
    </main>
  );
}
