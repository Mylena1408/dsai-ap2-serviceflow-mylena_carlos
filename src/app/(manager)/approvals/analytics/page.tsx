import { latestPeriodicReports } from "@/modules/periodic-reports";
import { getAnalytics } from "@/modules/reports";
import { AnalyticsView } from "@/app/_components/analytics-view";
import { LatestPeriodicReports } from "@/app/_components/periodic-reports";
import { requireManagerPageAccess } from "../../page-access";

// "Análises" of the manager (SPEC 2026-11-06-analises-operacionais, 5.1): only the current sector;
// a sector in the URL is ignored by the use case.

type ManagerAnalyticsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ManagerAnalyticsPage({ searchParams }: ManagerAnalyticsPageProps) {
  await requireManagerPageAccess();
  const { period, from, to } = await searchParams;
  // SPEC 2026-11-09-comunicacao-e-calendarios, 7 item 3: the latest reports of the sector, when there are any.
  const [analytics, reports] = await Promise.all([getAnalytics({ period, from, to }), latestPeriodicReports()]);

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Indicadores</p>
          <h1>Análises do setor</h1>
          <p>Tendências, tempos de atendimento e a distribuição do trabalho da equipe do seu setor.</p>
        </div>
      </header>
      <AnalyticsView action="/approvals/analytics" analytics={analytics} timeReport={{ action: "/approvals/time" }} />
      <LatestPeriodicReports allHref="/approvals/reports" detailHref={(id) => `/approvals/reports/${id}`} reports={reports} />
    </main>
  );
}
