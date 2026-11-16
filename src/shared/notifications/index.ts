/** Kinds of notification (SPEC 2026-10-31-eventos-outbox-jobs, 8.1, and later SPECs). */
export type NotificationType =
  | "status.IN_PROGRESS"
  | "status.COMPLETED"
  | "status.CANCELLED"
  | "status.OPEN"
  // SPEC 2026-11-08-atendimento-dia-a-dia, 8.3 item 2.
  | "status.DUPLICATE"
  | "assignment.received"
  | "comment.public"
  | "comment.internal"
  // SPEC 2026-11-08-atendimento-dia-a-dia, 7.3 item 2.
  | "comment.mention"
  | "sla.warning"
  | "sla.breached"
  // SPEC 2026-11-06-escalonamento, 4.5.
  | "sla.escalated"
  | "stage.changed"
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  // SPEC 2026-11-06-aprofundamento-configurabilidade, 4.3.6.
  | "approval.overdue"
  // 5.3.2.
  | "stage.overdue"
  | "sector.received"
  | "sector.changed"
  | "document.added"
  | "sla.paused"
  // SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 4 (SF-250): the only kind that points to a report, not a request.
  | "report.ready"
  // SPEC 2026-11-16-professores-e-tecnicos, P14: notices of a space reservation or of an exam request (no e-mail).
  | "reservation.pending"
  | "reservation.confirmed"
  | "reservation.refused"
  | "reservation.cancelled"
  | "exam.pending"
  | "exam.allocated"
  | "exam.refused"
  | "exam.cancelled";

// Text of each notification (SPEC 2026-10-31-eventos-outbox-jobs, section 8.2), shared by the
// in-app list and the emails (SPEC 2026-11-01-notificacoes-email-preferencias, 5.4). Messages are
// built from the type and the service name; no comment, note or reason text is ever copied.

const MESSAGES: Record<NotificationType, (service: string, stage?: string) => string> = {
  "status.IN_PROGRESS": (service) => `Atendimento iniciado: ${service}`,
  "status.COMPLETED": (service) => `Solicitação concluída: ${service}`,
  "status.CANCELLED": (service) => `Solicitação cancelada: ${service}`,
  "status.OPEN": (service) => `Solicitação reaberta: ${service}`,
  "status.DUPLICATE": (service) => `Encerrada como duplicada; você passa a acompanhar a original: ${service}`,
  "assignment.received": (service) => `Uma solicitação foi transferida para você: ${service}`,
  "comment.public": (service) => `Novo comentário em ${service}`,
  "comment.internal": (service) => `Nova nota interna em ${service}`,
  "comment.mention": (service) => `Você foi mencionado numa nota interna em ${service}`,
  "sla.warning": (service) => `Prazo próximo do vencimento: ${service}`,
  "sla.breached": (service) => `Prazo vencido: ${service}`,
  "sla.escalated": (service) => `Solicitação vencida escalada: ${service}`,
  "approval.requested": (service) => `Aprovação pendente: ${service}`,
  "approval.approved": (service) => `Solicitação aprovada: ${service}`,
  "approval.rejected": (service) => `Solicitação rejeitada: ${service}`,
  "approval.overdue": (service) => `Aprovação atrasada: ${service}`,
  "stage.overdue": (service) => `Etapa atrasada: ${service}`,
  // SPEC 2026-11-03-transferencia-entre-setores, 5.6.
  "sector.received": (service) => `Solicitação encaminhada ao seu setor: ${service}`,
  "sector.changed": (service) => `Solicitação encaminhada a outro setor: ${service}`,
  // SPEC 2026-11-03-anexos-comentarios-documentos, 5.3.6.
  "document.added": (service) => `Novo documento em ${service}`,
  // SPEC 2026-11-03-pausa-sla-calendario, 5.6.
  "sla.paused": (service) => `Aguardando sua resposta: ${service}`,
  // SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 4: here the "service" is the report's period.
  "report.ready": (period) => `Relatório disponível: ${period}`,
  // SPEC 2026-11-16-professores-e-tecnicos, P14: here the "service" is the space, or the exam's course and class.
  "reservation.pending": (space) => `Nova reserva para confirmar: ${space}`,
  "reservation.confirmed": (space) => `Reserva confirmada: ${space}`,
  "reservation.refused": (space) => `Reserva recusada: ${space}`,
  "reservation.cancelled": (space) => `Reserva cancelada pelo setor: ${space}`,
  "exam.pending": (exam) => `Novo pedido de alocação de prova: ${exam}`,
  "exam.allocated": (exam) => `Prova alocada: ${exam}`,
  "exam.refused": (exam) => `Pedido de prova recusado: ${exam}`,
  "exam.cancelled": (exam) => `Pedido de prova cancelado pelo professor: ${exam}`,
  // The stage name is missing once the event is purged (after 30 days).
  "stage.changed": (service, stage) =>
    stage ? `Sua solicitação passou para a etapa ${stage}: ${service}` : `Sua solicitação mudou de etapa: ${service}`,
};

export interface MessageSource {
  type: NotificationType;
  /** The service of the request; for "report.ready", the report's period ("Semana de 09/11 a 15/11/2026"). */
  serviceName: string;
  stageName?: string;
  /** SPEC 2026-11-06-aprofundamento-configurabilidade, 7.3 item 4: the rule that warned. */
  ruleName?: string;
}

export function notificationMessage(notification: MessageSource): string {
  // A rule's warning names the rule; the option's keeps its text (SPEC de escalonamento, 4.5).
  if (notification.type === "sla.escalated" && notification.ruleName) {
    return `Escalonamento "${notification.ruleName}": ${notification.serviceName}`;
  }
  return (MESSAGES[notification.type] ?? ((service: string) => `Novidade em ${service}`))(
    notification.serviceName,
    notification.stageName,
  );
}

/**
 * Names of the email categories (SPEC 2026-11-01-notificacoes-email-preferencias, 5.1), shared by
 * the preferences page and "Meus dados" (SPEC 2026-11-02-auditoria-lgpd, 5.4).
 */
export const NOTIFICATION_CATEGORY_LABELS = {
  STATUS: "Mudanças de status",
  ASSIGNMENT: "Solicitações transferidas para você",
  COMMENTS: "Comentários e notas internas",
  SLA: "Prazos próximos e vencidos",
  STAGES: "Mudanças de etapa",
  APPROVALS: "Aprovações",
  // SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 4: offered to managers only.
  REPORTS: "Relatórios periódicos do setor",
} as const;
