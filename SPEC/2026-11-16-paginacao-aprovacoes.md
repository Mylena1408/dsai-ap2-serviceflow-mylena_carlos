# SPEC — Paginação de "Aprovações"

**Data:** 2026-11-16
**Status:** Aprovada em 2026-11-16 na revisão das SPECs ("vamos rever as specs"), com a escolha "Paginar Aprovações" para fechar o CA-DVO-01 de `SPEC/2026-11-06-desempenho-volume.md`. Os detalhes Q1 a Q4 (seção 3) seguem o padrão já usado na fila e podem ser revistos pela responsável. **Concluída em 2026-11-16** (SF-284; CA-PAP-01 a 04).
**Projeto:** ServiceFlow
**Referências:** `SPEC/2026-11-06-desempenho-volume.md` (seção 7, o achado), `SPEC/2026-10-31-busca-filtros-paginacao.md` (a paginação da fila), `SPEC/2026-11-01-aprovacoes.md` (5.7, a ordem da lista).

## 1. Objetivo

A página "Aprovações" do gestor (`/approvals`) carrega todas as solicitações do filtro, cada uma com o histórico completo: no banco de medição, 4,3 s em "Pendentes" (7.001) e 13,8 s em "Todas" (21.003), acima da meta de 2 s. Paginar a lista no banco resolve sem mudar o que o gestor vê em cada item.

## 2. Escopo

1. **"Pendentes", "Todas" e "Todas do setor"** passam a mostrar **20 solicitações por página**, com "Página X de Y — N solicitações" e os links "Anterior" e "Próxima" (o mesmo componente da fila), que mantêm o filtro.
2. A consulta da lista lê do banco **só a página pedida** e só os campos que o item mostra (serviço, situação, aprovação e nível, descrição, data); o histórico completo continua só no detalhe.
3. A **API** (`GET /api/v1/requests` do gestor) usa a mesma consulta paginada; a resposta não muda de formato.

## 3. Detalhes

- **Q1 — Ordem:** a mesma de hoje (SPEC de aprovações, 5.7): pendentes primeiro, e dentro de cada grupo da mais antiga para a mais nova; "Todas do setor" na ordem de abertura.
- **Q2 — Página fora do limite:** uma página maior que a última mostra a última; número inválido na tela mostra a primeira, e na API continua sendo erro de validação, como hoje.
- **Q3 — Tamanho:** 20 por página, como a fila e "Minhas solicitações"; sem escolha de tamanho.
- **Q4 — Sem migration:** se a medição pedir índice, ele entra em migration própria, registrada aqui antes.

## 4. Regras

1. Quem vê cada solicitação não muda: os mesmos filtros de setor, cobertura de ausências e permissão "Ver todas as solicitações do setor".
2. A soma das páginas é exatamente a lista de antes, na mesma ordem, sem repetição nem falta.
3. O nível de aprovação mostrado ("Nível X de Y") continua igual.

## 5. Critérios de aceitação

- [x] **CA-PAP-01** — Nos três filtros, a lista tem 20 por página com a navegação que mantém o filtro; juntas, as páginas trazem as mesmas solicitações, na mesma ordem, que a lista antiga (teste de integração com mais de 40 solicitações, pendentes e decididas, e cobertura de ausência). *Verificado em 2026-11-16 (SF-284): integração `approvals-pagination.test.ts` com 45 solicitações num setor e 13 noutro (pendentes, aprovadas, rejeitadas e sem aprovação, intercaladas no tempo, duas no mesmo instante): nos três filtros, as páginas juntas são exatamente a lista antiga, sem repetição, pendentes primeiro; a página além da última é a última e um número inválido é a primeira; com uma ausência, o substituto vê as páginas dos dois setores.*
- [x] **CA-PAP-02** — A API do gestor devolve as mesmas páginas de antes (mesmos itens, `page`, `pageCount` e `total`). *Verificado em 2026-11-16: integração `approvals-pagination-api.test.ts` (sem simular a sessão; a API lê o token): 42 solicitações em 3 páginas, na ordem da tela, com `page`, `pageCount` e `total`; página além da última devolve a última; `page=0` continua 400.*
- [x] **CA-PAP-03** — No banco de medição `serviceflow_perf`, "Pendentes", "Todas" e "Todas do setor" respondem em menos de 2 s; com isso o CA-DVO-01 é fechado. *Verificado em 2026-11-16 no `serviceflow_perf` (98.014 solicitações; migrations locais atualizadas para 63; a permissão "Ver todas as solicitações do setor" concedida ao gestor só nesse banco), com `next start` e cada página aberta duas vezes, valendo a segunda: "Pendentes" (7.001) 253 ms, "Todas" (21.003) 198 ms, "Todas do setor" (98.014) 147 ms; a página 2 e as últimas páginas de 105 a 226 ms. Antes: 4,3 s e 13,8 s.*
- [x] **CA-PAP-04** — Nenhuma dependência nova; sem migration (ou com a do Q4, registrada); as suítes anteriores passam sem mudar asserções, exceto as que contavam a lista inteira numa página só (registradas como exceção). *Verificado em 2026-11-16: sem migration e sem dependência nova; unitários 2.081/2.081, lint e typecheck OK; integração das telas e da API do gestor (35 testes de 6 arquivos) e E2E de aprovações, níveis, ausências e acesso do gestor (4/4) passaram sem mudar asserções. A função antiga da lista (`listManagerApprovals`) continua, e os testes antigos a usam.*

## 6. Tarefas e estimativa

| Tarefa | Conteúdo | Horas | Linhas TS (cloc) |
|---|---|---|---|
| SF-284 | Consulta paginada, página, API, testes e medição | 2 a 3 | 300 a 500 |

## 7. Esclarecimentos (SF-284, 2026-11-16)

1. **Como a página é lida:** a lista tem dois trechos em sequência (pendentes; depois as decididas), cada um da mais antiga para a mais nova. O banco conta os dois, lê só os identificadores da página com deslocamento e carrega com o histórico apenas essas 20 solicitações. A ordem é a mesma da lista antiga, que ordenava no servidor depois de ler tudo.
2. **API:** a validação do número da página continua a mesma (inteiro a partir de 1, senão 400); a leitura passou a ser a mesma da tela.
3. **Links de página:** o componente de paginação da fila passou a manter o parâmetro `filter`, usado só por "Aprovações".
4. **Medição:** o banco local de medição estava com 47 migrations; as 16 seguintes foram aplicadas nele antes de medir.
