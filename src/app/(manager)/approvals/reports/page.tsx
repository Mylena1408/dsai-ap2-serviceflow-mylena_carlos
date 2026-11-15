import { listPeriodicReports } from "@/modules/periodic-reports";
import { PeriodicReportListView } from "@/app/_components/periodic-reports";
import { requireManagerPageAccess } from "../../page-access";

// "Relatórios" of the manager (SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 3; SF-249): only the sector's reports.

export default async function ManagerReportsPage() {
  await requireManagerPageAccess();
  const list = await listPeriodicReports();

  return (
    <main className="page-shell" id="conteudo" tabIndex={-1}>
      <header className="page-header">
        <div>
          <p className="eyebrow">Indicadores</p>
          <h1>Relatórios do setor</h1>
          <p>Os resumos semanais e mensais do seu setor, com os números do momento em que foram gerados.</p>
        </div>
      </header>
      <PeriodicReportListView detailHref={(id) => `/approvals/reports/${id}`} list={list} />
    </main>
  );
}
