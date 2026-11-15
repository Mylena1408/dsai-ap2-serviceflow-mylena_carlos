import { MAX_HOLIDAY_NAME_LENGTH, WEEKDAY_LABELS, timeOfMinute, type SectorCalendarView } from "@/modules/calendar";
import { clearSectorHoursAction, createSectorHolidayAction, deleteSectorHolidayAction, saveSectorHoursAction } from "./sector-calendar-actions";

// A sector's calendar (SPEC 2026-11-09-comunicacao-e-calendarios, 6.1 and 6.3; SF-253), shared by the administration
// (any active sector, chosen in a list) and the manager's area (their sector): own business hours, or the
// organization's, and the sector's holidays on top of the organization's.

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

const MESSAGES: Record<string, { text: string; error: boolean }> = {
  "hours-saved": { text: "Expediente do setor salvo. Vale para as solicitações abertas daqui em diante.", error: false },
  "hours-cleared": { text: "O setor voltou a seguir o expediente da organização.", error: false },
  unchanged: { text: "Nada mudou: o setor já segue o expediente da organização.", error: false },
  "holiday-created": { text: "Feriado do setor cadastrado.", error: false },
  "holiday-deleted": { text: "Feriado do setor removido.", error: false },
  "holiday-taken": { text: "O setor já tem um feriado nessa data.", error: true },
  invalid: { text: "Confira os campos: ao menos um dia, horários HH:MM com o início antes do fim, data válida e nome de 1 a 80 caracteres.", error: true },
  missing: { text: "O setor ou o feriado não está disponível para você.", error: true },
};

export function sectorCalendarMessage(code: string | undefined): { text: string; error: boolean } | null {
  return code ? (MESSAGES[code] ?? null) : null;
}

export function holidayDate(day: string, yearly: boolean): string {
  const [year, month, date] = day.split("-");
  return yearly ? `${date}/${month} (todo ano)` : `${date}/${month}/${year}`;
}

/** "Segunda-feira a sexta-feira, 08:00 às 18:00" style summary of a window. */
export function hoursText(hours: { weekdays: readonly number[]; startMinute: number; endMinute: number }): string {
  const days = [...hours.weekdays].sort((a, b) => a - b).map((day) => WEEKDAY_LABELS[day] ?? String(day));
  return `${days.join(", ")}; das ${timeOfMinute(hours.startMinute)} às ${timeOfMinute(hours.endMinute)}`;
}

type Area = "admin" | "approvals";

function Hidden({ area, sectorId }: { area: Area; sectorId: string }) {
  return (
    <>
      <input name="area" type="hidden" value={area} />
      <input name="sectorId" type="hidden" value={sectorId} />
    </>
  );
}

export function SectorCalendarPanel({ view, area, message }: { view: SectorCalendarView; area: Area; message?: string }) {
  const feedback = sectorCalendarMessage(message);
  const { sector, hours, organization } = view;
  const shown = hours ?? organization;

  return (
    <section aria-labelledby="sector-calendar-heading" className="surface-card content-section">
      <h2 id="sector-calendar-heading">Calendário do setor</h2>
      <p className="section-description">
        Um setor pode ter dias e horário de expediente próprios e feriados além dos da organização. Vale para os prazos em horas úteis das solicitações
        abertas daqui em diante; as já abertas mantêm o prazo. O fuso é sempre o da organização ({organization.timeZone}).
      </p>
      {feedback ? (
        <p className={`feedback${feedback.error ? " feedback-error" : ""}`} role={feedback.error ? "alert" : "status"}>
          {feedback.text}
        </p>
      ) : null}

      {area === "admin" ? (
        <form action="/admin" aria-label="Escolher o setor" className="inline-form" method="get">
          <input name="section" type="hidden" value="calendar" />
          <label>
            Setor
            <select defaultValue={sector?.id ?? ""} name="calendarSector">
              <option value="">Escolha um setor</option>
              {view.sectors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Abrir</button>
        </form>
      ) : null}

      {sector ? (
        <>
          <h3>Expediente de {sector.name}</h3>
          <p>
            {hours ? "Expediente próprio" : "Segue o expediente da organização"}: {hoursText(shown)}.
          </p>
          <form action={saveSectorHoursAction} aria-label="Expediente do setor" className="create-form">
            <Hidden area={area} sectorId={sector.id} />
            <fieldset className="format-options">
              <legend>Dias de expediente</legend>
              {WEEKDAYS.map((day) => (
                <label className="checkbox-field" key={day}>
                  <input defaultChecked={shown.weekdays.includes(day)} name="weekdays" type="checkbox" value={String(day)} />
                  {WEEKDAY_LABELS[day]}
                </label>
              ))}
            </fieldset>
            <label>
              Início do expediente
              <input defaultValue={timeOfMinute(shown.startMinute)} name="startTime" pattern="[0-2][0-9]:[0-5][0-9]" required type="text" />
            </label>
            <label>
              Fim do expediente
              <input defaultValue={timeOfMinute(shown.endMinute)} name="endTime" pattern="[0-2][0-9]:[0-5][0-9]" required type="text" />
            </label>
            <button type="submit">Salvar expediente do setor</button>
          </form>
          {hours ? (
            <form action={clearSectorHoursAction} className="inline-form">
              <Hidden area={area} sectorId={sector.id} />
              <button className="button-secondary" type="submit">
                Voltar ao expediente da organização
              </button>
            </form>
          ) : null}

          <h3>Feriados de {sector.name}</h3>
          <p className="section-description">Somam-se aos feriados da organização, que valem para todos os setores.</p>
          <form action={createSectorHolidayAction} aria-label="Novo feriado do setor" className="create-form">
            <Hidden area={area} sectorId={sector.id} />
            <label>
              Data
              <input name="day" required type="date" />
            </label>
            <label>
              Nome
              <input maxLength={MAX_HOLIDAY_NAME_LENGTH} name="name" required type="text" />
            </label>
            <label className="checkbox-field">
              <input name="yearly" type="checkbox" />
              Repete todo ano
            </label>
            <button type="submit">Cadastrar feriado do setor</button>
          </form>
          {view.holidays.length === 0 ? (
            <p className="empty-state">Nenhum feriado próprio do setor.</p>
          ) : (
            <ul aria-label="Feriados do setor" className="entity-list">
              {view.holidays.map((holiday) => (
                <li className="entity-item" key={holiday.id}>
                  <div className="entity-record-content">
                    <div className="entity-summary">
                      <strong>{holiday.name}</strong>
                    </div>
                    <div className="entity-details">
                      <span>{holidayDate(holiday.day, holiday.yearly)}</span>
                    </div>
                  </div>
                  <form action={deleteSectorHolidayAction} className="entity-actions">
                    <input name="area" type="hidden" value={area} />
                    <input name="sectorId" type="hidden" value={sector.id} />
                    <input name="holidayId" type="hidden" value={holiday.id} />
                    <button aria-label={`Remover ${holiday.name}`} className="button-danger" type="submit">
                      Remover
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : view.sectors.length === 0 ? (
        <p className="empty-state">Nenhum setor ativo.</p>
      ) : (
        <p className="empty-state">Escolha um setor para ver e mudar o calendário dele.</p>
      )}
    </section>
  );
}
