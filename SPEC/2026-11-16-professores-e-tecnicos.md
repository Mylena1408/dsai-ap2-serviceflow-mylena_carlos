# SPEC — Área de professores e técnicos: tipos, reservas de espaços e alocação de provas

**Data:** 2026-11-16
**Status:** Em definição. Pedido da responsável em 2026-11-16: "faça a área dos professores e técnicos, vamos definir a spec". Escolhas já feitas por ela: **professor e técnico são novos tipos de solicitante** (como o aluno; quem atende continua sendo atendente e gestor), **dois tipos separados**, e a área traz **guia rápido próprio**, **fila, painéis e análises**, **cadastro e importação CSV** e, acrescentado por ela, **"salas para uso de aula, laboratórios e alocação de aplicação de provas"**. Depois, a responsável definiu: "por ser didático a área de segurança esta área seguirá as demais, não terá segurança ou restrição de acesso a dados" (P17). **Revisada em 2026-11-16** ("vamos rever as specs"): a responsável escolheu P1 (lista; "ambos" vira os quatro tipos), P7 e P8 (07:00 às 23:00; semanal tudo ou nada) e P10 e P13 (a equipe do setor confirma e aloca); as demais decisões foram adotadas como propostas e podem ser revistas antes de cada parte. **Aprovada; começa depois da paginação de "Aprovações" (SF-284).** **Concluída em 2026-11-16** (SF-285 a SF-294; CA-PRT-01 a 12), a pedido da responsável ("faça todas as etapas e depois termine com o push").
**Projeto:** ServiceFlow
**Referências:** `SPEC/2026-11-16-tipos-de-solicitante.md` (tipos e público do serviço), `SPEC/2026-11-16-guia-do-estudante.md` (o guia), `SPEC/2026-11-09-comunicacao-e-calendarios.md` (calendário por setor), `SPEC/2026-11-15-mapa-de-servicos.md`.

## 1. Objetivo

Dar a professores e técnicos-administrativos uma área própria no ServiceFlow: os serviços oferecidos a eles no catálogo e no mapa, um guia rápido, e duas funções que hoje não existem: **reservar salas de aula e laboratórios** e **pedir a alocação de salas para a aplicação de provas**, com a confirmação pelo setor responsável pelos espaços e sem dois usos do mesmo espaço no mesmo horário.

## 2. Registro da mudança de escopo e garantia

- **Mudança registrada:** a SPEC dos tipos de solicitante definiu dois tipos (aluno e público geral) e um público de serviço com três valores (só alunos, só público geral ou ambos). Esta SPEC acrescenta dois tipos e troca o público por uma **lista de tipos** (P1), e cria dois módulos novos (espaços e reservas; provas).
- **Garantia:** login, senha e perfis de acesso não mudam (escolha da responsável na SPEC anterior e o pedido de não mexer na segurança). Os tipos novos são solicitantes; o tipo decide os serviços oferecidos no catálogo, como já hoje, e **nada mais**: reservas, agenda e provas não ganham restrição de acesso nova (P17). Quem já usa o sistema continua vendo o mesmo: alunos e público geral não perdem nem ganham serviços.

## 3. Decisões (revisadas em 2026-11-16)

