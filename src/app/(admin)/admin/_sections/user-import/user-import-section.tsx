import { TableScroll } from "@/app/_components/table-scroll";
import { formatAnnouncementInstant } from "@/modules/announcements";
import { IMPORT_FILE_ERROR_LABELS, IMPORT_LINE_ERROR_LABELS, MAX_IMPORT_ROWS, type UserImportHistoryItem } from "@/modules/user-import";
import { UserImport } from "./user-import";

// The section "Importar usuários" of the administration (SPEC 2026-11-09-comunicacao-e-calendarios, part B; SF-245): the
// model, the import with its preview, and the history with each import's error report.

export function UserImportSection({ history }: { history: readonly UserImportHistoryItem[] }) {
  return (
    <section aria-labelledby="user-import-heading" className="admin-section surface-card content-section">
      <h2 id="user-import-heading">Importar usuários</h2>
      <p className="section-description">
        Envie um CSV com as colunas nome, email, perfil e setor e, se quiser, tipo (aluno, professor, técnico ou público geral, só para
        solicitante; vazia, a pessoa entra como aluno). O sistema mostra o resultado de cada linha antes de gravar. As pessoas entram inativas e
        sem senha: para cada uma, em &quot;Usuários&quot;, use &quot;Reativar&quot; e defina a senha. Nenhuma senha vai no arquivo.
      </p>
      <p>
        <a download href="/api/user-imports/model.csv">
          Baixar o modelo (CSV)
        </a>{" "}
        <span className="metadata">Troque as duas linhas de exemplo pelas pessoas da organização.</span>
      </p>
      <UserImport texts={{ fileErrors: IMPORT_FILE_ERROR_LABELS, lineErrors: IMPORT_LINE_ERROR_LABELS, maxRows: MAX_IMPORT_ROWS }} />

      <h3>Importações anteriores</h3>
      {history.length === 0 ? (
        <p className="section-description">Nenhuma importação ainda.</p>
      ) : (
        <TableScroll label="Importações anteriores">
          <table className="data-table">
            <caption>Importações anteriores</caption>
            <thead>
              <tr>
                <th scope="col">Quando</th>
                <th scope="col">Quem</th>
                <th scope="col">Criadas</th>
                <th scope="col">Ignoradas</th>
                <th scope="col">Com erro</th>
                <th scope="col">Relatório</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{formatAnnouncementInstant(item.createdAt)}</td>
                  <td>{item.actorName}</td>
                  <td>{item.createdCount}</td>
                  <td>{item.skippedCount}</td>
                  <td>{item.errorCount}</td>
                  <td>
                    <a aria-label={`Relatório da importação de ${formatAnnouncementInstant(item.createdAt)}`} download href={`/api/user-imports/${item.id}/report.csv`}>
                      CSV
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </section>
  );
}
