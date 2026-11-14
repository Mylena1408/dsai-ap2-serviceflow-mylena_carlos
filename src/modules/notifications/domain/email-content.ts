import { notificationMessage, type MessageSource } from "@/shared/notifications";
import { requestShortCode } from "@/shared/requests";

// Content of a notification email (SPEC 2026-11-01-notificacoes-email-preferencias, 5.4): the
// notification text, the service, the short code and the links. Nothing else about the request
// (description, comments, notes, answers, documents or approval remarks) is ever passed in.

export type EmailRecipientRole = "REQUESTER" | "ATTENDANT" | "MANAGER";

export interface EmailContentSource extends MessageSource {
  requestId: string | null;
  recipientRole: EmailRecipientRole;
}

export interface EmailContent {
  subject: string;
  text: string;
}

const AREAS: Record<EmailRecipientRole, { request: string; notifications: string }> = {
  REQUESTER: { request: "/requests", notifications: "/notifications" },
  ATTENDANT: { request: "/queue", notifications: "/queue/notifications" },
  MANAGER: { request: "/approvals", notifications: "/approvals/notifications" },
};

export { requestShortCode };

/** `baseUrl` is the configured origin (APP_BASE_URL), without a trailing slash. */
export function buildNotificationEmail(source: EmailContentSource, baseUrl: string): EmailContent {
  if (source.requestId === null) throw new Error("A request notice without its request.");
  const message = notificationMessage(source);
  const area = AREAS[source.recipientRole];
  const origin = baseUrl.replace(/\/+$/, "");

  return {
    // The notification text already names the service (SPEC 5.4, clarified in SF-094).
    subject: `[ServiceFlow] ${message}`,
    text: [
      message,
      "",
      `Serviço: ${source.serviceName}`,
      `Solicitação: ${requestShortCode(source.requestId)}`,
      `Abrir: ${origin}${area.request}/${source.requestId}`,
      "",
      "Os detalhes ficam no ServiceFlow, com as regras de acesso de sempre.",
      `Para escolher o que você recebe por e-mail: ${origin}${area.notifications}/preferences`,
    ].join("\n"),
  };
}

/** The main numbers of a report (SPEC 2026-11-09-comunicacao-e-calendarios, 5.3 item 4). */
export interface ReportEmailNumbers {
  id: string;
  opened: number;
  completed: number;
  cancelled: number;
  onTimePercentage: number | null;
}

/**
 * SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 4 and 5.3 item 4 (SF-250): the email of a sector's report, sent to
 * its managers only: the period, the main numbers and the link to the report in the manager's area. No request, person
 * or tag is named.
 */
export function buildReportEmail(source: { period: string; report: ReportEmailNumbers }, baseUrl: string): EmailContent {
  const message = notificationMessage({ type: "report.ready", serviceName: source.period });
  const origin = baseUrl.replace(/\/+$/, "");
  const { report } = source;
  return {
    subject: `[ServiceFlow] ${message}`,
    text: [
      message,
      "",
      `Solicitações abertas: ${report.opened}`,
      `Concluídas: ${report.completed}`,
      `Canceladas: ${report.cancelled}`,
      `Concluídas no prazo: ${report.onTimePercentage === null ? "—" : `${report.onTimePercentage}%`}`,
      "",
      `Abrir o relatório: ${origin}${AREAS.MANAGER.request}/reports/${report.id}`,
      "",
      `Para escolher o que você recebe por e-mail: ${origin}${AREAS.MANAGER.notifications}/preferences`,
    ].join("\n"),
  };
}
