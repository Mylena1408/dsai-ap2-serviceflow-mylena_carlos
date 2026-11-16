# SPEC — Tipos de solicitante: aluno e público geral

**Data:** 2026-11-16
**Status:** Escrita em 2026-11-16, a pedido da responsável ("o aluno pode ser o solicitante, mas não deve ser considerado um usuário externo, faça uma subseção para o atendimento de solicitante, caso seja aluno e outro caso seja público geral"), com as escolhas T1 a T3; os detalhes T4 a T9 aprovados em 2026-11-16 ("pode prosseguir com t4 a t9"). **Concluída em 2026-11-16** (SF-276 a SF-281; CA-TIP-01 a 05).
**Projeto:** ServiceFlow
**Referências:** `SPEC/2026-09-30-catalogo-e-solicitacoes.md` (perfis, catálogo, cópias na solicitação), `2026-11-09-comunicacao-e-calendarios.md` (importação de usuários), `2026-11-15-mapa-de-servicos.md`, `2026-11-02-painel-relatorios.md` e `2026-11-06-analises-operacionais.md`, `2026-11-07-operacao-e-automacao.md` (configuração portátil, pacotes), `2026-11-02-api-externa-webhooks.md`.

## 1. Objetivo

O perfil **Solicitante** passa a ter um **tipo**: **Aluno**, que é público **interno** da organização (como os solicitantes de hoje), ou **Público geral**, que é **externo**. Cada serviço diz para qual público é oferecido. O atendimento ganha uma subseção por tipo: no catálogo e no mapa, a pessoa vê a parte do seu público; na fila, o atendente sabe e filtra quem é aluno e quem é público geral; nos painéis e nas análises, os números aparecem separados.

## 2. Decisões escolhidas pela responsável (2026-11-16)

| # | Questão | Escolha |
|---|---|---|
| T1 | Como saber o tipo | Campo no cadastro da pessoa, marcado pelo administrador (também na importação por CSV); migration aditiva |
| T2 | Onde fica a subseção | Catálogo e mapa de serviços (por público do serviço), fila do atendente (tipo visível e filtro) e painéis e análises (números por tipo) |
| T3 | Restrição do público geral | Só os serviços do seu público; mesmas telas e regras do solicitante; nada muda em login, senha, permissões, API própria nem ajuda |

## 3. Detalhes (aprovados em 2026-11-16)

| # | Questão | Proposta | Alternativa |
|---|---|---|---|
| T4 | Solicitantes que já existem | Ficam como **Aluno** (interno), então nada muda para eles | Ficam sem tipo até o administrador marcar |
| T5 | Serviços que já existem | Ficam para **Alunos e público geral** (ambos), então ninguém perde acesso | Ficam só para alunos |
| T6 | Tipo nas solicitações antigas e novas | A solicitação guarda o tipo de quem abriu, como já guarda serviço, categoria e setor (regra das cópias); mudar o tipo da pessoa depois não muda o passado; as antigas recebem "Aluno" | Ler sempre o tipo atual da pessoa |
| T7 | Importação por CSV | Coluna nova opcional `tipo` (`aluno` ou `publico geral`, sem diferenciar acentos e maiúsculas); vazia para solicitante = Aluno; preenchida para outro perfil = erro da linha | Coluna obrigatória |
| T8 | Configuração portátil | Versão 4: o público de cada serviço entra no arquivo; as versões 1 a 3 continuam aceitas, com "ambos" | Deixar o público fora do arquivo (perde-se ao exportar e importar) |
| T9 | Pacotes | Um pacote aparece para a pessoa só se todos os seus serviços são do público dela (a regra de hoje: "só pacotes que podem ser abertos agora") | Mostrar o pacote com só os serviços permitidos |

## 4. Escopo

### 4.1 Cadastro (administração)

1. **Pessoa:** campo "Tipo de solicitante" (Aluno ou Público geral), obrigatório e visível só quando o perfil é Solicitante; mudar o perfil para outro limpa o tipo. A auditoria registra a mudança como as demais do cadastro.
2. **Importação por CSV:** coluna `tipo` (T7); a prévia mostra o tipo de cada linha.
3. **Serviço:** campo "Público do serviço": Alunos, Público geral ou Alunos e público geral; auditado; entra na configuração portátil (T8).

### 4.2 Solicitante (catálogo, mapa, abertura)

