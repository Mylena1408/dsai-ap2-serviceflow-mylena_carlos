"use client";

import { REQUESTER_KIND_LABELS } from "@/shared/requester-kinds";
import { TableScroll } from "@/app/_components/table-scroll";
import { useActionState } from "react";
import type { ImportLineOutcome, ImportSummary, UserImportPreview } from "@/modules/user-import";
import { applyUserImportAction, previewUserImportAction, type UserImportState } from "./actions";

// The import of people (SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 items 2 and 3; decision K1; SF-245): the file
// first goes to the preview; only a preview with a line to create offers "Aplicar", which sends the same text. A new
// preview starts the confirmation again.

/**
 * The texts of the rules, given by the server section: the module's public API brings the database, which never goes to
 * the browser, and modules are imported only through it.
 */
export interface UserImportTexts {
  fileErrors: Record<string, string>;
  lineErrors: Record<string, string>;
  maxRows: number;
}

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

export function summaryText(summary: ImportSummary): string {
  return `${count(summary.create, "pessoa a criar", "pessoas a criar")}, ${count(summary.skip, "ignorada", "ignoradas")} (e-mail já existe) e ${count(
    summary.error,
    "linha com erro",
    "linhas com erro",
  )}.`;
}

export function appliedText(summary: ImportSummary): string {
  return `${count(summary.create, "pessoa criada", "pessoas criadas")}, ${count(summary.skip, "ignorada", "ignoradas")} e ${count(
    summary.error,
    "linha com erro",
    "linhas com erro",
  )}.`;
}

export function outcomeText(line: ImportLineOutcome, lineErrors: Record<string, string>): string {
  if (line.outcome === "create") return "Criar";
  if (line.outcome === "skip") return "Ignorar: e-mail já existe";
  return `Erro: ${line.errors.map((error) => lineErrors[error] ?? error).join(", ")}`;
}

export function LinesTable({ lines, caption, lineErrors }: { lines: readonly ImportLineOutcome[]; caption: string; lineErrors: Record<string, string> }) {
  return (
    <TableScroll label={caption}>
      <table className="data-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Linha</th>
            <th scope="col">Nome</th>
            <th scope="col">E-mail</th>
            <th scope="col">Perfil</th>
            <th scope="col">Setor</th>
            <th scope="col">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.line}>
              <td>{line.line}</td>
              <td>{line.values.nome || "—"}</td>
              <td>{line.values.email || "—"}</td>
              <td>
                {line.values.perfil || "—"}
                {/* SPEC 2026-11-16-tipos-de-solicitante, decision T7: the kind the line gives. */}
                {line.outcome === "create" && line.person.requesterKind ? ` (${REQUESTER_KIND_LABELS[line.person.requesterKind]})` : ""}
              </td>
              <td>{line.values.setor || "—"}</td>
              <td>{outcomeText(line, lineErrors)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

function ApplyForm({ preview }: { preview: Extract<UserImportPreview, { ok: true }> }) {
  const [state, apply, applying] = useActionState<UserImportState, FormData>(applyUserImportAction, { step: "idle" });

  if (state.step === "applied") {
    const changed =
      state.summary.create !== state.previewed.create || state.summary.skip !== state.previewed.skip || state.summary.error !== state.previewed.error;
    return (
      <div className="feedback" role="status">
        <p>Importação aplicada: {appliedText(state.summary)}</p>
        {changed ? <p>O resultado difere da prévia porque o banco mudou entre os dois passos; o relatório mostra o que ficou de fora.</p> : null}
        <p>As pessoas criadas estão inativas e sem senha: para cada uma, em &quot;Usuários&quot;, use &quot;Reativar&quot; e defina a senha.</p>
        <p>
          <a download href={`/api/user-imports/${state.importId}/report.csv`}>
            Baixar o relatório desta importação (CSV)
          </a>
        </p>
      </div>
    );
  }

  return (
    <form action={apply} aria-label="Aplicar a importação">
      <input name="content" type="hidden" value={preview.content} />
      <input name="digest" type="hidden" value={preview.digest} />
      <input name="create" type="hidden" value={preview.summary.create} />
      <input name="skip" type="hidden" value={preview.summary.skip} />
      <input name="error" type="hidden" value={preview.summary.error} />
      {state.step === "error" ? (
        <p className="feedback feedback-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <p className="section-description">
        Ao aplicar, as linhas válidas são criadas de uma vez, com o banco do momento; as pessoas entram inativas e sem senha. Linhas ignoradas e com erro
        ficam no relatório.
      </p>
      <button disabled={applying} type="submit">
        {applying ? "Aplicando…" : "Aplicar a importação"}
      </button>
    </form>
  );
}

function PreviewResult({ preview, fileName, texts }: { preview: UserImportPreview; fileName: string; texts: UserImportTexts }) {
  return (
    <section aria-labelledby="user-import-preview-heading" className="configuration-preview">
      <h3 id="user-import-preview-heading">Prévia de {fileName}</h3>
      {!preview.ok ? (
        <p className="feedback feedback-error" role="alert">
          O arquivo foi recusado: {texts.fileErrors[preview.error] ?? preview.error}
          {preview.line !== undefined ? ` (linha ${preview.line})` : ""} Nada foi gravado.
        </p>
      ) : (
        <>
          <p>{summaryText(preview.summary)}</p>
          <LinesTable caption="Linhas do arquivo" lineErrors={texts.lineErrors} lines={preview.lines} />
          {preview.summary.create > 0 ? (
            <ApplyForm key={preview.digest} preview={preview} />
          ) : (
            <p>Nenhuma linha a criar: não há o que aplicar.</p>
          )}
        </>
      )}
    </section>
  );
}

export function UserImport({ texts }: { texts: UserImportTexts }) {
  const [state, sendForPreview, previewing] = useActionState<UserImportState, FormData>(previewUserImportAction, { step: "idle" });

  return (
    <div>
      <form action={sendForPreview} aria-label="Enviar arquivo para a prévia" className="create-form">
        <label>
          Arquivo CSV (UTF-8, até 200 KB e {texts.maxRows} pessoas)
          <input accept="text/csv,.csv" name="file" required type="file" />
        </label>
        <button disabled={previewing} type="submit">
          {previewing ? "Conferindo…" : "Ver prévia"}
        </button>
      </form>
      {state.step === "error" ? (
        <p className="feedback feedback-error" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.step === "preview" ? <PreviewResult fileName={state.fileName} preview={state.preview} texts={texts} /> : null}
    </div>
  );
}
