# SPEC — Comunicação, importação, relatórios e calendários

**Data:** 2026-11-09
**Status:** Revisada com a responsável em 2026-11-09 ("vamos revisar"), perto do fim da SPEC `2026-11-08-atendimento-dia-a-dia`, como ela pediu ("deixe a spec 2 para quando a spec 1 estiver perto do fim, me avise e revisamos"). Cobre os itens 7 a 10 do levantamento de funcionalidades para a meta. As quatro decisões da revisão estão na seção 8 (K1 a K4); as demais (K5 em diante) foram adotadas como recomendadas e podem ser revistas por ela antes de cada parte. A implementação começa depois da SPEC 1.
**Projeto:** ServiceFlow
**Referências:**
- `SPEC/2026-11-08-atendimento-dia-a-dia.md` (SPEC 1; garantia e exclusões de segurança repetidas aqui);
- `SPEC/2026-11-03-pausa-sla-calendario.md` (calendário da organização, feriados, prazo em horas úteis, pausas);
- `SPEC/2026-11-01-notificacoes-email-preferencias.md` (avisos, categorias de e-mail, preferências);
- `SPEC/2026-11-02-painel-relatorios.md` e `SPEC/2026-11-06-analises-operacionais.md` (painel, períodos, escopo por setor);
- `SPEC/2026-11-07-operacao-e-automacao.md` (configuração portátil: prévia e aplicação);
- `SPEC/2026-11-02-auditoria-lgpd.md` (auditoria administrativa, anonimização);
- `SPEC/2026-10-29-plano-escala-100k.md` (garantia 7.4; meta de linhas).

## 1. Objetivo

A organização já configura setores, serviços e regras, e o atendimento já tem os recursos do dia a dia. Faltam formas de **falar com todos** (avisos e manutenções), de **trazer as pessoas em lote** (importação de usuários), de **receber o resumo do período sem precisar abrir telas** (relatório periódico) e de **respeitar o expediente de cada setor** (calendário por setor). Esta SPEC acrescenta esses recursos em cinco partes independentes:

| Parte | O que acrescenta |
|---|---|
| A — Avisos e manutenção | Avisos com período e público, faixa no topo das telas, janelas de manutenção anunciadas |
| B — Importação de usuários | CSV com prévia linha a linha, aplicação com auditoria, pessoas criadas inativas e sem senha |
| C — Relatório periódico | Resumo semanal e mensal por setor, guardado com histórico, com e-mail opcional |
| D — Calendário por setor | Expediente e feriados próprios de um setor, usados no prazo das solicitações abertas depois |
| E — Complementos | Avisos e calendários na configuração portátil, leitura na API, e o histórico dos relatórios em "Análises" |

## 2. Registro da mudança de escopo e garantia

Nenhum destes recursos estava previsto em SPEC anterior; esta SPEC é o registro que autoriza implementá-los. Todos são genéricos.

**Garantia 7.4 do plano, para todas as partes:** quem não usa um recurso novo não percebe mudança. Sem avisos, a faixa não aparece; sem importação, os usuários são criados como hoje; sem relatório ativo, nada é gerado; setores sem calendário próprio usam o da organização exatamente como hoje; as suítes anteriores passam sem alteração de asserções (exceto listas exatas que esta SPEC amplia, como entidades da auditoria, tipos e categorias de aviso, operações da API e o formato da configuração portátil).

**Fora desta SPEC, por decisão da responsável:** nada muda em autenticação, senhas, sessões, perfis ou permissões. A importação de usuários não define senhas (decisão K1); as pessoas importadas entram inativas e o administrador as ativa e define a senha pela tela que já existe.

## 3. Parte A — Avisos e manutenção programada

### 3.1 Escopo

1. **Avisos:** o administrador cadastra avisos com título, texto curto, nível (informação, atenção), período de exibição e público (todos, um perfil, um setor).
2. **Faixa:** durante o período, o aviso aparece numa faixa no topo das telas de quem está no público; cada pessoa pode dispensar um aviso de nível "informação" (o de "atenção" fica até o fim do período).
3. **Manutenção programada:** um aviso pode ser uma janela de manutenção (início e fim); a faixa aparece com antecedência configurável (padrão 24 horas) e durante a janela, com "Manutenção em andamento" **(decisão K2: só avisa, nada é bloqueado)**.
4. **Histórico:** a página "Avisos" mostra os avisos em vigor e os anteriores (últimos 90 dias) do público da pessoa.