| # | Decisão proposta | Alternativa |
|---|---|---|
| **P1** | O público do serviço vira uma **lista de tipos** ("Oferecido a": Aluno, Professor, Técnico-administrativo, Público geral; pelo menos um). Migração: "Só alunos" → Aluno; "Só público geral" → Público geral; "Ambos" → **os quatro tipos** (era "para todos"). | Manter três valores e acrescentar combinações fixas (não escala). |
| **P2** | Rótulos: **"Professor"** e **"Técnico-administrativo"**; subseções "Serviços para professores" e "Serviços para técnicos-administrativos". | "Docente" e "Técnico". |
| **P3** | O tipo padrão continua Aluno; um professor ou técnico só existe se o administrador escolher o tipo (cadastro ou coluna `tipo` do CSV, que passa a aceitar "professor" e "técnico"/"tecnico-administrativo"). | — |
| **P4** | Configuração portátil **versão 5**: o serviço leva `offeredTo` como lista; as versões 1 a 4 continuam aceitas (o valor antigo é convertido como em P1). | — |
| **P5** | **Espaço** é um cadastro novo: nome, tipo (Sala de aula, Laboratório, Auditório, Outro), setor responsável, capacidade (1 a 1.000), localização e recursos (texto), e se a confirmação é **automática** ou **pelo setor**. Desativar mantém o histórico. | Espaço como serviço do catálogo (sem controle de horário). |
| **P6** | Cadastram espaços o **administrador** (seção "Espaços") e quem já tem **"Gerir serviços do setor"**, só para o próprio setor. **Nenhuma permissão nova.** | Só o administrador. |
| **P7** | **Reserva**: um espaço, data, início e fim (passos de 15 min, de 30 min a 8 h, entre 07:00 e 23:00, no fuso da organização), finalidade (Aula, Uso de laboratório, Reunião, Evento, Outro), descrição e número de pessoas (até a capacidade). Não se reserva em feriado do calendário do setor do espaço nem no passado. | Seguir o expediente do setor (bloquearia aulas à noite). |
| **P8** | **Reserva semanal** opcional: repete no mesmo dia e horário até uma data final (até 26 semanas). É tudo ou nada: se alguma data tiver conflito ou feriado, nada é gravado e a tela lista as datas com problema. Cada data vira uma reserva da série, que pode ser cancelada sozinha ou com as seguintes. | Gravar as livres e pular as ocupadas. |
| **P9** | A área de reservas e provas fica na **área do solicitante**, como as outras páginas dela, e é apresentada a professores e técnicos (menu, guia, subseção do catálogo). **Não há bloqueio por tipo** (P17): qualquer solicitante que abrir a página pode reservar e pedir prova. | Bloquear por tipo (restrição nova, descartada por P17). |
| **P10** | Situações da reserva: **Pendente → Confirmada** ou **Recusada** (motivo obrigatório); **Cancelada** por quem reservou até o início (motivo opcional) ou pelo setor (motivo obrigatório). Com confirmação automática, nasce Confirmada. Confirmam e recusam os **atendentes e gestores do setor do espaço**, numa página "Reservas" da área deles. | Só o gestor confirma. |
| **P11** | **Sem dois usos ao mesmo tempo:** uma reserva Pendente ou Confirmada bloqueia o horário do espaço. A garantia fica no **banco** (restrição de exclusão por intervalo, com a extensão `btree_gist` do PostgreSQL, disponível no Neon e no banco de testes; conferida antes da migration), além da checagem na tela. | Só a checagem na aplicação (duas pessoas ao mesmo tempo poderiam passar). |
| **P12** | **Agenda do espaço:** semana por semana, os horários ocupados, com quem reservou e a finalidade, igual para todos (P17). | Esconder nomes de quem não é da equipe (restrição nova, descartada por P17). |
| **P13** | **Alocação de prova:** o professor informa disciplina, turma, data, início e fim, número de alunos, o tipo de espaço desejado (sala ou laboratório), o setor que aloca (entre os que têm espaços ativos) e observações (por exemplo, acessibilidade). A equipe do setor **aloca um ou mais espaços** cuja capacidade somada cubra os alunos, todos livres no horário; a tela **sugere** a combinação com menos espaços. Alocar cria reservas Confirmadas com finalidade "Aplicação de prova", ligadas ao pedido; recusar exige motivo; o professor pode cancelar até o início, o que libera as reservas. | O professor escolhe as salas. |
| **P14** | Avisos pelas **notificações do sistema** (já existentes): reserva confirmada, recusada ou cancelada pelo setor; prova alocada ou recusada; e, para a equipe, reserva ou prova nova pendente. Sem nova categoria de e-mail. | Nova categoria de e-mail. |
| **P15** | **Fora desta SPEC:** API pública, MCP e webhooks para reservas e provas; reserva por alunos; fiscais de prova; recursos móveis (projetor, notebook); integração com calendários externos. | — |
| **P16** | **Demonstração:** os dados fictícios ganham dois espaços (uma sala e um laboratório da Central de Serviços). A tela de entrada **não ganha botão novo** (nada muda no acesso); para experimentar, o administrador troca o tipo de Ana Souza em "Usuários", como já se faz com o público geral. | Botões "Entrar como Professor" e "Entrar como Técnico" (mexem na entrada). |
| **P17** | **Sem segurança nova (decisão da responsável, por ser didático):** a área segue as demais. Valem só os perfis que já existem (a área do solicitante para quem é solicitante; a da equipe para atendente e gestor; a administração para o administrador) e a permissão "Gerir serviços do setor" que já existe. Nada de novo controle por tipo, por espaço ou por dado. As regras de negócio continuam (capacidade, horário, feriado, sem dois usos ao mesmo tempo), porque não são de acesso. | — |

