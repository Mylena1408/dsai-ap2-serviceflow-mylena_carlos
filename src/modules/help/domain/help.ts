// The help page and its frequent questions (SPEC 2026-11-15-ajuda-faq; SF-271). Each answer describes what exists
// today, naming the screen as it appears in the menu (rule 1). The content is code, reviewed as the rest of it: no
// table, no editing screen.

export type HelpRole = "ADMIN" | "REQUESTER" | "ATTENDANT" | "MANAGER";

export interface HelpQuestion {
  id: string;
  question: string;
  answer: string;
}

export interface HelpTopic {
  id: string;
  title: string;
  /** "everyone" is shown even without a session (rule 3); a role, only to that profile. */
  audience: "everyone" | HelpRole;
  description: string;
  questions: HelpQuestion[];
}

/** Rule 5: what is searched is at most this long, once trimmed. */
export const MAX_HELP_QUERY_LENGTH = 100;

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "primeiros-passos",
    title: "Primeiros passos",
    audience: "everyone",
    description: "O que é o ServiceFlow e como ele está organizado.",
    questions: [
      {
        id: "o-que-e",
        question: "O que é o ServiceFlow?",
        answer:
          "É o sistema onde a organização recebe e atende as solicitações de serviços internos. Quem precisa de algo escolhe o serviço no catálogo e abre uma solicitação; a equipe do setor responsável atende; o gestor aprova quando o serviço exige e acompanha os números do setor.",
      },
      {
        id: "perfis",
        question: "Quais são os perfis de uso?",
        answer:
          "Solicitante (abre e acompanha solicitações), atendente (atende a fila do seu setor), gestor (aprova, acompanha o setor e configura o que é do setor) e administrador (cadastra setores, serviços, pessoas e as regras da organização). Cada perfil vê só as telas e as solicitações que lhe cabem.",
      },
      {
        id: "como-entrar",
        question: "Como eu entro no sistema?",
        answer:
          "Na tela de entrada, no modo demonstração, escolha um dos perfis para explorar o sistema. Numa instalação de verdade, cada pessoa entra com o e-mail e a senha que o administrador cadastrou.",
      },
      {
        id: "avisos",
        question: "O que é a faixa de avisos no topo da tela?",
        answer:
          "São comunicados da administração, como uma manutenção programada. Os avisos de informação podem ser dispensados no botão \"Dispensar\"; os de atenção e as manutenções ficam até o fim. Todos ficam guardados na página \"Avisos\", no menu, enquanto houver algum.",
      },
    ],
  },
  {
    id: "conta-e-acesso",
    title: "Conta e acesso",
    audience: "everyone",
    description: "Senha, dados pessoais, notificações e acesso por outros sistemas.",
    questions: [
      {
        id: "esqueci-senha",
        question: "Esqueci minha senha. O que faço?",
        answer:
          "Procure o administrador da sua organização: ele define uma nova senha na seção \"Usuários\" da administração. Depois de entrar, você pode trocá-la em \"Alterar senha\".",
      },
      {
        id: "alterar-senha",
        question: "Como altero minha senha?",
        answer: "No menu, abra \"Alterar senha\", informe a senha atual e a nova duas vezes.",
      },
      {
        id: "nao-consigo-entrar",
        question: "Minha conta foi criada por importação e não consigo entrar.",
        answer:
          "Quem chega por importação de usuários é cadastrado inativo e sem senha, por segurança. O administrador precisa ativar a conta e definir a senha na seção \"Usuários\".",
      },
      {
        id: "meus-dados",
        question: "Onde vejo os dados que o sistema guarda sobre mim?",
        answer:
          "Em \"Meus dados\", no menu. Lá você vê e baixa, num arquivo, o seu cadastro, as suas solicitações, os seus comentários, as notificações recentes e as preferências de e-mail.",
      },
      {
        id: "notificacoes",
        question: "Como funcionam as notificações e os e-mails?",
        answer:
          "As notificações aparecem em \"Notificações\", no menu, com o número das não lidas; abrir uma delas leva à solicitação. Em \"Preferências de e-mail\", na mesma página, você escolhe o que também quer receber por e-mail; tudo começa desligado.",
      },
      {
        id: "api",
        question: "Posso usar o ServiceFlow a partir de outro sistema?",
        answer:
          "Sim. Em \"Acesso à API\", no menu, você cria um token pessoal com escopo de leitura ou de escrita e uma validade. Com ele, outro sistema age em seu nome, com as mesmas regras da tela. A descrição das rotas está em /api/v1/openapi.json.",
      },
    ],
  },
  {
    id: "solicitante",
    title: "Para quem pede serviços",
    audience: "REQUESTER",
    description: "Como abrir, acompanhar e encerrar as suas solicitações.",
    questions: [
      {
        id: "abrir",
        question: "Como abro uma solicitação?",
        answer:
          "Em \"Catálogo\", escolha o serviço, descreva o que precisa, preencha os campos do serviço e anexe os documentos exigidos, se houver. Depois clique em \"Enviar solicitação\". Ela aparece em \"Minhas solicitações\".",
      },
      {
        id: "pacote",
        question: "O que é um pacote de serviços?",
        answer:
          "É um conjunto de serviços que costumam ser pedidos juntos (por exemplo, a chegada de uma pessoa nova). Ao abrir um pacote, o sistema abre uma solicitação para cada serviço, na ordem do pacote, e você acompanha todas num só lugar.",
      },
      {
        id: "prazo",
        question: "O que quer dizer o prazo da minha solicitação?",
        answer:
          "É o vencimento combinado pelo serviço. Alguns serviços contam só horas úteis, do calendário do setor ou da organização. Quando o atendente pausa o prazo para esperar uma resposta sua, o relógio para até você responder.",
      },
      {
        id: "aguardando",
        question: "Minha solicitação está \"aguardando a sua resposta\". O que faço?",
        answer:
          "O atendente precisa de uma informação. Abra a solicitação em \"Minhas solicitações\" e responda com um comentário em \"Enviar comentário\"; o prazo volta a contar na hora.",
      },
      {
        id: "cancelar",
        question: "Como cancelo uma solicitação?",
        answer: "Abra a solicitação e use \"Cancelar solicitação\" enquanto ela ainda não começou a ser atendida. Você pode dizer o motivo.",
      },
      {
        id: "reabrir",
        question: "O problema voltou depois da conclusão. Posso reabrir?",
        answer: "Sim. Na solicitação concluída, use \"Reabrir solicitação\" e explique o que voltou a acontecer; ela volta para a fila do setor.",
      },
      {
        id: "avaliar",
        question: "Como avalio o atendimento?",
        answer: "Depois da conclusão, a solicitação mostra a avaliação: escolha uma nota, escreva um comentário se quiser e clique em \"Enviar avaliação\".",
      },
      {
        id: "acompanhar",
        question: "Posso acompanhar a solicitação de um colega?",
        answer:
          "Sim, quando o colega permite ou quando você é citado nela. Use \"Acompanhar\" e ela passa a aparecer em \"Que eu acompanho\", com as notificações das mudanças.",
      },
    ],
  },
  {
    id: "atendente",
    title: "Para quem atende",
    audience: "ATTENDANT",
    description: "A fila do setor e o atendimento de cada solicitação.",
    questions: [
      {
        id: "fila",
        question: "Onde vejo o que tenho para atender?",
        answer:
          "Em \"Fila do meu setor\": filtre por situação, prioridade, prazo ou etiqueta e salve as buscas que usa sempre. \"Meu painel\" mostra a fila agora e o seu trabalho no período.",
      },
      {
        id: "assumir",
        question: "Como começo a atender uma solicitação?",
        answer:
          "Abra a solicitação, clique em \"Assumir\" e depois em \"Iniciar atendimento\". Se não puder seguir com ela, use \"Liberar\" para devolvê-la à fila ou \"Transferir\" para um colega do setor.",
      },
      {
        id: "concluir",
        question: "Como concluo uma solicitação?",
        answer:
          "Com o atendimento iniciado e o checklist obrigatório em dia, clique em \"Concluir solicitação\". O solicitante é avisado e pode avaliar o atendimento.",
      },
      {
        id: "encaminhar",
        question: "A solicitação é de outro setor. O que faço?",
        answer:
          "Enquanto ela estiver aberta, use \"Encaminhar para outro setor\" e diga o motivo. Ela vai para a fila do outro setor e o prazo combinado na abertura continua o mesmo.",
      },
      {
        id: "pausar",
        question: "Preciso de uma informação do solicitante. Como paro o prazo?",
        answer:
          "Use \"Pausar prazo (aguardando o solicitante)\" e escreva o que precisa. O solicitante é avisado; quando ele responde, ou quando você usa \"Retomar prazo\", o relógio volta a contar.",
      },
      {
        id: "nota-interna",
        question: "Como converso com a equipe sem o solicitante ver?",
        answer:
          "Escreva uma nota interna na solicitação. Para chamar um colega, cite-o com @ e o nome; ele recebe a menção em \"Menções\".",
      },
      {
        id: "respostas-prontas",
        question: "Existem respostas prontas?",
        answer: "Sim. Em \"Respostas prontas\" ficam os textos do setor, que você insere no comentário e ajusta antes de enviar.",
      },
      {
        id: "duplicada",
        question: "Recebi duas solicitações iguais. O que faço?",
        answer:
          "Na repetida, use \"Encerrar como duplicada\" e indique a original. O solicitante passa a acompanhar a original e é avisado.",
      },
      {
        id: "horas",
        question: "Como registro o tempo de atendimento?",
        answer: "Na solicitação, use \"Lançar horas\" com o dia, o tempo e uma descrição curta. As horas aparecem nos relatórios do setor.",
      },
      {
        id: "ausencias",
        question: "Vou ficar fora alguns dias. Como aviso?",
        answer:
          "Cadastre o período em \"Minhas ausências\". Conforme a regra do setor, as suas solicitações podem passar para colegas enquanto você estiver fora.",
      },
    ],
  },
  {
    id: "gestor",
    title: "Para quem gerencia um setor",
    audience: "MANAGER",
    description: "Aprovações, números do setor e o que o gestor configura.",
    questions: [
      {
        id: "aprovar",
        question: "Como aprovo ou rejeito uma solicitação?",
        answer:
          "Em \"Aprovações\", abra a solicitação e use \"Aprovar\" ou \"Rejeitar\", com uma observação se quiser. Com vários níveis, ela segue para o próximo setor depois da sua decisão.",
      },
      {
        id: "substituto",
        question: "Vou me ausentar. Quem aprova no meu lugar?",
        answer: "Cadastre o período e um substituto em \"Ausências\"; durante o período, o substituto decide as aprovações do seu setor.",
      },
      {
        id: "numeros",
        question: "Onde vejo os números do setor?",
        answer:
          "\"Painel do setor\" mostra a situação agora; \"Análises\" mostra tendências, tempos, prazos, satisfação e a equipe num período; \"Horas\" mostra o tempo lançado.",
      },
      {
        id: "relatorios",
        question: "O que são os relatórios periódicos?",
        answer:
          "Quando o administrador liga o relatório semanal ou mensal, o sistema guarda os números do período do seu setor e avisa você. Eles ficam em \"Relatórios\", no menu, e os mais recentes aparecem em \"Análises\".",
      },
      {
        id: "agendas",
        question: "Como faço uma solicitação se repetir sozinha?",
        answer: "Em \"Agendas\", cadastre o serviço, quem pede e a frequência; o sistema abre a solicitação no dia certo.",
      },
      {
        id: "configurar-setor",
        question: "O que posso configurar no meu setor?",
        answer:
          "\"Etiquetas\" e \"Checklists\" dos serviços do setor, o \"Calendário\" do setor (expediente e feriados próprios) e os \"Afastamentos da equipe\".",
      },
      {
        id: "calendario",
        question: "Para que serve o calendário do setor?",
        answer:
          "Nos serviços com prazo em horas úteis, as solicitações abertas depois contam o prazo pelo expediente e pelos feriados do seu setor. As que já estavam abertas não mudam. Sem expediente próprio, vale o da organização.",
      },
    ],
  },
  {
    id: "administracao",
    title: "Para quem administra",
    audience: "ADMIN",
    description: "Cadastros e regras da organização.",
    questions: [
      {
        id: "pessoas",
        question: "Como cadastro as pessoas?",
        answer:
          "Na seção \"Usuários\", uma a uma, ou em \"Importar usuários\", por um arquivo CSV com prévia linha a linha. Os importados chegam inativos e sem senha; ative e defina a senha em \"Usuários\".",
      },
      {
        id: "catalogo",
        question: "Como monto o catálogo de serviços?",
        answer:
          "Cadastre \"Setores\" e \"Categorias\" e depois os \"Serviços\", com prazo, prioridade, aprovação, campos do formulário, etapas e documentos exigidos. \"Pacotes\" junta serviços pedidos juntos.",
      },
      {
        id: "calendario-org",
        question: "Onde ficam o expediente e os feriados?",
        answer:
          "Em \"Calendário\": o expediente e os feriados da organização e, abaixo, o calendário de cada setor. Eles valem para os serviços com prazo em horas úteis.",
      },
      {
        id: "avisos-admin",
        question: "Como publico um aviso ou uma manutenção?",
        answer:
          "Em \"Avisos\": escolha o tipo, o público (todos, um perfil ou um setor), o período e, na manutenção, a antecedência. O aviso aparece na faixa do público certo.",
      },
      {
        id: "configuracao-portatil",
        question: "Posso copiar a configuração para outro ambiente?",
        answer:
          "Sim. Em \"Configuração portátil\", exporte o arquivo e importe-o no outro ambiente. A prévia mostra o que é novo, o que muda e os problemas; a importação nunca apaga nada.",
      },
      {
        id: "auditoria",
        question: "Como sei quem mudou o quê?",
        answer: "Em \"Auditoria\", com filtros por período, tipo de cadastro e pessoa, cada mudança mostra o antes e o depois.",
      },
      {
        id: "relatorios-admin",
        question: "Como ligo os relatórios periódicos?",
        answer: "Na seção \"Relatórios\", ligue o semanal ou o mensal; o job diário gera o próximo, e desligar mantém os já gerados.",
      },
      {
        id: "integracoes",
        question: "Como o ServiceFlow avisa outros sistemas?",
        answer:
          "Em \"Webhooks\", cadastre o endereço e os eventos; cada entrega é assinada e repetida em caso de falha. \"E-mails\" mostra se o envio está configurado e as últimas entregas.",
      },
    ],
  },
];