### 3.2 Fora de escopo

- Bloquear aberturas ou o acesso durante a manutenção (K2); avisos por e-mail; avisos para pessoas sem conta.

### 3.3 Regras

1. **Valores:** título de 1 a 80 caracteres, texto de 1 a 500, período com fim depois do início e de no máximo 90 dias; manutenção com fim depois do início e de no máximo 24 horas; antecedência de 0 a 168 horas.
2. **Público:** "todos", um perfil (administrador, gestor, atendente, solicitante) ou um setor (as pessoas daquele setor, de qualquer perfil); um aviso tem um público.
3. **Limite:** até 3 avisos visíveis ao mesmo tempo para uma pessoa, os de "atenção" e as manutenções primeiro, depois os mais recentes.
4. **Dispensa:** guardada por pessoa e aviso; não volta a aparecer para ela; não se aplica a "atenção" nem a manutenção.
5. **Auditoria:** criar, alterar, encerrar antes do fim e apagar um aviso que ainda não começou entram na auditoria.

- *Esclarecimentos registrados em 2026-11-14 (SF-234):* os dados ficam em `Announcement` (título, texto, nível `INFO`/`WARNING`, tipo `NOTICE`/`MAINTENANCE`, público `ALL`/`ROLE`/`SECTOR` com o perfil ou o setor, início, fim, antecedência e quem criou) e `AnnouncementDismissal` (pessoa, aviso e quando dispensou, uma linha por par); a auditoria ganha a entidade `ANNOUNCEMENT`. O banco confere a regra 1 e a 2 por `CHECK`: título e texto sem espaços nas pontas; fim depois do início; aviso de até 90 dias e sem antecedência; manutenção de até 24 horas, com antecedência de 0 a 168 horas e sempre de nível "atenção" (como na regra 4, que não a deixa ser dispensada); o perfil só no público "um perfil" e o setor só no público "um setor". Datas e horas são digitadas no fuso da organização. Para a manutenção, o início e o fim são os da janela, e a faixa vale da antecedência antes do início até o fim. Um aviso "começou" no seu início (para a manutenção, o início da janela): antes disso, pode ser alterado ou apagado (apagar uma manutenção ainda na antecedência é cancelá-la); durante, pode ser alterado ou encerrado, e "encerrar antes do fim" muda o fim para o instante do encerramento; um aviso que já terminou não muda mais. Como só o aviso de "informação" já na tela pode ser dispensado, um aviso que ainda não começou nunca tem dispensas. Criar ou alterar exige um fim ainda no futuro. Na ordem da regra 3, "mais recentes" são os de início mais recente. A antecedência só existe na manutenção; num aviso comum, ela é ignorada.
- *Esclarecimentos registrados em 2026-11-14 (SF-235):* só o administrador cadastra, na seção "Avisos" da administração (como as demais configurações da organização). A lista mostra primeiro os avisos em andamento, depois os programados e por último os encerrados nos últimos 90 dias, cada um com o tipo, o nível, o público, o período (para a manutenção, também o início da faixa) e a situação. O formulário pede título, texto, tipo, nível (só para o aviso comum), público com o perfil ou o setor, início, fim e antecedência (só para a manutenção, padrão 24 horas); o setor do público precisa estar ativo. Ao alterar um aviso em andamento, o início não pode ir para depois do instante da alteração (o aviso continuaria "começado" e poderia ter dispensas). "Encerrar" aparece só no aviso em andamento e "Apagar" só no programado; na auditoria, encerrar é uma alteração do fim ("Fim: … → …") e apagar é "Removeu". A auditoria mostra o tipo, o nível, o público e o perfil pelos nomes, o setor pelo nome e as datas no fuso da organização. Cada recusa tem a sua mensagem.
- *Esclarecimentos registrados em 2026-11-14 (SF-236):* a faixa fica no topo de todas as telas de quem está conectado, acima do cabeçalho de cada área (inclusive a administração, "Meus dados" e as demais páginas de conta); sem sessão (a página inicial) ou sem aviso para a pessoa, nada aparece e a tela é a de antes (CA-AVI-01). Cada aviso mostra o nível ("Atenção" ou "Informação"), o título e o texto, em cores próprias com contraste de pelo menos 4,5:1; o de atenção é anunciado aos leitores de tela como alerta. O público e o momento são decididos pelo instante do banco; a pessoa inativa não vê avisos. Se a leitura dos avisos falhar, a faixa não aparece e a tela segue normalmente.
- *Esclarecimentos registrados em 2026-11-14 (SF-237):* só o aviso de "informação" na faixa tem o botão "Dispensar"; a pessoa dispensa um aviso do seu público que esteja na faixa naquele instante (do banco). A dispensa é guardada uma vez por pessoa e aviso: dispensar de novo (dois cliques, duas abas) não muda nada nem é erro. Depois de dispensar, a mesma tela é recarregada sem o aviso; se o aviso já não puder ser dispensado (terminou, foi encerrado, mudou para "atenção"), a tela também só é recarregada, sem mensagem. O aviso dispensado continua na página "Avisos" (SF-239). A dispensa não é dado pessoal nem entra na auditoria (é uma preferência da pessoa sobre a própria tela) e não muda com a anonimização.
- *Esclarecimentos registrados em 2026-11-14 (SF-238):* na faixa, a manutenção aparece como "Manutenção programada" durante a antecedência, com a janela ("De dd/mm/aaaa hh:mm a dd/mm/aaaa hh:mm."), e como "Manutenção em andamento" durante a janela, com o fim ("Até dd/mm/aaaa hh:mm."), seguida do título e do texto; a fase é decidida pelo instante do banco e a hora é a do fuso da organização. Com antecedência 0, a faixa começa junto com a janela. Nada consulta os avisos fora da faixa e da administração: abrir, atender e usar a API seguem iguais durante a janela (decisão K2).
- *Esclarecimentos registrados em 2026-11-14 (SF-239):* a página "Avisos" fica em `/announcements`, para qualquer pessoa conectada, com o cabeçalho das páginas de conta ("Voltar" leva à área do perfil). Lista os avisos do público da pessoa cuja faixa já começou e que estão em vigor ou terminaram nos últimos 90 dias: primeiro os em vigor, depois os encerrados, do início mais recente para o mais antigo; cada um com o tipo (e o nível do aviso comum), o título, o texto, o período (para a manutenção, a janela) e a situação ("Em vigor", "Manutenção programada", "Manutenção em andamento" ou "Encerrado"). Os dispensados continuam na lista. Avisos futuros ainda não aparecem. Para não mudar as telas de quem não tem avisos (CA-AVI-01), o link "Avisos" no menu de cada área só aparece quando a pessoa tem algum aviso nessa lista; a faixa também ganha "Ver todos os avisos". O administrador usa a mesma página para ver os seus avisos; a gestão continua na seção "Avisos" da administração.
- *Correção registrada em 2026-11-14 (SF-240):* o E2E da parte A mostrou que a faixa no layout raiz (SF-236) não aparecia ao entrar: no App Router, o layout raiz não é renderizado de novo nas navegações dentro da aplicação, então a faixa ficava como na página inicial (sem sessão). A faixa passou para o layout de cada área (renderizado quando a pessoa entra na área, como o contador de notificações) e para o topo das páginas fora delas (administração, páginas de conta, "Serviços do setor" e "Avisos"), que são renderizadas a cada visita. Dentro de uma área, a faixa e o link "Avisos" do menu se atualizam ao entrar na área, ao recarregar a página e ao dispensar um aviso; um aviso que começa ou termina enquanto a pessoa navega na mesma área aparece ou some na próxima recarga. O E2E também mostrou duas regiões com o mesmo nome na administração (a faixa e a seção "Avisos"); a faixa passou a se chamar "Avisos em vigor" para os leitores de tela.