## 4. Parte A — Tipos Professor e Técnico-administrativo

### 4.1 Escopo

1. Tipos **Professor** e **Técnico-administrativo** ao lado de Aluno e Público geral (P2, P3), no cadastro de pessoas e na coluna `tipo` da importação CSV.
2. O serviço passa a ter **"Oferecido a"**, uma lista de tipos (P1), no cadastro do administrador e de quem gere serviços do setor, e na configuração portátil v5 (P4).
3. O catálogo e o mapa mostram a subseção do tipo de quem entrou ("Serviços para professores", "Serviços para técnicos-administrativos"); um serviço não oferecido ao tipo responde "não encontrado" na tela, na abertura, na API e nos pacotes, como hoje.
4. A fila do atendente mostra e filtra os quatro tipos; o painel, as análises e o CSV separam os números pelos quatro tipos.

### 4.2 Regras

1. Toda pessoa de perfil solicitante tem exatamente um tipo; outro perfil não tem tipo (como hoje).
2. Um serviço é oferecido a pelo menos um tipo; a lista não tem repetição.
3. A solicitação guarda o tipo de quem a abriu (como hoje); mudar o tipo da pessoa não muda as solicitações antigas.
4. A migration não muda o que alunos e público geral veem (P1).

### 4.3 Critérios de aceitação

- [x] **CA-PRT-01** — O administrador cadastra professores e técnicos (tela e CSV); o serviço tem "Oferecido a" com os quatro tipos; a configuração v5 exporta e importa a lista, e as versões 1 a 4 continuam aceitas. *Verificado em 2026-11-16 (SF-285 e SF-286): integração `professor-technician-kinds.test.ts` (cadastro de professor e técnico, lista "Oferecido a" normalizada, lista vazia e tipo desconhecido recusados, auditoria com `offeredTo`), unitários da coluna `tipo` (professor, professora, docente, técnico, técnica-administrativa) e integração `configuration-version-4.test.ts` (exportação v5 com a lista, importação de mudança, arquivo v4 convertido, forma errada recusada); E2E `professors-technicians.spec.ts` (o administrador muda Ana para professora).*
- [x] **CA-PRT-02** — Cada tipo vê no catálogo e no mapa só os serviços oferecidos a ele, na sua subseção; o de outro tipo é "não encontrado" na página, na abertura, na API e nos pacotes. *Verificado em 2026-11-16: integração (cada um dos quatro tipos lista, abre no mapa e consegue abrir só os serviços oferecidos a ele; os outros são "não encontrado" na página e na abertura, que é o caminho da tela, da API e dos pacotes) e E2E (subseção "Serviços para professores").*
- [x] **CA-PRT-03** — Depois da migration, alunos e público geral veem exatamente os mesmos serviços de antes, e os serviços "Ambos" passam a valer também para professores e técnicos. *Verificado em 2026-11-16: o teste de integração roda no próprio banco a expressão de conversão escrita na migration `20261116300100_service_offered_to` e compara com a regra antiga: para alunos e público geral, cada serviço continua visível exatamente como antes; "ambos" passa a incluir professores e técnicos. Na produção, os 9 serviços eram "ambos" (conferido no envio).*
- [x] **CA-PRT-04** — A fila filtra e mostra os quatro tipos; painel, análises e CSV têm os quatro. *Verificado em 2026-11-16: integração (a solicitação guarda cada um dos quatro tipos; a fila filtra cada um; painel, análises e exportação contam os quatro).*

## 5. Parte B — Guia rápido de professores e técnicos

### 5.1 Escopo

1. Página **"Guia rápido de professores e técnicos"** (`/help/servidores`), como a do estudante: passos para pedir um serviço, **reservar um espaço** (com a reserva semanal), **acompanhar e cancelar reservas** e, para professores, **pedir a alocação de uma prova**.
2. Aviso por perfil e tipo (professor, técnico, outro solicitante, sem login), links só para quem pode usar as telas, nomes de tela conferidos por teste (as mesmas regras da SPEC do guia do estudante).
3. Links na Ajuda e nas subseções do catálogo de professores e técnicos.

