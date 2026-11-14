import Link from "next/link";
import { PERIODIC_REPORT_KINDS, type PeriodicReportDetail, type PeriodicReportList, type PeriodicReportSettings } from "@/modules/periodic-reports";
import { PeriodicReportListView, PeriodicReportView } from "@/app/_components/periodic-reports";
import { setPeriodicReportEnabledAction } from "./actions";

// The section "Relatórios" of the administration (SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 3; SF-249): every
// report and the organization's, with a scope filter, and one report's numbers; and turning each kind on or off (5.3
// item 3; SF-251).

const SECTION = "/admin?section=periodic-reports";

const KIND_TEXT = {
  WEEKLY: { name: "Relatório semanal", when: "Gerado na segunda-feira, sobre a semana anterior (de segunda a domingo)." },
  MONTHLY: { name: "Relatório mensal", when: "Gerado no dia 1, sobre o mês anterior." },
} as const;

const SETTING_RESULTS: Record<string, { text: string; error: boolean }> = {
  enabled: { text: "Relatório ligado. O próximo sai na próxima execução do job diário.", error: false },
  disabled: { text: "Relatório desligado. Os já gerados continuam na lista.", error: false },
  unchanged: { text: "Nada mudou: o relatório já estava assim.", error: false },
  conflict: { text: "O relatório mudou ao mesmo tempo por outra ação. Confira o estado e tente de novo.", error: true },
  invalid: { text: "Escolha um tipo de relatório da lista.", error: true },
  denied: { text: "Só o administrador liga e desliga os relatórios.", error: true },
};

/** 5.3 item 3: each kind with its state and the button that changes it. */
export function PeriodicReportSettingsForm({ settings, result }: { settings: PeriodicReportSettings; result?: string }) {
  const message = result ? SETTING_RESULTS[result] : undefined;
  return (
    <section aria-labelledby="periodic-report-settings-heading" className="content-section">
      <h3 id="periodic-report-settings-heading">Geração</h3>
      {message ? (
        <p className={`feedback${message.error ? " feedback-error" : ""}`} role={message.error ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}
      <ul className="content-list">
        {PERIODIC_REPORT_KINDS.map((kind) => {
          const on = settings[kind];
          const name = KIND_TEXT[kind].name;
          return (
            <li key={kind}>
              <form action={setPeriodicReportEnabledAction} className="inline-form">
                <input name="kind" type="hidden" value={kind} />
                <input name="enabled" type="hidden" value={on ? "false" : "true"} />
                <p>
                  <strong>{name}</strong>: {on ? "ligado" : "desligado"}. {KIND_TEXT[kind].when}
                </p>
                <button className={on ? "button-secondary" : undefined} type="submit">
                  {on ? `Desligar ${name.toLowerCase()}` : `Ligar ${name.toLowerCase()}`}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      <p className="metadata">
        Quando sai o relatório de um setor, os gestores daquele setor recebem um aviso; o e-mail vai para quem escolheu &quot;Relatórios&quot;
        nas preferências.
      </p>
    </section>
  );
}

export function PeriodicReportsSection({
  list,
  report,
  missing,
  settings,
  settingResult,
}: {
  list: PeriodicReportList | null;
  report: PeriodicReportDetail | null;
  missing: boolean;
  settings: PeriodicReportSettings;
  settingResult?: string;
}) {
  return (
    <section aria-labelledby="periodic-reports-heading" className="admin-section surface-card content-section">
      <h2 id="periodic-reports-heading">Relatórios</h2>
      <p className="section-description">
        Resumos semanais (de segunda a domingo) e mensais da organização e de cada setor, gerados pelo job diário com os números do momento.
      </p>
      {report ? null : <PeriodicReportSettingsForm result={settingResult} settings={settings} />}
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
