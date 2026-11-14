import Link from "next/link";
import { notFound } from "next/navigation";
import { getPeriodicReport, type PeriodicReportDetail } from "@/modules/periodic-reports";
import { NotFoundError, ValidationError } from "@/server/errors";
import { PeriodicReportView } from "@/app/_components/periodic-reports";
import { requireManagerPageAccess } from "../../../page-access";

// One report of the manager's sector (SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 3; SF-249); another sector's,
// or one that does not exist, is "not found".

export default async function ManagerReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  await requireManagerPageAccess();
  const { reportId } = await params;
  let report: PeriodicReportDetail;
  try {
    report = await getPeriodicReport(reportId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) notFound();
    throw error;
  }

  return (
    <main className="page-shell">
      <p>
        <Link href="/approvals/reports">Voltar aos relatórios</Link>
      </p>
      <PeriodicReportView report={report} />
    </main>
  );
}
