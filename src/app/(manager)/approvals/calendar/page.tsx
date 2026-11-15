import { getSectorCalendarView } from "@/modules/calendar";
import { SectorCalendarPanel } from "@/app/_components/sector-calendar";
import { requireManagerPageAccess } from "../../page-access";

// The calendar of the manager's sector (SPEC 2026-11-09-comunicacao-e-calendarios, 6.1 and 6.3 item 1; decision K9).

type CalendarPageProps = { searchParams: Promise<{ sectorCalendar?: string }> };

export default async function SectorCalendarPage({ searchParams }: CalendarPageProps) {
  await requireManagerPageAccess();
  const [{ sectorCalendar }, view] = await Promise.all([searchParams, getSectorCalendarView()]);

  return (
    <main className="page-shell">
      <header className="detail-heading">
        <p className="eyebrow">Setor</p>
        <h1>Calendário</h1>
      </header>
      <SectorCalendarPanel area="approvals" message={sectorCalendar} view={view} />
    </main>
  );
}