### 3.4 Critérios de aceitação

- [x] **CA-AVI-01** — Sem avisos, as telas não mudam. *Verificado em 2026-11-14 (SF-236): sem aviso para a pessoa, a faixa não desenha nada (unitário); com a faixa já no layout raiz e nenhum aviso cadastrado, o E2E completo passou sem mudar asserções (53/53) e o `next build` passou; se a leitura falhar, a faixa some e a tela segue.*
- [x] **CA-AVI-02** — O administrador cadastra, altera e encerra avisos com os limites da regra 1, com auditoria. *Verificado em 2026-11-14 (SF-234 e SF-235): só o administrador, na seção "Avisos"; os limites da regra 1 recusados pelo formulário e pelo banco, cada um com a sua mensagem; alterar até o fim (sem levar o início de um aviso em andamento para depois de agora), encerrar o que está em andamento e apagar o programado; criar, alterar, encerrar e apagar na auditoria, com o público, o setor e as datas legíveis; gestor e atendente recusados (unitário e integração).*
- [x] **CA-AVI-03** — A faixa aparece só para o público, no período, com o limite e a ordem da regra 3; a dispensa vale por pessoa. *Verificado em 2026-11-14 (SF-236 e SF-237): cada pessoa vê só os avisos do seu público (todos, o seu perfil, o seu setor), durante o período (a manutenção desde a antecedência), até três, atenção e manutenção primeiro e depois os de início mais recente; só o aviso de informação tem "Dispensar", a dispensa some o aviso só para quem dispensou, é guardada uma vez mesmo com cliques simultâneos e não vale para atenção (unitário e integração).*
- [x] **CA-AVI-04** — A manutenção aparece com a antecedência e durante a janela, sem bloquear nada. *Verificado em 2026-11-14 (SF-234, SF-236 e SF-238): "Manutenção programada" com a janela desde o início da antecedência, "Manutenção em andamento" com o fim durante a janela, nada antes da antecedência nem depois do fim, sem antecedência só a partir da janela, sempre como atenção e sem "Dispensar"; uma solicitação aberta durante a janela segue normalmente (unitário e integração).*
- [x] **CA-AVI-05** — Migration aditiva; nenhuma dependência nova. *Verificado em 2026-11-14 (SF-234): migration `20261114100000_announcements` só acrescenta (três enums, duas tabelas, índices, chaves e `CHECK`s, e o valor `ANNOUNCEMENT` no enum da auditoria); `package.json` sem mudança; cada recusa do banco conferida pelo nome da restrição, inclusive com as colunas opcionais nulas (integração).*
- *Revisão de 2026-11-14 (SF-240):* CA-AVI-01 a 04 conferidos também pelo E2E `announcements.spec.ts`: sem avisos, o menu do solicitante não tem "Avisos" nem faixa; o administrador cria um aviso em andamento, uma manutenção na antecedência e um aviso futuro, apaga o futuro e encerra o primeiro; o solicitante vê a manutenção programada antes da informação, a manutenção sem "Dispensar", dispensa a informação (que não volta depois de recarregar) e a encontra na página "Avisos" pelo menu; a auditoria mostra "Criou", "Alterou" e "Removeu". O E2E completo, sem avisos, segue igual.

