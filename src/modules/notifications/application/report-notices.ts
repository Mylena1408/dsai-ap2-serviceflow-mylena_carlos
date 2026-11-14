import { wantsEmail, type NotificationCategory } from "../domain/email";

// The notice of a new periodic report (SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 4 and 5.3 item 4; decision
// K3; SF-250): when the report of a sector is written, each active manager of that sector gets a notice in the
// application and, if they chose "Relatórios", an email. Nobody else is warned: the administrator reads every report in
// the administration, and the organization's report has no manager. Written in the same transaction as the report, so
// a report never stays without its notices nor gets them twice.

export interface ReportNoticeWriter {
  /** Active managers of the sector. */
  sectorManagerIds(sectorId: string): Promise<string[]>;
  /** Categories with email on, per user. */
  emailCategories(userIds: string[]): Promise<Map<string, Set<NotificationCategory>>>;
  /** Idempotent per (report, person); a pending email for each new notice with `sendEmail`. Returns how many were new. */
  insert(notices: Array<{ reportId: string; recipientId: string; createdAt: Date; sendEmail: boolean }>): Promise<number>;
}

export interface WrittenReport {
  id: string;
  /** Null for the organization's report. */
  sectorId: string | null;
  generatedAt: Date;
}

/** How many notices were written. */
export async function noticeReportManagers(report: WrittenReport, writer: ReportNoticeWriter): Promise<number> {
  if (report.sectorId === null) return 0;
  const managerIds = await writer.sectorManagerIds(report.sectorId);
  if (managerIds.length === 0) return 0;
  // The preference at this moment decides, as for the other notices.
  const categories = await writer.emailCategories(managerIds);
  return writer.insert(
    managerIds.map((recipientId) => ({
      reportId: report.id,
      recipientId,
      createdAt: report.generatedAt,
      sendEmail: wantsEmail("report.ready", categories.get(recipientId) ?? new Set()),
    })),
  );
}
