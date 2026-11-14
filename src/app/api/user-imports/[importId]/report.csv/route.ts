import { exportUserImportReport } from "@/modules/user-import";
import { ApplicationError, AuthenticationError, AuthorizationError, NotFoundError } from "@/server/errors";

// The error report of an import in CSV (SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 4; SF-244): only the
// administrator; a refusal answers with a short message in Portuguese, as the system's other CSVs.

const NO_STORE = "private, no-store";

type ImportReportRouteContext = { params: Promise<{ importId: string }> };

function refusal(error: ApplicationError): Response {
  let message = "Não foi possível exportar. Volte ao histórico de importações e tente de novo.";
  if (error instanceof AuthenticationError) message = "Entre no ServiceFlow para exportar.";
  else if (error instanceof AuthorizationError) message = "Só o administrador baixa o relatório de uma importação.";
  else if (error instanceof NotFoundError || error.code === "VALIDATION_ERROR") message = "Importação não encontrada.";
  return new Response(message, {
    status: error instanceof NotFoundError || error.code === "VALIDATION_ERROR" ? 404 : error.status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": NO_STORE, "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(_request: Request, { params }: ImportReportRouteContext) {
  const { importId } = await params;
  try {
    const csv = await exportUserImportReport(importId);
    return new Response(csv.content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csv.fileName}"`,
        "Cache-Control": NO_STORE,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ApplicationError) return refusal(error);
    throw error;
  }
}