## 4. Parte B — Importação de usuários por CSV

### 4.1 Escopo

1. **Modelo:** o administrador baixa um CSV de exemplo com as colunas `nome`, `email`, `perfil`, `setor`.
2. **Prévia:** ao enviar o arquivo, o sistema mostra cada linha com o resultado previsto (criar, ignorar porque o e-mail já existe, erro com o motivo), sem gravar nada.
3. **Aplicação:** confirmada a prévia, as linhas válidas são criadas numa transação, com uma entrada de auditoria por pessoa e uma da importação **(decisão K1: inativas e sem senha utilizável)**.
4. **Histórico:** as importações ficam registradas (quem, quando, quantas criadas, ignoradas e com erro), com o relatório de erros em CSV.

### 4.2 Fora de escopo

- Senhas no arquivo, convites por e-mail, alterar ou desativar pessoas que já existem, importar permissões ou papéis de acesso.

### 4.3 Regras

1. **Arquivo:** CSV em UTF-8 com separador `;` ou `,`, cabeçalho obrigatório, até 500 linhas e 200 KB; células perigosas para planilhas são lidas como texto.
2. **Linha válida:** nome de 1 a 120 caracteres, e-mail válido e ainda não usado (nem repetido no arquivo), perfil entre os quatro, setor por nome de um setor ativo (obrigatório para atendente e gestor, vazio para solicitante e administrador).
3. **Criação:** cada pessoa entra inativa, com uma senha inutilizável (como a anonimização já faz), e só passa a entrar quando o administrador a ativa e define a senha pela tela que existe hoje.
4. **Mesma prévia:** a aplicação refaz a prévia com o banco do momento; se algo mudou (um e-mail passou a existir), aplica só o que continua válido e o relatório diz o que ficou de fora.