/** Rule 3: the general topics for everyone, the profile's own first when signed in. */
export function topicsFor(role: HelpRole | null): HelpTopic[] {
  const general = HELP_TOPICS.filter((topic) => topic.audience === "everyone");
  if (role === null) return general;
  return [...HELP_TOPICS.filter((topic) => topic.audience === role), ...general];
}

/** Lower case, without accents and repeated spaces, to compare a search with the texts. */
export function normalizeHelpText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rule 5: the search as typed, trimmed and cut; anything that is not text is no search. */
export function helpQueryOf(raw: unknown): string {
  const text = Array.isArray(raw) ? raw[0] : raw;
  return typeof text === "string" ? text.trim().slice(0, MAX_HELP_QUERY_LENGTH) : "";
}

export interface HelpResult {
  topics: HelpTopic[];
  query: string;
  /** Questions shown (every one without a search). */
  found: number;
}

/** The topics of the profile with only the questions whose question or answer has every word searched. */
export function searchHelp(role: HelpRole | null, rawQuery: unknown): HelpResult {
  const query = helpQueryOf(rawQuery);
  const topics = topicsFor(role);
  const words = normalizeHelpText(query).split(" ").filter(Boolean);
  if (words.length === 0) return { topics, query, found: topics.reduce((total, topic) => total + topic.questions.length, 0) };
  const matching = topics
    .map((topic) => ({
      ...topic,
      questions: topic.questions.filter((item) => {
        const text = normalizeHelpText(`${item.question} ${item.answer}`);
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((topic) => topic.questions.length > 0);
  return { topics: matching, query, found: matching.reduce((total, topic) => total + topic.questions.length, 0) };
}
