# SPEC — Guia rápido do estudante

**Data:** 2026-11-16
**Status:** Escrita em 2026-11-16 a pedido da responsável ("apos estas tarefaz crie o manual do aluno, um guia rápido para solicitar serviços"; depois, "prossiga com o guia do estudante do nível superior"). Formato escolhido pelo agente entre os três oferecidos (tópico da Ajuda, documento no repositório, página compartilhável), pela recomendação já feita: página dentro da Ajuda do sistema, que acompanha o código e as telas. Os padrões G1 a G6 (seção 3) seguem a SPEC da Ajuda e podem ser revistos pela responsável. **Concluída em 2026-11-16** (SF-282 e SF-283; CA-GUI-01 a 05).
**Projeto:** ServiceFlow
**Referências:** `SPEC/2026-11-15-ajuda-faq.md` (a página "Ajuda"), `SPEC/2026-11-16-tipos-de-solicitante.md` (aluno e público geral), `SPEC/2026-11-15-mapa-de-servicos.md` (o mapa).

## 1. Objetivo

Um **guia rápido, passo a passo**, para o estudante de nível superior que usa o ServiceFlow como solicitante (tipo "Aluno"): como entrar, achar o serviço, abrir a solicitação, acompanhar, responder ao atendimento e encerrar. A Ajuda já responde a perguntas soltas; o guia dá a sequência, do primeiro acesso à avaliação, numa página só que se lê em poucos minutos.

## 2. Escopo

1. **Página `/help/aluno`, "Guia rápido do estudante":** aberta a todos, com ou sem login, como a Ajuda.
2. **Passos numerados** (lista ordenada), cada um com: o que fazer, a tela onde se faz (pelo nome do menu ou do botão) e uma dica. Passos: entrar; achar o serviço (catálogo, subseção "Serviços para alunos", e o mapa); abrir a solicitação; acompanhar; responder quando o atendimento pede; cancelar ou reabrir; avaliar.
3. **Antes de enviar:** uma lista curta do que conferir (serviço certo, descrição clara, campos e documentos).
4. **O que cada situação quer dizer:** as situações da solicitação e do prazo, com os mesmos nomes das telas (vindos de `src/shared/requests`, para não haver dois textos).
5. **Sozinho ou com atendimento:** o que o estudante resolve na própria conta e quando precisa abrir uma solicitação, apontando para o "Mapa de serviços".
6. **Aviso por perfil:** sem login, como entrar; aluno, a confirmação de que o guia é para ele; público geral, o aviso de que os passos valem, mas o catálogo mostra os serviços do público geral; outro perfil, o aviso de que o guia descreve a área do solicitante.
7. **Acesso:** link "Guia rápido do estudante" no topo da página "Ajuda" e na subseção "Serviços para alunos" do catálogo; o guia tem o caminho de volta para a Ajuda.
8. **Conteúdo no código:** em `src/modules/help`, como as perguntas da Ajuda; sem tabela, migration ou tela de edição.

## 3. Detalhes (padrões adotados)

- **G1 — Um guia genérico:** o sistema não traz serviços acadêmicos prontos (eles são cadastráveis); o guia não cita nenhum serviço que a organização possa não ter, e os exemplos dizem "por exemplo" e "se a sua organização oferecer".
- **G2 — Links só para quem pode usar:** com login de solicitante, os nomes das telas viram links; sem login ou em outro perfil, ficam como texto (o link levaria a uma tela recusada).
- **G3 — Leitura mínima:** a página lê só o perfil e, para o solicitante, o tipo (aluno ou público geral); nenhum outro dado do banco.
- **G4 — Sem busca própria:** o guia é curto; a busca continua na Ajuda.
- **G5 — Impressão:** a página é legível impressa (os passos sem o menu); nenhum PDF gerado.
- **G6 — Fora do menu:** o menu do solicitante não ganha item novo; o guia se alcança pela Ajuda e pelo catálogo.

## 4. Fora de escopo

- Serviços acadêmicos de exemplo nos dados de demonstração; guia para o público geral, para atendente ou gestor; vídeo, tour guiado na tela, tradução.
- Mudança em qualquer tela do solicitante além do link do catálogo.

## 5. Regras

1. **Só o que existe:** cada passo descreve uma função de hoje, com o nome da tela ou do botão como aparece; nada de recurso futuro.
2. **Um nome só:** as situações da solicitação e do prazo vêm das constantes compartilhadas usadas pelas telas.
3. **Acessível:** títulos em ordem, passos numa lista ordenada, aviso do perfil com `role="note"`; a página entra na verificação de largura e na varredura automática como as outras.
4. **Nada pessoal:** além de G3, nada sobre a pessoa aparece na página.