- *Esclarecimentos registrados em 2026-11-14 (SF-241):* o arquivo é lido como bytes: acima de 200 KB, ou que não seja UTF-8 válido, é recusado inteiro; a marca de ordem de bytes (BOM) do Excel é aceita. O separador é o do cabeçalho (`;` se ele tiver `;`, senão `,`). Aspas seguem o padrão do CSV (`""` dentro de um campo entre aspas é uma aspa; o campo entre aspas pode ter o separador e quebras de linha); aspa sem fechamento recusa o arquivo. Linhas em branco são ignoradas; mais de 500 linhas de dados, ou nenhuma, recusa o arquivo. O cabeçalho precisa ter exatamente as quatro colunas `nome`, `email`, `perfil` e `setor`, em qualquer ordem, sem diferenciar maiúsculas nem acentos (`e-mail` vale como `email`); coluna que falte, se repita ou seja desconhecida recusa o arquivo, para que uma coluna como `senha` nunca passe em silêncio. Cada valor é cortado nas pontas. Uma linha com número de campos diferente do cabeçalho é um erro daquela linha. O perfil aceita `administrador`, `gestor`, `atendente` e `solicitante` (e os códigos `ADMIN`, `MANAGER`, `ATTENDANT` e `REQUESTER`), sem diferenciar maiúsculas nem acentos. O setor é procurado pelo nome entre os setores ativos, sem diferenciar maiúsculas; um setor inativo conta como não encontrado. O e-mail é comparado em minúsculas. Resultado de cada linha: "criar"; "ignorar" quando o e-mail já existe; ou "erro" com todos os motivos da linha (nome vazio ou com mais de 120 caracteres, e-mail inválido, e-mail repetido no arquivo — a primeira ocorrência vale e as seguintes são erro —, perfil desconhecido, setor exigido e vazio, setor informado para quem não tem setor, setor não encontrado, número de campos errado). "Células perigosas para planilhas" (que começam com `=`, `+`, `-`, `@`, tabulação ou retorno) são guardadas como texto, nunca avaliadas; no relatório de erros em CSV (SF-244) saem com um apóstrofo na frente, como os demais CSVs do sistema.
- *Esclarecimentos registrados em 2026-11-14 (SF-242):* só o administrador faz a prévia (como as demais configurações da organização). Ela lê o arquivo, consulta o banco do momento (os e-mails do arquivo que já existem, sem diferenciar maiúsculas, e os setores ativos) e devolve cada linha com os valores lidos e o resultado, mais o total de linhas a criar, a ignorar e com erro; um arquivo recusado inteiro volta com o motivo e, quando houver, a linha. Nada é gravado e a prévia não entra na auditoria. Como na configuração portátil, a prévia devolve o texto do arquivo (com quebras de linha normalizadas) e o seu resumo SHA-256: a aplicação (SF-243) recebe esse texto e esse resumo, confere que é o mesmo arquivo e refaz a avaliação com o banco daquele momento (regra 4). As telas da parte B chegam na SF-245.
- *Esclarecimentos registrados em 2026-11-14 (SF-243):* a aplicação é só do administrador. Ela recebe o texto e o resumo SHA-256 da prévia; se o resumo não for o do texto, recusa com conflito ("envie o arquivo de novo"). Numa só transação serializável, avalia o texto de novo com o banco daquele momento e cria cada linha válida: nome, e-mail em minúsculas, perfil e setor, inativa e com uma senha inutilizável (`!importado`, que o login sempre recusa, como o `!anonimizado` da anonimização), cada uma com a entrada "Criou · Usuário" da auditoria, igual à do cadastro. A importação fica registrada na tabela `UserImport` (quem, quando, quantas linhas criadas, ignoradas e com erro e o relatório das linhas que ficaram de fora) e tem a própria entrada na auditoria ("Importou · Importação de usuários", entidade `USER_IMPORT`), com as três contagens; uma importação sem nenhuma linha criada também fica registrada. O relatório guarda, de cada linha que ficou de fora, o número da linha, o resultado (ignorada ou erro), os motivos, o perfil e o setor como foram escritos, mas não o nome nem o e-mail: uma linha ignorada é de alguém que já existe, e o relatório não deve guardar dados pessoais que escapariam da anonimização; o administrador encontra a linha pelo número no próprio arquivo. Se outra gravação disputar a mesma transação (por exemplo, o mesmo e-mail criado ao mesmo tempo), a importação inteira é recusada e nada é gravado. A pessoa importada passa a entrar quando o administrador a reativa e define a senha em "Usuários" ("Reativar" e "Nova senha"), sem mudança nessa tela.
- *Esclarecimentos registrados em 2026-11-14 (SF-244):* o histórico é só do administrador e mostra as 50 importações mais recentes, da mais nova para a mais antiga, com quem importou (o nome de hoje), quando (no fuso da organização) e quantas linhas foram criadas, ignoradas e com erro. O relatório de erros de cada importação sai em CSV em `/api/user-imports/{id}/report.csv`, só para o administrador, como os demais CSVs do sistema (UTF-8 com BOM, separador `;`, células que uma planilha leria como fórmula com um apóstrofo na frente, sem cache), com as colunas fixas Linha, Resultado ("Ignorada" ou "Com erro"), Motivos, Perfil e Setor, uma linha por linha do arquivo que ficou de fora; sem nome nem e-mail (SF-243). Uma importação sem linhas de fora gera o CSV só com o cabeçalho. Importação desconhecida responde "não encontrada". As telas chegam na SF-245.
- *Esclarecimentos registrados em 2026-11-14 (SF-245):* a administração ganha a seção "Importar usuários". O modelo sai em `/api/user-imports/model.csv`, só para o administrador, no formato dos CSVs do sistema: o cabeçalho `nome;email;perfil;setor` e duas linhas de exemplo, uma de solicitante e uma de atendente com o setor "Nome de um setor ativo" (que não existe: importado sem editar, o modelo mostra na prévia como aparece um erro, e essa linha não é criada); a tela pede para trocar os exemplos. O administrador envia o arquivo e vê a prévia: os totais e uma tabela com cada linha (número, nome, e-mail, perfil, setor, resultado e motivos); um arquivo recusado inteiro mostra o motivo e, quando houver, a linha. "Aplicar a importação" só aparece com alguma linha a criar e envia o mesmo texto da prévia; o resultado mostra os totais da aplicação, avisa quando eles diferem da prévia (o banco mudou entre os dois passos), lembra que as pessoas entram inativas e sem senha, e leva ao relatório de erros. Abaixo, o histórico das importações, cada uma com o link do seu relatório. Uma nova prévia recomeça a confirmação.

