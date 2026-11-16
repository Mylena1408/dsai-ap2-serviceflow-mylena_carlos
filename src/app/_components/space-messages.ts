import { SLOT_PROBLEM_LABELS, dayLabel, type DayProblem } from "@/modules/spaces";

// The messages of the spaces' screens (SPEC 2026-11-16-professores-e-tecnicos, parts C to E), shared by the pages and
// their actions: a refusal comes back as a short code in the address, never as free text.

const PROBLEM_CODES = Object.keys(SLOT_PROBLEM_LABELS) as Array<keyof typeof SLOT_PROBLEM_LABELS>;

/** P8: the dates with a problem, as "2026-11-23:holiday,2026-11-30:conflict" (the address keeps it short). */
export function problemsParameter(problems: readonly DayProblem[]): string {
  return problems
    .slice(0, 26)
    .map(({ day, problem }) => `${day}:${problem}`)
    .join(",");
}

/** The dates and problems read back from the address; anything else is ignored. */
export function problemsOf(raw: unknown): Array<{ day: string; text: string }> {
  if (typeof raw !== "string" || raw.length > 2000) return [];
  return raw.split(",").flatMap((item) => {
    const [day, code] = item.split(":");
    if (!day || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day) || !PROBLEM_CODES.includes(code as (typeof PROBLEM_CODES)[number])) return [];
    return [{ day: dayLabel(day), text: SLOT_PROBLEM_LABELS[code as (typeof PROBLEM_CODES)[number]] }];
  });
}

const ERRORS: Record<string, string> = {
  invalid: "Confira os campos: algum valor está fora do permitido.",
  missing: "Não encontrado ou indisponível.",
  state: "Esta ação não é mais possível (a situação mudou ou o horário já passou).",
  overlap: "Outra pessoa reservou esse horário agora mesmo. Escolha outro horário.",
  denied: "Esta ação não está disponível para o seu perfil.",
  name: "Já existe um espaço com esse nome no setor.",
  small: "Os espaços escolhidos não comportam todos os alunos.",
};

export function spaceErrorText(code: unknown): string | null {
  return typeof code === "string" ? (ERRORS[code] ?? null) : null;
}

const NOTICES: Record<string, string> = {
  cancelled: "Cancelamento registrado.",
  requested: "Pedido de alocação enviado ao setor.",
  confirmed: "Reserva confirmada.",
  refused: "Reserva recusada.",
  "sector-cancelled": "Reserva cancelada.",
  allocated: "Prova alocada.",
  "exam-refused": "Pedido de prova recusado.",
  created: "Espaço cadastrado.",
  updated: "Espaço atualizado.",
  activated: "Espaço reativado.",
  deactivated: "Espaço desativado.",
};

export function spaceNoticeText(code: unknown): string | null {
  return typeof code === "string" ? (NOTICES[code] ?? null) : null;
}

/** "23/11/2026, 08:00 às 10:00", in the organization's time zone. */
export function periodText(startsAt: Date, endsAt: Date, timeZone = "America/Sao_Paulo"): string {
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(startsAt);
  const clock = (instant: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
  return `${day}, ${clock(startsAt)} às ${clock(endsAt)}`;
}