### 5.2 Critérios de aceitação

- [x] **CA-PRT-05** — O guia abre sem login e com cada perfil, com o aviso certo para cada tipo; o passo da prova é apresentado aos professores; cada nome de tela citado existe no código. *Verificado em 2026-11-16 (SF-293): unitário `staff-guide.test.ts` (passos, o da prova marcado para professores, aviso de cada perfil e tipo, links só para o solicitante, cada nome de tela citado existe no código; e o guia do estudante deixou de chamar professor de aluno) e E2E (o guia aberto pelo link do catálogo, com o aviso de professora).*

## 6. Parte C — Espaços (salas e laboratórios)

### 6.1 Escopo

1. Cadastro de espaços (P5) pela seção **"Espaços"** da administração e pela página de quem gere serviços do setor (P6): criar, editar, desativar e reativar, com auditoria.
2. Página **"Espaços"** na área do solicitante: os espaços ativos, com filtro por tipo, capacidade mínima e setor, e a **agenda da semana** de cada um (P12).

### 6.2 Regras

1. Nome único por setor; capacidade de 1 a 1.000.
2. Um espaço desativado some da lista de reserva; suas reservas futuras Pendentes ou Confirmadas continuam visíveis e a equipe decide se as cancela (com motivo).
3. Mudar a capacidade não invalida reservas já feitas.

### 6.3 Critérios de aceitação

- [x] **CA-PRT-06** — O administrador e quem gere serviços do setor cadastram, editam, desativam e reativam espaços (este último só do próprio setor); tudo entra na auditoria. *Verificado em 2026-11-16 (SF-288): integração `spaces-reservations.test.ts` (o administrador cria, muda, desativa e reativa, com as quatro entradas de auditoria do tipo "Espaço"; nome repetido e capacidade fora do limite recusados; quem tem "Gerir serviços do setor" só mexe nos espaços do próprio setor) e E2E (a seção "Espaços" da administração).*
- [x] **CA-PRT-07** — A página "Espaços" lista os espaços ativos com filtros e a agenda da semana, com quem reservou e a finalidade. *Verificado em 2026-11-16 (SF-289): integração (filtros de tipo e capacidade, espaço inativo fora da lista e da agenda do solicitante; a agenda mostra a outra pessoa quem reservou e a descrição) e E2E (a semana mostra a reserva feita).*

## 7. Parte D — Reservas

### 7.1 Escopo

1. Reserva simples ou semanal, por qualquer solicitante (P7, P8, P9), com conferência de capacidade, horário, feriado e conflito antes de gravar.
2. **"Minhas reservas"**: as próprias reservas por situação, com cancelamento (uma data ou a série a partir dela).
3. **"Reservas"** na área do atendente e do gestor: as pendentes dos espaços do setor, para confirmar ou recusar (com motivo), e as confirmadas, para cancelar (com motivo) (P10).
4. Notificações (P14).

### 7.2 Regras

1. Duas reservas Pendentes ou Confirmadas do mesmo espaço nunca se sobrepõem, nem com duas pessoas reservando ao mesmo tempo (P11).
2. Uma reserva recusada ou cancelada libera o horário na hora.
3. Uma série semanal é conferida inteira antes de gravar (P8).
4. Confirmar, recusar e cancelar pelo setor seguem a página "Reservas" da equipe, como a fila (P10, P17); o solicitante cancela as próprias em "Minhas reservas".

### 7.3 Critérios de aceitação