### 4.4 Critérios de aceitação

- [x] **CA-IMP-01** — Sem importação, criar usuários continua como hoje. *Verificado em 2026-11-14 (SF-241 a SF-245): o cadastro de usuários e as suas regras não mudaram (o limite de 120 caracteres vale só na importação); as suítes anteriores passaram sem mudar asserções, inclusive o E2E completo (55/55) com a seção nova no menu da administração.*
- [x] **CA-IMP-02** — A prévia mostra o resultado de cada linha com os limites das regras 1 e 2, sem gravar nada. *Verificado em 2026-11-14 (SF-241, SF-242 e SF-245): arquivo recusado inteiro com o motivo e a linha (tamanho, codificação, aspas, cabeçalho, número de linhas); cada linha com criar, ignorar ou erro com todos os motivos; nenhuma pessoa nem entrada de auditoria gravada pela prévia (unitário, integração e E2E `user-import.spec.ts`).*
- [x] **CA-IMP-03** — A aplicação cria só as linhas válidas, inativas e sem senha, com auditoria e histórico; o relatório de erros sai em CSV. *Verificado em 2026-11-14 (SF-243 e SF-244): só as linhas válidas no momento da aplicação são criadas, inativas e com `!importado`, cada uma com "Criou · Usuário" e a importação com "Importou · Importação de usuários"; o histórico lista as 50 mais recentes com autor e contagens; o relatório de erros sai em CSV com colunas fixas, sem nome nem e-mail, só para o administrador (unitário e integração).*
- [x] **CA-IMP-04** — Nenhuma regra de senha, sessão, perfil ou permissão muda. *Verificado em 2026-11-14 (SF-241 a SF-243): o login, as sessões, os perfis e as permissões não foram tocados (as suítes anteriores passaram sem mudar asserções); a pessoa importada entra inativa, com `!importado`, que o login recusa como qualquer valor que não seja um hash argon2id; o administrador a ativa e define a senha pela tela de "Usuários" de hoje, conferido de ponta a ponta (integração).*
- *Revisão de 2026-11-14 (SF-245):* CA-IMP-01 a 04 conferidos também pelo E2E `user-import.spec.ts`: o administrador baixa o modelo, envia um arquivo com uma pessoa nova, um e-mail já em uso e um perfil desconhecido, vê cada resultado na prévia sem nada gravado, aplica, baixa o relatório (sem nome nem e-mail), encontra a importação no histórico e a pessoa nova inativa em "Usuários", com "Reativar". Parte B concluída.

