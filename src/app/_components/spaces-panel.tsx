import {
  MAX_SPACE_CAPACITY,
  MAX_SPACE_LOCATION,
  MAX_SPACE_NAME,
  MAX_SPACE_RESOURCES,
  SPACE_CONFIRMATIONS,
  SPACE_CONFIRMATION_LABELS,
  SPACE_KINDS,
  SPACE_KIND_LABELS,
  type SpaceEditorView,
  type SpaceRecord,
} from "@/modules/spaces";
import { createSpaceAction, setSpaceActiveAction, updateSpaceAction } from "./space-admin-actions";
import { spaceErrorText, spaceNoticeText } from "./space-messages";

// "Espaços" (SPEC 2026-11-16-professores-e-tecnicos, part C item 1; P5 and P6): the administrator's section and the
// same panel in "Serviços do setor" (only the holder's sector). Create, change, deactivate and reactivate.

type SpacesPanelProps = {
  area: "admin" | "sector";
  view: SpaceEditorView;
  error?: string;
  notice?: string;
};

function SpaceFields({ space, sectors }: { space?: SpaceRecord; sectors: SpaceEditorView["sectors"] }) {
  return (
    <>
      <label>
        Nome
        <input defaultValue={space?.name} maxLength={MAX_SPACE_NAME} name="name" required type="text" />
      </label>
      <label>
        Tipo
        <select defaultValue={space?.kind ?? "CLASSROOM"} name="kind">
          {SPACE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {SPACE_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Setor responsável
        <select defaultValue={space?.sectorId ?? sectors[0]?.id} name="sectorId">
          {sectors.map((sector) => (
            <option key={sector.id} value={sector.id}>
              {sector.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Capacidade
        <input defaultValue={space?.capacity ?? 30} max={MAX_SPACE_CAPACITY} min={1} name="capacity" required type="number" />
      </label>
      <label>
        Localização (opcional)
        <input defaultValue={space?.location} maxLength={MAX_SPACE_LOCATION} name="location" type="text" />
      </label>
      <label>
        Recursos (opcional)
        <input defaultValue={space?.resources} maxLength={MAX_SPACE_RESOURCES} name="resources" placeholder="Por exemplo: projetor, computadores" type="text" />
      </label>
      <label>
        Confirmação das reservas
        <select defaultValue={space?.confirmation ?? "SECTOR"} name="confirmation">
          {SPACE_CONFIRMATIONS.map((confirmation) => (
            <option key={confirmation} value={confirmation}>
              {SPACE_CONFIRMATION_LABELS[confirmation]}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function SpacesPanel({ area, view, error, notice }: SpacesPanelProps) {
  const errorText = spaceErrorText(error);
  const noticeText = spaceNoticeText(notice);
  return (
    <section aria-labelledby="espacos-heading" className="surface-card content-section" id="espacos">
      <h2 id="espacos-heading">Espaços</h2>
      <p className="section-description">
        Salas de aula, laboratórios e auditórios que professores e técnicos reservam. A confirmação pelo setor deixa cada
        reserva pendente até a equipe confirmar; a automática confirma na hora quando o horário está livre.
      </p>
      {noticeText ? (
        <p className="feedback" role="status">
          {noticeText}
        </p>
      ) : null}
      {errorText ? (
        <p className="feedback feedback-error" role="alert">
          {errorText}
        </p>
      ) : null}
      {view.sectors.length === 0 ? (
        <p className="empty-state">Cadastre um setor ativo antes dos espaços.</p>
      ) : (
        <form action={createSpaceAction} aria-label="Novo espaço" className="create-form">
          <input name="area" type="hidden" value={area} />
          <SpaceFields sectors={view.sectors} />
          <button type="submit">Cadastrar espaço</button>
        </form>
      )}
      {view.spaces.length === 0 ? (
        <p className="empty-state">Nenhum espaço cadastrado.</p>
      ) : (
        <ul className="entity-list space-entities">
          {view.spaces.map((space) => (
            <li key={space.id}>
              <p>
                <strong>{space.name}</strong> · {SPACE_KIND_LABELS[space.kind]} · {space.capacity} lugares · {space.sectorName}
                {space.isActive ? "" : " · Inativo"}
              </p>
              <details>
                <summary>Editar espaço {space.name}</summary>
                <form action={updateSpaceAction} className="create-form">
                  <input name="area" type="hidden" value={area} />
                  <input name="spaceId" type="hidden" value={space.id} />
                  <SpaceFields sectors={view.sectors} space={space} />
                  <button type="submit">Salvar espaço</button>
                </form>
              </details>
              <form action={setSpaceActiveAction} className="inline-form">
                <input name="area" type="hidden" value={area} />
                <input name="spaceId" type="hidden" value={space.id} />
                <input name="isActive" type="hidden" value={space.isActive ? "false" : "true"} />
                <button type="submit">{space.isActive ? `Desativar ${space.name}` : `Reativar ${space.name}`}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