- [x] **CA-PRT-08** — O solicitante reserva um espaço (simples e semanal); as regras de horário, capacidade, feriado e passado são conferidas; numa série com conflito, nada é gravado e as datas aparecem. *Verificado em 2026-11-16 (SF-290): integração (pendente e automática; capacidade, horário, passos de 15 minutos e passado recusados; série semanal com uma data ocupada e um feriado do setor: nada gravado e as duas datas listadas; série sem problema gravada com um só identificador de série) e E2E (reserva enviada ao setor; série sobre o mesmo horário recusada com a data).*
- [x] **CA-PRT-09** — O banco recusa a sobreposição mesmo com duas reservas gravadas ao mesmo tempo (teste de concorrência), e recusada ou cancelada libera o horário. *Verificado em 2026-11-16: integração com quatro reservas do mesmo horário disparadas ao mesmo tempo (uma gravada, as outras recusadas como conflito) e uma gravação direta na tabela recusada pela restrição `SpaceReservation_no_overlap`; depois da recusa pelo setor, o horário volta a ficar livre.*
- [x] **CA-PRT-10** — A equipe do setor confirma, recusa e cancela com as regras de motivo; a confirmação automática nasce Confirmada; as notificações chegam a quem deve. *Verificado em 2026-11-16 (SF-291): integração (confirmar, recusar e cancelar, com o motivo obrigatório; atendente de outro setor não age; o solicitante recebe as três notificações; a equipe recebe a de reserva pendente; cancelamento de uma data ou das próximas da série, só antes de começar) e E2E (o atendente confirma na página "Reservas").*

## 8. Parte E — Alocação de provas

### 8.1 Escopo

1. **"Pedir alocação de prova"** na área do solicitante, apresentada aos professores (P9, P13), e "Minhas provas" com a situação de cada pedido.
2. Na página "Reservas" da equipe, a aba **"Provas"**: os pedidos pendentes do setor, com a sugestão de espaços livres que cobrem os alunos, a escolha final da equipe, e a recusa com motivo.
3. Alocar cria as reservas Confirmadas ligadas ao pedido; cancelar o pedido libera todas.

### 8.2 Regras

1. A soma das capacidades dos espaços alocados cobre o número de alunos; cada espaço está livre no horário (P11 vale também aqui).
2. A sugestão usa só espaços ativos do setor, do tipo pedido; prefere menos espaços e, entre combinações com o mesmo número, a menor sobra de lugares.
3. Um pedido alocado não é realocado nesta SPEC: para trocar, o professor cancela e pede de novo, ou a equipe cancela com motivo.

### 8.3 Critérios de aceitação

- [x] **CA-PRT-11** — O pedido de prova é feito na área do solicitante; a equipe vê a sugestão, aloca um ou mais espaços que cobrem os alunos e estão livres, ou recusa com motivo; o professor é notificado. *Verificado em 2026-11-16 (SF-292): integração (a equipe recebe o pedido; o espaço ocupado sai dos candidatos; a sugestão cobre os alunos com o menor número de salas; alocar uma sala pequena demais é recusado, alocar uma ocupada também; a alocação grava reservas confirmadas de "Aplicação de prova" para a professora, com os alunos divididos; ela é notificada) e E2E (a sugestão já vem marcada e a prova aparece "Alocada" com as duas salas).*
- [x] **CA-PRT-12** — Cancelar um pedido alocado libera as reservas; alocar um espaço ocupado é recusado pelo banco. *Verificado em 2026-11-16: integração (cancelar o pedido alocado cancela as duas reservas e o horário volta a aceitar reserva; recusa sem motivo recusada; outro setor não age).*

## 9. Testes

- **Unitários:** tipos e rótulos, conversão do público antigo para a lista, leitura do CSV, regras de horário e de série, sugestão de espaços, guia.
- **Integração:** migration (o que alunos e público geral veem não muda), catálogo e abertura por tipo, restrição de exclusão com escrita simultânea, confirmação e cancelamento por setor, alocação e cancelamento de prova, auditoria, configuração v5.
- **E2E:** administrador cadastra espaço e muda o tipo de Ana para professora; ela reserva (simples e semanal), a equipe confirma e recusa; pedido de prova alocado em dois espaços; guia; as páginas novas na verificação de largura e na varredura de acessibilidade.

## 10. Tarefas e estimativa