## 5. Parte C — Relatório periódico

### 5.1 Escopo

1. **Conteúdo:** por setor e para a organização, no período (a semana anterior, de segunda a domingo, ou o mês anterior): solicitações abertas, concluídas e canceladas; concluídas no prazo; tempo mediano de atendimento; avaliação média; horas lançadas; as cinco etiquetas mais usadas.
2. **Geração:** o job diário gera, na segunda-feira, o relatório semanal e, no dia 1, o mensal, uma vez por período; o resultado fica guardado (os números, não as solicitações).
3. **Leitura:** gestores leem os do próprio setor; o administrador, todos e o da organização; a página "Relatórios" lista o histórico e mostra cada um.
4. **E-mail (decisão K3):** quem quiser recebe um e-mail curto quando sai o relatório que pode ler, pela categoria nova "Relatórios" das preferências de aviso.

### 5.2 Fora de escopo

- Relatórios personalizados, por atendente, com listas de solicitações ou anexos.

### 5.3 Regras

1. **Uma vez por período:** o par (tipo, período, escopo) é único; rodar o job de novo não duplica.
2. **Números do momento:** o relatório guarda os números calculados na geração; mudanças posteriores nas solicitações não o alteram.
3. **Ativação:** o administrador liga ou desliga o semanal e o mensal (os dois começam desligados); desligar não apaga o histórico.
4. **E-mail:** só aviso no aplicativo e, se a pessoa quiser, e-mail; o conteúdo do e-mail tem só os números principais e o link.

### 5.4 Critérios de aceitação

- [ ] **CA-REL-01** — Sem relatório ativo, nada é gerado e as telas não mudam.
- [ ] **CA-REL-02** — O job gera cada relatório uma vez por período e escopo, com os números do momento.
- [ ] **CA-REL-03** — Cada pessoa lê só os relatórios do seu escopo; o histórico fica na página "Relatórios".
- [ ] **CA-REL-04** — O aviso e o e-mail respeitam a preferência da categoria "Relatórios".

## 6. Parte D — Calendário por setor

### 6.1 Escopo

1. **Calendário próprio:** um setor pode ter dias da semana e horário de expediente próprios; sem isso, usa o da organização.
2. **Feriados do setor:** além dos feriados da organização, um setor pode ter os seus (data, nome, se repete todo ano).
3. **Uso:** o prazo de uma solicitação aberta em horas úteis usa o calendário do setor que a recebeu na abertura **(decisão K4: só as abertas depois; as já abertas mantêm o prazo)**.

### 6.2 Fora de escopo

- Calendário por atendente; turnos; mudar o prazo de solicitações já abertas.

### 6.3 Regras

1. **Quem configura:** o administrador, para qualquer setor; o gestor, para o próprio setor; com auditoria.
2. **Valores:** os mesmos do calendário da organização (dias, início e fim do expediente, fuso da organização).
3. **Cópia na abertura:** a solicitação guarda de qual calendário veio o prazo (o do setor ou o da organização); pausas, retomadas e mudanças de prioridade usam esse mesmo calendário; o encaminhamento para outro setor não troca o calendário (o prazo continua o combinado na abertura).
4. **Sem calendário próprio:** o setor segue o da organização, inclusive as mudanças futuras dele.

### 6.4 Critérios de aceitação

- [ ] **CA-CAL-01** — Setores sem calendário próprio se comportam exatamente como hoje.
- [ ] **CA-CAL-02** — Administrador e gestor configuram o calendário e os feriados do setor, com auditoria.
- [ ] **CA-CAL-03** — Solicitações abertas depois usam o calendário do setor, inclusive nas pausas e mudanças de prioridade; as já abertas não mudam.
- [ ] **CA-CAL-04** — Migration aditiva; nenhuma dependência nova.

## 7. Parte E — Complementos

