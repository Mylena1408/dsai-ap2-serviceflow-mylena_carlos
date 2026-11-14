import Link from "next/link";
import type { PeriodicReportDetail, PeriodicReportList } from "@/modules/periodic-reports";
import { PeriodicReportListView, PeriodicReportView } from "@/app/_components/periodic-reports";

// The section "Relatórios" of the administration (SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 3; SF-249): every
// report and the organization's, with a scope filter, and one report's numbers. The activation comes in SF-251.

const SECTION = "/admin?section=periodic-reports";

export function PeriodicReportsSection({ list, report, missing }: { list: PeriodicReportList | null; report: PeriodicReportDetail | null; missing: boolean }) {
  return (
    <section aria-labelledby="periodic-reports-heading" className="admin-section surface-card content-section">
      <h2 id="periodic-reports-heading">Relatórios</h2>
      <p className="section-description">
        Resumos semanais (de segunda a domingo) e mensais da organização e de cada setor, gerados pelo job diário com os números do momento.
      </p>
      {missing ? (
        <p className="feedback feedback-error" role="alert">
          Relatório não encontrado.
        </p>
      ) : null}
      {report ? (
        <>
          <p>
            <Link href={SECTION}>Voltar aos relatórios</Link>
          </p>
          <PeriodicReportView report={report} />
        </>
      ) : null}
      {list ? (
        <PeriodicReportListView
          detailHref={(id) => `${SECTION}&report=${id}`}
          filter={{ action: "/admin", hidden: { section: "periodic-reports" } }}
          list={list}
        />
      ) : null}
    </section>
  );
}