1. **Catálogo:** a página mostra a subseção do tipo da pessoa ("Serviços para alunos" ou "Serviços para o público geral"), com os serviços desse público e os de ambos; os pacotes seguem T9.
2. **Mapa de serviços:** mostra só os serviços e pacotes do público da pessoa e diz para qual público ele é; os artigos de "Você resolve sozinho" seguem o mesmo filtro.
3. **Abertura:** o servidor recusa abrir serviço ou pacote de outro público, pela tela e pela API, como "não encontrado" (a mesma resposta de um serviço indisponível, sem revelar que existe).
4. **Página do serviço** de outro público: "não encontrado", como serviço inativo.

### 4.3 Atendimento (fila e detalhe)

1. A fila e o detalhe da solicitação mostram o tipo de quem pediu ("Aluno" ou "Público geral"), pela cópia guardada na solicitação (T6).
2. A fila ganha o filtro "Tipo de solicitante" (todos, alunos, público geral), que também vale nas visões salvas e nas ações em lote.

### 4.4 Painéis e análises

1. O painel do gestor e o da administração ganham o grupo "Por tipo de solicitante": abertas, pendentes e concluídas no prazo, como os grupos que já existem.
2. "Análises" ganha a tabela "Por tipo de solicitante" no período: abertas, concluídas, tempo médio de resolução e nota média da avaliação.
3. A exportação CSV das solicitações ganha a coluna do tipo.

## 5. Regras

1. **Aluno é interno:** para o sistema, é o solicitante de hoje; nenhuma regra muda para ele.
2. **Público geral é externo** só no que diz respeito aos serviços: vê e abre apenas os do seu público ou de ambos (T3). Login, senha, permissões, tokens, notificações, comentários e avaliação seguem iguais.
3. **Um tipo só para solicitante:** o banco garante (CHECK) que todo solicitante tem tipo e que os outros perfis não têm.
4. **A cópia não muda:** o tipo gravado na solicitação é o de quem abriu, no momento da abertura (regra das cópias da SPEC principal, seção 12).
5. **Sem vazamento:** serviço, pacote ou artigo de outro público não aparece nem é aceito, e a recusa não diz que ele existe.
6. **Nada muda para quem não usa:** com os padrões T4 e T5, todas as telas e regras de hoje continuam iguais até o administrador marcar alguém como público geral ou um serviço como de um só público.

## 6. Fora de escopo

- Cadastro feito pelo próprio público geral (autoatendimento de conta), login sem convite, regras de senha ou de acesso diferentes por tipo.
- Outros tipos além de aluno e público geral (por exemplo, servidor ou professor); a estrutura permite acrescentar depois, com nova SPEC.
- Notificação, e-mail ou texto de tela diferente por tipo.

## 7. Critérios de aceitação

- [x] **CA-TIP-01** — O administrador define o tipo do solicitante no cadastro e na importação, e o público de cada serviço; o banco recusa solicitante sem tipo e tipo em outro perfil; tudo auditado. *Verificado em 2026-11-16 (SF-276 e SF-277): integração `requester-kinds.test.ts` (o banco dá "Aluno" ao solicitante sem tipo, limpa o tipo ao mudar o perfil e tem o CHECK; cadastro e serviço auditados; tipo em outro perfil recusado), unitário da coluna `tipo` do CSV e integração da configuração v4; E2E `requester-kinds.spec.ts` (o administrador cria um serviço "Só alunos" e marca a solicitante de demonstração como público geral).*
- [x] **CA-TIP-02** — O solicitante vê no catálogo e no mapa a subseção do seu tipo, só com serviços, pacotes e artigos do seu público ou de ambos; abrir serviço ou pacote de outro público é recusado como "não encontrado", pela tela e pela API. *Verificado em 2026-11-16 (SF-278): integração (cada tipo lista e abre só os serviços do seu público ou de ambos; o de outro público é "não encontrado" na página e na abertura, que é o caminho da tela, da API e dos pacotes) e E2E (subseção "Serviços para o público geral" no catálogo e no mapa, sem o serviço dos alunos; abertura do serviço para todos).*
- [x] **CA-TIP-03** — A solicitação guarda o tipo de quem abriu; a fila e o detalhe o mostram; o filtro da fila separa alunos e público geral, também nas visões salvas e nas ações em lote. *Verificado em 2026-11-16 (SF-276 e SF-279): integração (a solicitação guarda o tipo de quem abriu e não muda depois; o filtro da fila separa os dois; o parâmetro entra nas visões salvas) e E2E ("Solicitante: Público geral" na fila e o filtro).*
- [x] **CA-TIP-04** — Painel, análises e exportação mostram os números por tipo de solicitante. *Verificado em 2026-11-16 (SF-280): integração `reports-requester-kind.test.ts` (painel por tipo, análises com abertas, concluídas, tempo médio e nota média, e a coluna da exportação) e E2E (o gestor vê o grupo do painel e a tabela de "Análises").*
- [x] **CA-TIP-05** — Com os padrões T4 e T5, nada muda para quem já usa o sistema: as suítes anteriores passam sem mudar asserções; a migration é aditiva e a configuração portátil aceita as versões 1 a 4. *Verificado em 2026-11-16, com as exceções da seção 10: os padrões T4 e T5 mantêm tudo como antes para quem já usa (a migration é aditiva e, com o gatilho do banco, os 322 pontos de teste que criam solicitantes sem tipo seguem iguais); a configuração portátil aceita as versões 1 a 4.*

