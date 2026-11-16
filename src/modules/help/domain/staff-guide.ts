import { REQUESTER_KIND_LABELS } from "@/shared/requester-kinds";
import type { GuideNotice, GuideScreen, GuideStep, GuideViewer } from "./student-guide";

// The quick guide of professors and administrative technicians (SPEC 2026-11-16-professores-e-tecnicos, part B;
// SF-293): asking for a service, reserving a space (also every week), following and cancelling the reservations and,
// for professors, asking for an exam's allocation. The same rules as the student's guide: every screen or button named
// exists (checked by a test), links only for a requester.

export const STAFF_GUIDE_TITLE = "Guia rápido de professores e técnicos";
export const STAFF_GUIDE_PATH = "/help/servidores";

export interface StaffGuideStep extends GuideStep {
  /** Part B item 1: the exam's step is presented to professors. */
  onlyProfessors?: boolean;
}

export const STAFF_GUIDE_STEPS: readonly StaffGuideStep[] = [
  {
    id: "entrar",
    title: "Entre e confira o seu tipo",
    actions: [
      "Entre com o e-mail e a senha que a instituição cadastrou para você.",
      "O administrador marca no seu cadastro se você é professor ou técnico-administrativo; o catálogo mostra os serviços oferecidos ao seu tipo.",
    ],
    screens: [{ label: "Entrar como Solicitante" }, { label: "Alterar senha", href: "/account/password" }],
    tip: "Se o catálogo não mostrar a parte de professores ou de técnicos, peça ao administrador para conferir o seu tipo de solicitante.",
  },
  {
    id: "servicos",
    title: "Peça um serviço",
    actions: [
      "No catálogo, a sua parte reúne os serviços oferecidos a professores ou a técnicos e os que valem para todos.",
      "Escolha o serviço, descreva o que precisa e envie; acompanhe em \"Minhas solicitações\".",
    ],
    screens: [
      { label: "Catálogo", href: "/catalog" },
      { label: "Enviar solicitação" },
      { label: "Minhas solicitações", href: "/requests" },
    ],
    tip: "O mapa de serviços mostra o que você resolve sozinho e o que passa por mais de um setor.",
  },
  {
    id: "reservar",
    title: "Reserve uma sala ou um laboratório",
    actions: [
      "Abra \"Espaços\", filtre pelo tipo, pela capacidade ou pelo setor e escolha o espaço.",
      "Veja a semana do espaço: os horários ocupados mostram quem reservou e para quê.",
      "Informe a finalidade, a descrição, o número de pessoas, a data e o horário, das 07:00 às 23:00, de 15 em 15 minutos.",
    ],
    screens: [{ label: "Espaços", href: "/spaces" }, { label: "Reservar" }],
    tip: "Alguns espaços confirmam na hora; nos outros, a reserva fica pendente até a equipe do setor confirmar.",
  },
  {
    id: "semanal",
    title: "Repita a reserva toda semana",
    actions: [
      "Para uma aula do semestre, informe até quando repetir: a mesma hora, no mesmo dia da semana, até 26 datas.",
      "Se alguma data estiver ocupada ou for feriado, nada é gravado e a tela lista as datas com problema.",
    ],
    screens: [{ label: "Repetir toda semana até (opcional)" }],
    tip: "Ajuste a data final para pular a semana com feriado, ou reserve as datas antes e depois separadamente.",
  },
  {
    id: "acompanhar",
    title: "Acompanhe e cancele as suas reservas",
    actions: [
      "Em \"Minhas reservas\", veja se cada reserva está pendente, confirmada, recusada ou cancelada.",
      "Até a reserva começar, cancele só aquela data ou também as próximas da série.",
      "As respostas do setor chegam em \"Notificações\".",
    ],
    screens: [
      { label: "Minhas reservas", href: "/spaces/reservations" },
      { label: "Cancelar reserva" },
      { label: "Notificações", href: "/notifications" },
    ],
    tip: "Cancelar a tempo libera o horário na hora para outra pessoa.",
  },
  {
    id: "prova",
    title: "Peça a alocação de uma prova",
    onlyProfessors: true,
    actions: [
      "Em \"Alocação de provas\", informe a disciplina, a turma, a data, o horário, o número de alunos e o tipo de espaço.",
      "A equipe do setor escolhe uma ou mais salas livres que comportem todos os alunos e confirma.",
      "Quando a prova for alocada, as salas aparecem em \"Minhas provas\"; até a prova, você pode cancelar o pedido.",
    ],
    screens: [{ label: "Alocação de provas", href: "/spaces/exams" }, { label: "Pedir alocação" }],
    tip: "Use as observações para pedidos como acessibilidade: a equipe vê o texto ao escolher as salas.",
  },
];

/** Part B item 2: the notice of each profile and kind. */
export function staffGuideNoticeFor(viewer: GuideViewer): GuideNotice {
  if (viewer.role === null) {
    return { kind: "anonymous", text: "Você ainda não entrou. Leia os passos e entre com o acesso que a instituição forneceu." };
  }
  if (viewer.role !== "REQUESTER") {
    return { kind: "other", text: "Este guia descreve a área do solicitante usada por professores e técnicos. O seu perfil tem outras telas; veja a Ajuda." };
  }
  if (viewer.requesterKind === "PROFESSOR" || viewer.requesterKind === "TECHNICIAN") {
    return {
      kind: "staff",
      text: `Você está cadastrado como ${REQUESTER_KIND_LABELS[viewer.requesterKind].toLowerCase()}: este guia é para você. Os nomes das telas abaixo são links.`,
    };
  }
  return {
    kind: "student",
    text: "Este guia é de professores e técnicos. Os passos de reserva valem para você também; para os serviços, veja o guia do estudante.",
  };
}

/** Every screen or button the guide names, to check that they exist (CA-PRT-05). */
export function staffGuideScreenLabels(): string[] {
  return [...new Set(STAFF_GUIDE_STEPS.flatMap((step) => step.screens as readonly GuideScreen[]).map(({ label }) => label))];
}