| Tarefa | Conteúdo | Horas | Linhas TS (cloc) |
|---|---|---|---|
| SF-285 | Migration dos tipos e da lista de público (P1), regras compartilhadas, cadastro, CSV, auditoria | 2,5 a 3,5 | 600 a 900 |
| SF-286 | Catálogo, mapa, pacotes, fila, painel, análises e CSV com os quatro tipos; configuração v5 | 2,5 a 3,5 | 600 a 900 |
| SF-287 | Migration de espaços e reservas, com a restrição de exclusão (P11) | 1,5 a 2 | 200 a 300 |
| SF-288 | Cadastro de espaços (administração e setor) e auditoria | 2 a 3 | 700 a 1.000 |
| SF-289 | Página "Espaços" e agenda da semana | 2 a 3 | 600 a 900 |
| SF-290 | Reserva simples e semanal, "Minhas reservas" e cancelamento | 3 a 4 | 900 a 1.300 |
| SF-291 | "Reservas" da equipe: confirmar, recusar, cancelar; notificações | 2,5 a 3,5 | 700 a 1.000 |
| SF-292 | Pedido de prova, sugestão de espaços, alocação e cancelamento | 3 a 4 | 900 a 1.300 |
| SF-293 | Guia rápido de professores e técnicos | 1,5 a 2 | 400 a 600 |
| SF-294 | Dados de demonstração, E2E e revisão final | 2,5 a 3,5 | 700 a 1.000 |
| **Total** | 10 tarefas | **23 a 31 h** | **6.300 a 9.200** |

Cada parte com migration (A e C/D) segue a rotina de produção: backup cifrado conferido, migration, push.

## 11. Esclarecimentos e revisão final (SF-285 a SF-294, 2026-11-16)

1. **Migrations:** `20261116300000_professor_technician_kinds` (os dois valores do enum, sozinhos, porque um valor novo só pode ser usado depois da sua própria migration), `20261116300100_service_offered_to` (a lista, convertida como P1; CHECK de 1 a 4 tipos; a coluna antiga e o enum antigo saem) e `20261116300200_spaces_reservations_exams` (extensão `btree_gist`, tabelas, CHECKs, restrição de exclusão, colunas novas da notificação com o CHECK "exatamente um alvo" e o tipo auditado "Espaço").
2. **Notificações (P14):** a notificação passou a poder apontar para uma reserva ou um pedido de prova; ao abrir, leva a "Minhas reservas", a "Alocação de provas" ou à página "Reservas" da equipe. Os oito tipos novos ficam na categoria "Situação" só para as listas: o módulo nunca grava e-mail para eles.
3. **Sem restrição nova (P17):** a área usa só as verificações que já existiam: solicitante para reservar e pedir prova; atendente ou gestor do setor do espaço para decidir, como na fila; administrador ou "Gerir serviços do setor" para cadastrar espaços. A agenda mostra quem reservou a todos. O menu do solicitante ganhou "Espaços" para todos os tipos (P9: apresentada a professores e técnicos pelo catálogo e pelo guia, sem bloqueio).
4. **LGPD (regra que já existia):** a anonimização de uma pessoa também troca os textos das suas reservas e pedidos de prova e os motivos que ela escreveu, como já fazia com solicitações e comentários; as reservas continuam. "Meus dados" ainda não inclui reservas e provas (fica para uma SPEC própria, se a responsável quiser).
5. **Guia do estudante:** com os tipos novos, o aviso dele dizia "cadastrado como aluno" a um professor; agora diz o tipo certo e aponta para o guia de professores e técnicos.
6. **Memória da verificação de tipos:** com as tabelas e os testes novos, o `tsc` do projeto inteiro passou de 2 GB (2,25 GB medidos), o limite padrão do Node nesta máquina, e o `next build` também verificava os testes. O build passou a verificar só a aplicação (`tsconfig.build.json`, 1,28 GB) e o `npm run typecheck` (CI) verifica tudo com 4 GB. Nenhuma dependência mudou. Na mesma investigação achei uma falha minha: verificações anteriores filtravam a saída do `tsc` com `grep "^src"`, o que esconderia um estouro de memória; daqui em diante, o código de saída é conferido.
7. **Exceções ao "sem mudar asserções" (consequências diretas desta SPEC):** a versão da configuração (4 → 5, e os exemplos de versão desconhecida 5 → 6); os testes que gravavam o público antigo (`audience`) passaram a gravar a lista; o exemplo de tipo desconhecido do CSV deixou de ser "professor"; a mensagem do tipo desconhecido do CSV lista os quatro; a lista completa dos tipos auditados e das categorias de notificação ganhou os itens novos; o E2E dos tipos de solicitante marca as caixas de "Oferecido a" em vez do seletor.
8. **Resultados:** unitários 2.116/2.116; integração 841/841 (191 arquivos, com os novos `professor-technician-kinds` e `spaces-reservations`); lint, typecheck e build OK; E2E completo 85/85 (com o novo professors-technicians.spec.ts e as páginas novas na verificação de largura e na varredura axe).