## 8. Testes

- **Unitários:** regras do tipo (perfil e tipo, padrões), público do serviço, filtro do catálogo, do mapa e dos pacotes, coluna do CSV, formato v4, rótulos das telas.
- **Integração:** CHECK do banco, cópia na solicitação, recusa da abertura de outro público (tela e API), filtro da fila e do lote, números do painel e das análises, auditoria, configuração v4.
- **E2E:** o administrador marca um solicitante como público geral e um serviço só para alunos; o público geral não vê nem abre esse serviço; o atendente vê o tipo e filtra a fila; o gestor vê os números por tipo.

## 9. Tarefas e estimativa

| Tarefa | Conteúdo | Horas | Linhas TS (cloc) |
|---|---|---|---|
| SF-276 | Migration (tipo na pessoa e na solicitação, público no serviço, CHECKs, padrões T4 a T6), domínio e auditoria | 2 a 3 | 250 a 400 |
| SF-277 | Administração: tipo no cadastro e na importação CSV, público no serviço, configuração portátil v4 | 2 a 3 | 300 a 450 |
| SF-278 | Solicitante: subseção no catálogo e no mapa, filtro de pacotes e artigos, recusa da abertura (tela e API) | 2 a 3 | 300 a 450 |
| SF-279 | Atendimento: tipo na fila e no detalhe, filtro da fila, visões salvas e lote | 1,5 a 2,5 | 200 a 350 |
| SF-280 | Painel, análises e exportação por tipo | 1,5 a 2,5 | 200 a 350 |
| SF-281 | E2E e revisão final | 1 a 1,5 | 150 a 250 |
| **Total** | 6 tarefas | **10 a 15,5 h** | **1.400 a 2.250** |

**Com migration:** o envio segue a rotina backup → migration no Neon → push.

## 10. Esclarecimentos e revisão final (SF-276 a SF-281, 2026-11-16)

1. **Gatilho no banco (decisão T4 e regra 3):** além do CHECK, um gatilho dá "Aluno" a um solicitante gravado sem tipo e limpa o tipo quando o perfil deixa de ser solicitante; outro copia o tipo da pessoa para a solicitação no momento em que ela é gravada (regra 4), qualquer que seja o caminho (tela, API, agenda recorrente, pacote, dados de demonstração). Assim a regra vale para todo escritor, e não só para a tela.
2. **Configuração portátil (decisão T8):** no arquivo, o público do serviço se chama `offeredTo`, porque `audience` já nomeia quem preenche um campo. Um arquivo das versões 1 a 3 não tem o público: os serviços que já existem no destino **ficam como estão**, e um serviço novo entra para "ambos" (mais cuidadoso do que sobrescrever todos com "ambos", e igual ao que as versões antigas já faziam com as listas que não tinham).
3. **Agenda recorrente:** se o serviço deixa de ser oferecido ao tipo do solicitante da agenda, a execução é pulada como "serviço indisponível", sem enum nem migration nova.
4. **Importação (decisão T7):** a coluna `tipo` é opcional e o arquivo modelo continua o mesmo (a tela explica a coluna); o cabeçalho também aceita "tipo de solicitante".
5. **Auditoria:** o tipo da pessoa entra como `requesterKind` ("Tipo de solicitante") e o público do serviço como `serviceAudience` ("Público do serviço"), seguindo o precedente dos avisos (`target`), porque `audience` já nomeia quem preenche um campo.
6. **Exceções ao CA-TIP-05 (asserções antigas atualizadas):** a versão da configuração (3 → 4, e os exemplos de versão desconhecida 4 → 5, como na SF-257); a coluna nova no fim do CSV de exportação (as linhas esperadas terminam em "Aluno"); e o registro de auditoria da criação de um solicitante, que agora traz o tipo (e o da troca de perfil, que o limpa). São consequências diretas do que esta SPEC pede (4.1, 4.4 item 3 e T8); nenhuma regra antiga mudou.
7. **Revisão:** 5 de 5 critérios marcados; a migration `20261116100000_requester_kinds` é aditiva e precisa da rotina backup → migration → push.