1. **Configuração portátil versão 3:** inclui avisos futuros e calendários e feriados de setor, aceitando as versões 1 e 2.
2. **API pública (só leitura):** avisos em vigor para o dono do token; o calendário efetivo de um setor.
3. **"Análises":** um bloco com os últimos relatórios periódicos do escopo, ligado à página "Relatórios".

- [ ] **CA-COM-01** — A configuração portátil leva e traz avisos futuros e calendários de setor, aceitando as versões anteriores.
- [ ] **CA-COM-02** — A API e "Análises" mostram os dados novos só a quem já pode lê-los.

## 8. Decisões (2026-11-09)

| # | Questão | Decisão | Alternativa descartada |
|---|---|---|---|
| K1 | Senha dos importados | Inativos e sem senha; o administrador ativa e define pela tela atual (escolha da responsável) | Senha inicial no CSV (guarda senhas num arquivo e mexe no fluxo da conta) |
| K2 | Manutenção | Só avisa (escolha da responsável) | Bloquear aberturas |
| K3 | Relatório periódico | Página com histórico e e-mail opcional (escolha da responsável) | Só página |
| K4 | Calendário por setor | Só as solicitações abertas depois (escolha da responsável) | Recalcular as abertas |
| K5 | Dispensar avisos | Só os de "informação" | Qualquer aviso |
| K6 | Público do aviso | Um público por aviso | Vários públicos |
| K7 | Período do relatório | Semana de segunda a domingo e mês civil | Últimos 7 e 30 dias |
| K8 | Calendário no encaminhamento | Mantém o da abertura | Trocar pelo do setor novo |
| K9 | Quem configura o calendário do setor | Administrador e gestor do setor | Só o administrador |

## 9. Testes

Cada parte segue o padrão das SPECs anteriores: unitários das regras e das telas; integração com o banco real (schema, `CHECK`s, casos de uso, escopo de leitura, transações, job); um E2E por parte. A importação tem testes com arquivos inválidos (separador, cabeçalho, tamanho, células perigosas); o calendário tem testes de prazo com feriado do setor, pausa e mudança de prioridade.

## 10. Tarefas

| Tarefa | Parte | Conteúdo |
|---|---|---|
| SF-234 | A | Migrations e domínio dos avisos |
| SF-235 | A | Cadastro de avisos na administração, com auditoria |
| SF-236 | A | Faixa dos avisos nas áreas, público e limite |
| SF-237 | A | Dispensa por pessoa |
| SF-238 | A | Manutenção programada e antecedência |
| SF-239 | A | Página "Avisos" com o histórico |
| SF-240 | A | Telas e E2E da parte A |
| SF-241 | B | Formato do CSV e domínio da importação |
| SF-242 | B | Prévia linha a linha |
| SF-243 | B | Aplicação com auditoria, pessoas inativas e sem senha |
| SF-244 | B | Histórico das importações e relatório de erros |
| SF-245 | B | Modelo do CSV, telas e E2E da parte B |
| SF-246 | C | Migrations e domínio dos relatórios |
| SF-247 | C | Cálculo dos números do período |
| SF-248 | C | Geração pelo job, uma vez por período |
| SF-249 | C | Página "Relatórios" com escopo e histórico |
| SF-250 | C | Categoria "Relatórios", aviso e e-mail |
| SF-251 | C | Ativação pelo administrador e E2E da parte C |
| SF-252 | D | Migrations e domínio do calendário do setor |
| SF-253 | D | Configuração do calendário e dos feriados do setor |
| SF-254 | D | Prazo da abertura pelo calendário do setor |
| SF-255 | D | Pausas, retomadas e prioridade com o calendário guardado |
| SF-256 | D | Telas e E2E da parte D |
| SF-257 | E | Configuração portátil versão 3 |
| SF-258 | E | API pública: avisos e calendário |
| SF-259 | E | Relatórios em "Análises" e revisão final |

**Ordem:** A → B → C → D → E. **Estimativa:** pela média real da SPEC 1 (de 300 a 450 linhas por tarefa, mais nas tarefas de telas e de regras de prazo), 26 tarefas dariam de 9.000 a 12.000 linhas; para cobrir o que falta à meta (cerca de 15.500 a 16.500 linhas depois da SPEC 1), esta SPEC deve ser aprofundada como a SPEC 1 foi (seção 13 dela), com acréscimos registrados aqui antes de implementar. Os acréscimos serão propostos à responsável quando a parte A começar.
