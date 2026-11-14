import { exportUserImportModel } from "@/modules/user-import";
import { ApplicationError, AuthenticationError } from "@/server/errors";

// The model of the people's file (SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 1; SF-245): only the
// administrator; a refusal answers with a short message in Portuguese, as the system's other CSVs.

const NO_STORE = "private, no-store";

export async function GET() {
  try {
    const csv = await exportUserImportModel();
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
    if (!(error instanceof ApplicationError)) throw error;
    const message = error instanceof AuthenticationError ? "Entre no ServiceFlow para baixar o modelo." : "Só o administrador baixa o modelo da importação.";
    return new Response(message, {
      status: error.status,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": NO_STORE, "X-Content-Type-Options": "nosniff" },
    });
  }
}
