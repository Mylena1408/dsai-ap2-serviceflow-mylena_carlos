// The student's quick guide (SPEC 2026-11-16-guia-do-estudante; SF-282): the steps from the first access to the
// rating, in order, for a higher-education student who uses the ServiceFlow as a requester. Like the help page, the
// content is code (section 2 item 8); every screen or button named here exists today (rule 1), and the names of the
// situations come from the constants the screens use (rule 2).

import {
  REQUEST_STATUS_LABELS,
  SLA_SITUATION_LABELS,
  type SlaSituationValue,
  type StatusValue,
} from "@/shared/requests";
import { REQUESTER_KIND_LABELS, type RequesterKind } from "@/shared/requester-kinds";
import type { HelpRole } from "./help";

/** A screen or a button as it appears; `href` only for a screen the requester can open (G2). */
export interface GuideScreen {
  label: string;
  href?: string;
}

export interface GuideStep {
  id: string;
  title: string;
  /** What to do, in short sentences. */
  actions: readonly string[];
  /** Where it is done: the names of the menu, the screen or the button. */
  screens: readonly GuideScreen[];
  tip: string;
}

export const STUDENT_GUIDE_TITLE = "Guia rápido do estudante";
export const STUDENT_GUIDE_PATH = "/help/aluno";

/** Section 2 item 2: the steps, in the order a request lives. */
export const STUDENT_GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: "entrar",
    title: "Entre no ServiceFlow",
    actions: [
      "Entre com o e-mail e a senha que a sua instituição cadastrou para você.",
      "No modo demonstração, use o botão do perfil de solicitante na tela de entrada.",
      "Se esqueceu a senha, procure o administrador do sistema; depois de entrar, troque-a quando quiser.",
    ],
    screens: [{ label: "Entrar como Solicitante" }, { label: "Alterar senha", href: "/account/password" }],
    tip: "Como aluno, você entra como solicitante: o mesmo acesso de sempre, com os serviços oferecidos aos alunos.",
  },
  {
    id: "encontrar",
    title: "Encontre o serviço certo",
    actions: [
      "Abra o catálogo: a parte \"Serviços para alunos\" reúne o que a instituição oferece aos estudantes, junto com o que vale para todos.",
      "Os serviços ficam agrupados por categoria; leia a descrição de cada um antes de escolher.",
      "Se não sabe por onde começar, o mapa mostra o que você resolve sozinho, o que precisa de atendimento e o que passa por mais de um setor.",
    ],
    screens: [
      { label: "Catálogo", href: "/catalog" },
      { label: "Serviços para alunos", href: "/catalog" },
      { label: "Mapa de serviços", href: "/catalog/map" },
    ],
    tip: "Os serviços dependem da sua instituição: por exemplo, declarações, revisão de nota ou acesso a laboratório só aparecem se ela os cadastrou.",
  },
  {
    id: "abrir",
    title: "Abra a solicitação",
    actions: [
      "Clique no serviço e descreva o que você precisa, com o máximo de detalhes que ajudem o atendimento.",
      "Preencha os campos do serviço; os obrigatórios vêm marcados.",
      "Anexe os documentos pedidos, se o serviço exigir algum.",
      "Envie: a solicitação passa a aparecer em \"Minhas solicitações\".",
    ],
    screens: [{ label: "Descreva o que você precisa" }, { label: "Enviar solicitação" }],
    tip: "Um pacote abre de uma vez vários serviços que costumam andar juntos; cada um vira uma solicitação, acompanhadas num só lugar.",
  },
  {
    id: "acompanhar",
    title: "Acompanhe o andamento",
    actions: [
      "Em \"Minhas solicitações\", veja a situação, o prazo, o setor e quem está atendendo.",
      "As novidades chegam em \"Notificações\"; abrir uma delas leva direto à solicitação.",
      "Se quiser receber também por e-mail, ligue o que interessa nas preferências; tudo começa desligado.",
    ],
    screens: [
      { label: "Minhas solicitações", href: "/requests" },
      { label: "Notificações", href: "/notifications" },
      { label: "Preferências de e-mail", href: "/notifications/preferences" },
    ],
    tip: "Algumas solicitações passam por aprovação antes do atendimento; a tela mostra quando ela está aguardando aprovação.",
  },
  {
    id: "responder",
    title: "Responda quando o atendimento pedir",
    actions: [
      "Quando a solicitação mostra \"O atendimento aguarda sua resposta\", a equipe precisa de uma informação sua.",
      "Responda com um comentário na própria solicitação; você pode anexar arquivos ao comentário.",
      "Se faltar um documento, envie-o pelo campo próprio, sem abrir outra solicitação.",
    ],
    screens: [
      { label: "O atendimento aguarda sua resposta" },
      { label: "Enviar comentário" },
      { label: "Enviar documento que falta" },
    ],
    tip: "Enquanto o atendimento espera a sua resposta, o prazo fica pausado; ele volta a contar quando você responde.",
  },
  {
    id: "cancelar-reabrir",
    title: "Cancele ou reabra, se precisar",
    actions: [
      "Desistiu? Cancele enquanto a solicitação ainda não começou a ser atendida, dizendo o motivo se quiser.",
      "O problema voltou depois da conclusão? Reabra e explique o que aconteceu; ela volta para a fila do setor.",
    ],
    screens: [{ label: "Cancelar solicitação" }, { label: "Reabrir solicitação" }],
    tip: "Reabrir mantém todo o histórico do pedido, o que ajuda mais do que abrir uma solicitação nova.",
  },
  {
    id: "avaliar",
    title: "Avalie o atendimento",
    actions: [
      "Depois da conclusão, a solicitação pergunta como foi o atendimento.",
      "Escolha uma nota e, se quiser, conte mais num comentário.",
    ],
    screens: [{ label: "Como foi o atendimento?" }, { label: "Enviar avaliação" }],
    tip: "A avaliação chega à equipe e ao gestor do setor e ajuda a melhorar o serviço para os próximos estudantes.",
  },
];