## 6. Critérios de aceitação

- [x] **CA-GUI-01** — `/help/aluno` abre sem login e com cada perfil, com os passos na ordem da seção 2 item 2, a lista "Antes de enviar", as situações e "Sozinho ou com atendimento". *Verificado em 2026-11-16 (SF-282 e SF-283): unitário `student-guide.test.ts` (ordem dos sete passos, títulos das quatro seções na ordem, lista ordenada) e E2E `student-guide.spec.ts` (sem login, como aluno, como público geral e como atendente).*
- [x] **CA-GUI-02** — O aviso do topo muda com o perfil e, para o solicitante, com o tipo (aluno ou público geral), como na seção 2 item 6; os nomes de tela são links só para o solicitante. *Verificado em 2026-11-16: unitário (aviso de cada perfil e de cada tipo; solicitante sem tipo lido é aluno, como T4; links só para o solicitante) e E2E (os três avisos e os links do aluno e do público geral; nenhum link no conteúdo sem login nem para o atendente).*
- [x] **CA-GUI-03** — Os links "Guia rápido do estudante" da Ajuda e do catálogo do aluno levam ao guia, e o guia volta para a Ajuda. *Verificado em 2026-11-16: E2E chega ao guia pelo link da Ajuda (sem login) e pelo da subseção "Serviços para alunos" do catálogo; o público geral não vê esse link; "Voltar à Ajuda" leva a `/help`.*
- [x] **CA-GUI-04** — Cada nome de tela ou botão citado existe nas telas (conferido por teste); as situações têm o mesmo texto das telas. *Verificado em 2026-11-16: o unitário procura cada nome de tela ou botão citado no código de `src/` (sem contar o próprio guia) e compara as situações com `REQUEST_STATUS_LABELS` e `SLA_SITUATION_LABELS`.*
- [x] **CA-GUI-05** — Nenhuma migration nem dependência nova; as suítes anteriores passam sem mudar asserções. *Verificado em 2026-11-16: `package.json` e `prisma/` sem mudança; unitários 2.081/2.081, lint, typecheck e build OK; E2E da Ajuda, dos tipos de solicitante, do mapa, a verificação responsiva e a varredura axe (que passaram a incluir `/help/aluno`) verdes. A suíte de integração não foi rodada: nada do banco nem dos casos de uso mudou.*

## 7. Testes

- **Unitários:** ordem e conteúdo dos passos, aviso por perfil e tipo, links só para o solicitante, situações iguais às constantes, nomes de tela presentes no código das telas, desenho da página.
- **E2E:** sem login, aluno e público geral (o tipo trocado no banco e devolvido no fim); links da Ajuda e do catálogo; a página nas larguras da verificação responsiva.

## 8. Tarefas e estimativa

| Tarefa | Conteúdo | Horas | Linhas TS (cloc) |
|---|---|---|---|
| SF-282 | Conteúdo do guia no módulo `help`, a página `/help/aluno` e os links | 1,5 a 2 | 350 a 500 |
| SF-283 | Testes unitários e E2E, revisão dos critérios | 1 a 1,5 | 250 a 400 |
| **Total** | 2 tarefas | **2,5 a 3,5 h** | **600 a 900** |

## 9. Esclarecimentos e revisão final (SF-282 e SF-283, 2026-11-16)

1. **Entrada:** o sistema não tem tela de login própria (o endereço `/login` leva à entrada); o primeiro passo repete o que a Ajuda já diz (e-mail e senha cadastrados pela instituição; no modo demonstração, "Entrar como Solicitante").
2. **Duas afirmações tiradas na revisão** por não estarem garantidas pelas telas: "guarde o número da solicitação" (a tela de abertura não destaca um número) e "a equipe é avisada" do prazo vencido. Ficaram "a solicitação passa a aparecer em Minhas solicitações" e "o pedido continua no atendimento".
3. **Leitura do tipo:** se a leitura do tipo falhar, o guia trata o solicitante como aluno (o padrão T4), sem derrubar a página.
4. **Verificação de largura e axe:** `/help/aluno` entrou na lista de páginas públicas e na do solicitante; nenhuma asserção antiga mudou.
5. **Revisão:** 5 de 5 critérios marcados; sem migration.
