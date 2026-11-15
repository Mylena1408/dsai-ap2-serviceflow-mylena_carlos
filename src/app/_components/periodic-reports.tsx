import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import {
  PERIODIC_REPORT_KIND_LABELS,
  REPORT_LIST_SIZE,
  hasPeriodicReports,
  periodLabel,
  type PeriodicReportDetail,
  type PeriodicReportList,
  type PeriodicReportSummary,
} from "@/modules/periodic-reports";
import { formatMinutes } from "@/modules/time-entries";
import { zonedDateTimeOf } from "@/shared/time";

// The page "Relatórios" (SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 3; SF-249), shared by the manager's area
// (their sector) and the administration (every report, with a scope filter): the list and one report's numbers.

const numbers = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function generatedAtText(instant: Date): string {
  const [day, time] = zonedDateTimeOf(instant).split(" ");
  const [year, month, date] = day!.split("-");
  return `${date}/${month}/${year} ${time}`;
}

export function scopeText(report: Pick<PeriodicReportSummary, "sectorId" | "sectorName">): string {
  return report.sectorId === null ? "Organização" : (report.sectorName ?? "(setor removido)");
}

export function reportTitle(report: Pick<PeriodicReportSummary, "kind" | "firstDay" | "lastDay">): string {
  return periodLabel(report.kind, report);
}

/** The scope filter of the administrator: every report, the organization's, or one sector's. */
function ScopeFilter({ list, action, hidden }: { list: PeriodicReportList; action: string; hidden: Record<string, string> }) {
  return (
    <form action={action} aria-label="Filtro dos relatórios" className="inline-form" method="get">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <label>
        Escopo
        <select defaultValue={list.scope} name="scope">
          <option value="all">Todos</option>
          <option value="organization">Organização</option>
          {list.sectors.map((sector) => (
            <option key={sector.id} value={sector.id}>
              {sector.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">Filtrar</button>
    </form>
  );
}

export function PeriodicReportListView({
  list,
  detailHref,
  filter,
}: {
  list: PeriodicReportList;
  /** The address of one report. */
  detailHref: (reportId: string) => string;
  /** Only for the administrator. */
  filter?: { action: string; hidden: Record<string, string> };
}) {
  return (
    <>
      {filter && list.audience === "organization" ? <ScopeFilter action={filter.action} hidden={filter.hidden} list={list} /> : null}
      {list.reports.length === 0 ? (
        <p className="empty-state">Nenhum relatório gerado ainda.</p>
      ) : (
        <>
          <table className="data-table">
            <caption>Relatórios</caption>
            <thead>
              <tr>
                <th scope="col">Período</th>
                <th scope="col">Tipo</th>
                <th scope="col">Escopo</th>
                <th scope="col">Gerado em</th>
              </tr>
            </thead>
            <tbody>
              {list.reports.map((report) => (
                <tr key={report.id}>
                  <td>
                    <Link href={detailHref(report.id)}>{reportTitle(report)}</Link>
                  </td>
                  <td>{PERIODIC_REPORT_KIND_LABELS[report.kind]}</td>
                  <td>{scopeText(report)}</td>
                  <td>{generatedAtText(report.generatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.reports.length === REPORT_LIST_SIZE ? <p className="metadata">Mostrando os {REPORT_LIST_SIZE} mais recentes.</p> : null}
        </>
      )}
    </>
  );
}

const dash = (value: number | null, format: (value: number) => string) => (value === null ? "—" : format(value));

export function PeriodicReportView({ report }: { report: PeriodicReportDetail }) {
  const { metrics } = report;
  const rows: Array<[string, string]> = [
    ["Solicitações abertas", String(metrics.opened)],
    ["Concluídas", String(metrics.completed)],
    ["Canceladas", String(metrics.cancelled)],
    [
      "Concluídas no prazo",
      metrics.completedWithDueDate === 0 ? "—" : `${metrics.completedOnTime} de ${metrics.completedWithDueDate} (${dash(metrics.onTimePercentage, (value) => `${value}%`)})`,
    ],
    ["Tempo mediano de atendimento", dash(metrics.medianResolutionHours, (value) => `${numbers.format(value)} h`)],
    [
      "Avaliação média",
      metrics.ratingCount === 0 ? "—" : `${dash(metrics.ratingAverage, (value) => numbers.format(value))} (${metrics.ratingCount} ${metrics.ratingCount === 1 ? "avaliação" : "avaliações"})`,
    ],
    ["Horas lançadas", formatMinutes(metrics.minutesLogged)],
  ];
  return (
    <section aria-labelledby="periodic-report-title" className="surface-card content-section">
      <h2 id="periodic-report-title">{reportTitle(report)}</h2>
      <p className="metadata">
        {PERIODIC_REPORT_KIND_LABELS[report.kind]} · {scopeText(report)} · gerado em {generatedAtText(report.generatedAt)}. Os números são os do momento
        da geração.
      </p>
      <table className="data-table">
        <caption>Números do período</caption>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {metrics.topTags.length > 0 ? (
        <table className="data-table">
          <caption>Etiquetas mais usadas</caption>
          <thead>
            <tr>
              <th scope="col">Etiqueta</th>
              <th scope="col">Solicitações</th>
            </tr>
          </thead>
          <tbody>
            {metrics.topTags.map((tag) => (
              <tr key={tag.name}>
                <td>{tag.name}</td>
                <td>{tag.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

/** "Relatórios" in the manager's navigation, only with a report of their sector (CA-REL-01). Never breaks the page. */
export async function PeriodicReportsLink() {
  let show = false;
  try {
    show = await hasPeriodicReports();
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
  return show ? <Link href="/approvals/reports">Relatórios</Link> : null;
}

/**
 * "Relatórios periódicos" in "Análises" (SPEC 2026-11-09-comunicacao-e-calendarios, 7 item 3; SF-259): the latest
 * reports of the scope shown, each linked to its page, and the way to the page "Relatórios". Without a report, nothing
 * is shown, so the screen stays as it was (CA-REL-01).
 */
export function LatestPeriodicReports({
  reports,
  detailHref,
  allHref,
}: {
  reports: readonly PeriodicReportSummary[];
  detailHref: (reportId: string) => string;
  allHref: string;
}) {
  if (reports.length === 0) return null;
  return (
    <section aria-labelledby="analytics-periodic-reports" className="surface-card">
      <h2 id="analytics-periodic-reports">Relatórios periódicos</h2>
      <p className="metadata">Os mais recentes deste escopo, com os números guardados no dia em que foram gerados.</p>
      <ul className="content-list">
        {reports.map((report) => (
          <li key={report.id}>
            <Link href={detailHref(report.id)}>{reportTitle(report)}</Link>
            <span className="metadata">
              {" "}
              · {PERIODIC_REPORT_KIND_LABELS[report.kind]} · {scopeText(report)} · gerado em {generatedAtText(report.generatedAt)}
            </span>
          </li>
        ))}
      </ul>
      <p>
        <Link href={allHref}>Ver todos os relatórios</Link>
      </p>
    </section>
  );
}