/** Section 2 item 3: what to check before sending. */
export const BEFORE_SENDING: readonly string[] = [
  "O serviço escolhido é o do seu problema (na dúvida, leia a descrição ou consulte o mapa).",
  "A descrição diz o que aconteceu, desde quando e o que você espera.",
  "Os campos obrigatórios estão preenchidos e os documentos pedidos, anexados.",
  "Não existe já uma solicitação sua aberta para o mesmo pedido em \"Minhas solicitações\".",
];

export interface GuideSituation {
  label: string;
  meaning: string;
}

const STATUS_MEANINGS: Record<StatusValue, string> = {
  OPEN: "Recebida, esperando um atendente do setor.",
  IN_PROGRESS: "Um atendente está cuidando do seu pedido.",
  COMPLETED: "O atendimento terminou; confira o resultado e avalie.",
  CANCELLED: "Encerrada sem atendimento, por você ou pela equipe.",
};

const SLA_MEANINGS: Partial<Record<SlaSituationValue, string>> = {
  on_time: "O prazo do serviço ainda está correndo, sem atraso.",
  due_soon: "O prazo está perto do fim.",
  overdue: "O prazo passou; o pedido continua no atendimento.",
  paused: "O prazo parou enquanto o atendimento espera uma resposta sua.",
};

/** Section 2 item 4: the situations with the screens' own names (rule 2). */
export function guideSituations(): { status: GuideSituation[]; deadline: GuideSituation[] } {
  const status = (Object.keys(STATUS_MEANINGS) as StatusValue[]).map((value) => ({
    label: REQUEST_STATUS_LABELS[value],
    meaning: STATUS_MEANINGS[value],
  }));
  const deadline = (Object.keys(SLA_MEANINGS) as SlaSituationValue[]).map((value) => ({
    label: SLA_SITUATION_LABELS[value],
    meaning: SLA_MEANINGS[value]!,
  }));
  return { status, deadline };
}

/** Section 2 item 5: what the student does alone and what needs a request. */
export const ON_YOUR_OWN: readonly GuideScreen[] = [
  { label: "Meus dados", href: "/account/data" },
  { label: "Alterar senha", href: "/account/password" },
  { label: "Preferências de e-mail", href: "/notifications/preferences" },
  { label: "Ajuda", href: "/help" },
];

export const NEEDS_ATTENDANCE =
  "Tudo o que depende de alguém da instituição (um documento, uma autorização, um conserto, um acesso) precisa de uma solicitação. O \"Mapa de serviços\" separa o que você resolve sozinho do que precisa de atendimento e do que é especializado, porque passa por mais de um setor ou etapa.";

export interface GuideViewer {
  role: HelpRole | null;
  /** Only for a requester (G3). */
  requesterKind?: RequesterKind | null;
}

export interface GuideNotice {
  /** "staff": a professor or a technician (SPEC 2026-11-16-professores-e-tecnicos, part B). */
  kind: "anonymous" | "student" | "public" | "staff" | "other";
  text: string;
}

/** Section 2 item 6: the notice at the top, by profile and, for a requester, by kind. */
export function guideNoticeFor(viewer: GuideViewer): GuideNotice {
  if (viewer.role === null) {
    return {
      kind: "anonymous",
      text: "Você ainda não entrou. Leia os passos e, quando estiver pronto, entre com o acesso que a sua instituição forneceu.",
    };
  }
  if (viewer.role !== "REQUESTER") {
    return {
      kind: "other",
      text: "Este guia descreve a área do solicitante, que é a usada pelos estudantes. O seu perfil tem outras telas; veja a Ajuda.",
    };
  }
  // SPEC 2026-11-16-professores-e-tecnicos, part B: a professor or a technician has a guide of their own.
  if (viewer.requesterKind === "PROFESSOR" || viewer.requesterKind === "TECHNICIAN") {
    return {
      kind: "staff",
      text: `Você está cadastrado como ${REQUESTER_KIND_LABELS[viewer.requesterKind].toLowerCase()}. Os passos valem para você; veja também o guia de professores e técnicos, com reservas de espaços e provas.`,
    };
  }
  if (viewer.requesterKind === "PUBLIC") {
    return {
      kind: "public",
      text: `Você está cadastrado como ${REQUESTER_KIND_LABELS.PUBLIC.toLowerCase()}. Os passos valem para você, mas o seu catálogo mostra os serviços para o público geral, e não os dos alunos.`,
    };
  }
  return {
    kind: "student",
    text: `Você está cadastrado como ${REQUESTER_KIND_LABELS.STUDENT.toLowerCase()}: este guia é para você. Os nomes das telas abaixo são links.`,
  };
}

/** G2: the screens become links only for a requester, who can open them. */
export function guideLinksEnabled(viewer: GuideViewer): boolean {
  return viewer.role === "REQUESTER";
}

/** Every screen or button the guide names, to check that they exist (CA-GUI-04). */
export function guideScreenLabels(): string[] {
  const labels = [...STUDENT_GUIDE_STEPS.flatMap((step) => step.screens), ...ON_YOUR_OWN].map(({ label }) => label);
  return [...new Set(labels)];
}
