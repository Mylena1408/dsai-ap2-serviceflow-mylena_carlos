# SPEC — Acessibilidade: telas responsivas, alto contraste e leitura em voz alta

**Data:** 2026-11-15
**Status:** Escrita em 2026-11-15, a pedido da responsável ("escreva a SPEC de acessibilidade"). **Aguarda a revisão das decisões L1 a L7 (seção 8) antes da primeira tarefa.**
**Projeto:** ServiceFlow
**Referências:**
- WCAG 2.2: 1.4.3 (contraste mínimo, AA), 1.4.6 (contraste aprimorado, AAA), 1.4.10 (refluxo: sem rolagem nas duas direções a 320 px CSS), 1.4.11 (contraste de elementos não textuais), 2.1.1 (teclado), 2.4.7 (foco visível), 4.1.2 (nome, função e valor).
- `SPEC/2026-11-06-contraste-textos.md` (SF-159): as cores normais já passam no AA, verificado com o `axe-core`.
- Web Speech API (`speechSynthesis`), parte do navegador.

## 1. Objetivo

Hoje o ServiceFlow é usado sobretudo no computador. Esta SPEC faz três coisas para que mais pessoas consigam usá-lo:

1. **Telas responsivas:** todas as telas funcionam no celular (a partir de 360 px de largura) e no tablet, sem rolagem lateral da página, com os menus recolhidos num botão e as tabelas largas rolando dentro de si mesmas.
2. **Alto contraste:** uma opção visível em todas as telas, inclusive na entrada e no login, que troca as cores por um tema de contraste reforçado.
3. **Leitura em voz alta:** para pessoas com baixa visão, um botão lê o conteúdo da tela, ou só o trecho selecionado, com pausar, continuar, parar e velocidade, em voz em português.

## 2. Levantamento (2026-11-15)

| Ponto | Hoje |
|---|---|
| Telas | 42 páginas (quatro áreas, conta, avisos, entrada, login) e a administração com cerca de 30 seções |
| Menus | Gestor com 14 links, atendente com 8, solicitante com 6; a administração já rola os links na horizontal |
| Tabelas de dados | 23 lugares com `data-table`, sem rolagem própria |
| CSS | `globals.css` com 1.895 linhas; regras para tela pequena só em 760 px, 720 px e 480 px; 87 cores escritas direto, fora das variáveis |
| Contraste | Cores normais no AA (SF-159); não há tema de alto contraste |
| Fala | Não há |
| Verificação automática | O `axe-core` 4.13 já está em `node_modules` (vem do `eslint-plugin-jsx-a11y`); a SF-159 o usou fora das suítes |

## 3. Garantia

Quem não usa os recursos novos continua com as telas como hoje, com duas exceções declaradas: o botão "Acessibilidade" aparece no topo de todas as telas, e, em telas estreitas, o menu passa a ficar recolhido num botão "Menu". Nada muda nas regras, nos dados, nas permissões ou no banco: **esta SPEC não tem migration**. As suítes anteriores passam sem mudar asserções, exceto as que localizam um link do menu numa tela estreita (passam a abrir o menu antes), se houver.

## 4. Parte A — Telas responsivas

### 4.1 Escopo

1. **Menus recolhíveis:** abaixo de 760 px, a navegação de cada área (solicitante, atendente, gestor) e a da administração ficam atrás de um botão "Menu" que abre e fecha a lista. O botão diz se está aberto (`aria-expanded`), funciona por teclado, e a tecla Esc fecha a lista e devolve o foco ao botão. Acima de 760 px, nada muda.
2. **Tabelas:** cada tabela de dados fica dentro de uma área com rolagem horizontal própria, com nome (a legenda da tabela) e alcançável por teclado, para que a página não role de lado.
3. **Formulários, cartões e filtros:** em uma coluna no celular, com alvos de toque de pelo menos 44 × 44 px nos botões e links do menu.
4. **Refluxo:** nenhuma página rola de lado a 360 px nem a 768 px.

### 4.2 Fora de escopo

- Aplicativo instalável (PWA), modo off-line, gestos e reorganização das telas para celular além do refluxo.

### 4.3 Regras

1. A largura de referência é 360 px (o menor celular comum); a WCAG pede 320 px CSS, conferido por amostra.
2. A ordem de leitura e de tabulação é a mesma em qualquer largura.
3. Gráficos e grades de "Análises" e do painel rolam dentro do próprio cartão, como as tabelas.

### 4.4 Critérios de aceitação

- [ ] **CA-RSP-01** — As páginas de cada perfil não rolam de lado a 360 px e a 768 px (E2E com a lista de páginas).
- [ ] **CA-RSP-02** — O menu recolhido abre e fecha pelo mouse e pelo teclado, diz seu estado e devolve o foco ao fechar.
- [ ] **CA-RSP-03** — As tabelas rolam dentro de si, com nome, e são alcançáveis pelo teclado.
- [ ] **CA-RSP-04** — Acima de 760 px as telas não mudam; nenhuma dependência nova.

## 5. Parte B — Alto contraste

### 5.1 Escopo

1. **Opção:** no botão "Acessibilidade", a escolha "Alto contraste" liga e desliga o tema na hora, sem recarregar a página, em todas as telas, inclusive na entrada e no login.
2. **Tema:** fundo escuro, textos claros, links e foco em amarelo, bordas visíveis em todos os campos e botões, links sempre sublinhados; sem gradientes nem sombras que reduzam o contraste (decisão L4).
3. **Lembrança:** a escolha fica guardada no navegador (decisão L1) e vale nas próximas visitas, antes e depois do login.
4. **Sistema:** sem escolha guardada, o tema segue a preferência de contraste do sistema operacional (`prefers-contrast: more`).

### 5.2 Fora de escopo

- Tema escuro comum (sem contraste reforçado), escolha de cores pela pessoa e escala de letra (decisão L3).

### 5.3 Regras

1. Para isso, as 87 cores fixas do CSS passam a ser variáveis; o tema normal fica exatamente com as cores de hoje.
2. No alto contraste, todo texto tem pelo menos 7:1 (AAA, 1.4.6) e todo elemento de interface pelo menos 3:1 (1.4.11); o foco tem contorno de pelo menos 3 px.
3. As cores das etiquetas e dos gráficos ganham, no alto contraste, versões que mantêm a distinção entre elas e o contraste com o fundo.
4. O tema vale desde o primeiro desenho da página, sem piscar no tema normal.

### 5.4 Critérios de aceitação

- [ ] **CA-CON-01** — A opção liga e desliga o tema na hora, em todas as telas, e a escolha vale nas próximas visitas.
- [ ] **CA-CON-02** — A varredura do `axe-core` não acusa violação AA nas páginas da lista, nos dois temas, nem de contraste aprimorado (7:1) no alto contraste.
- [ ] **CA-CON-03** — O tema normal não muda (as cores de hoje ficam iguais); sem escolha, vale a preferência do sistema.

## 6. Parte C — Leitura em voz alta

### 6.1 Escopo

1. **Ler a tela:** no botão "Acessibilidade", "Ouvir esta página" lê o conteúdo principal (`main`) na ordem em que aparece: títulos, textos, rótulos dos campos com o valor preenchido, linhas das tabelas com o nome das colunas e mensagens de aviso ou erro. O menu, a barra de acessibilidade e o que está oculto não são lidos.
2. **Ler o trecho:** "Ouvir o trecho selecionado" lê o texto que a pessoa selecionou.
3. **Controles:** pausar, continuar, parar e velocidade (0,75×, 1×, 1,25× e 1,5×); a velocidade escolhida fica guardada como o contraste.
4. **Voz:** uma voz em português do Brasil, se o aparelho tiver; senão, outra voz em português; sem nenhuma, a opção mostra que o navegador não oferece leitura e sugere o leitor de tela do sistema.

### 6.2 Fora de escopo

- Comandos por voz (falar para navegar ou preencher), ditado e leitura automática ao mudar de página (decisão L2). Ela não substitui os leitores de tela do sistema, que continuam funcionando.

### 6.3 Regras

1. Usa só a Web Speech API do navegador: nenhuma dependência nova, nenhum serviço externo, nenhum texto da tela sai do aparelho.
2. O texto é lido em trechos curtos (por parágrafo ou linha), para que pausar e parar respondam na hora e textos longos não sejam cortados pelo navegador.
3. Mudar de página para a leitura.
4. A leitura não muda nada na tela além do estado dos controles, que é anunciado (`aria-live`).

### 6.4 Critérios de aceitação

- [ ] **CA-VOZ-01** — "Ouvir esta página" lê o conteúdo principal na ordem, sem o menu nem o que está oculto, com rótulos e valores dos campos e as linhas das tabelas.
- [ ] **CA-VOZ-02** — O trecho selecionado é lido; pausar, continuar, parar e velocidade funcionam e a velocidade é lembrada.
- [ ] **CA-VOZ-03** — Sem suporte do navegador, a opção avisa e nada quebra; nenhuma dependência nova e nada é enviado para fora.

## 7. A barra "Acessibilidade"

Um botão "Acessibilidade" no topo de todas as telas, inclusive na entrada e no login, abre um painel com o alto contraste e a leitura em voz alta. Ele é o primeiro item alcançado pela tecla Tab depois do link "Pular para o conteúdo" (acrescentado por esta SPEC) e tem o atalho Alt+Shift+A. O painel é acessível por teclado, diz seu estado e fecha com Esc.

## 8. Decisões propostas (aguardam a revisão da responsável)

| # | Questão | Proposta | Alternativa |
|---|---|---|---|
| L1 | Onde guardar as escolhas (contraste e velocidade da fala) | Cookie no navegador: vale antes do login, sem migration | No cadastro da pessoa: acompanha em outro aparelho, mas só depois do login e com migration |
| L2 | O que é a "opção de fala" | Leitura em voz alta da tela e do trecho selecionado | Também comandos por voz (o reconhecimento de voz não funciona em todos os navegadores) |
| L3 | Escala de letra | Fora desta SPEC, registrada como possível acréscimo | Incluir "A+ / A−" no mesmo painel (cerca de +2 h e +150 linhas) |
| L4 | Tema de alto contraste | Escuro: fundo preto, texto branco, links e foco amarelos (padrão dos sites do governo federal) | Claro reforçado: fundo branco, texto preto, bordas pretas |
| L5 | Como verificar o contraste | `axe-core` já presente em `node_modules`, injetado nas páginas pelo E2E, sem nova dependência | Acrescentar `@axe-core/playwright` (dependência nova) |
| L6 | Larguras conferidas | 360 px (celular), 768 px (tablet) e 1280 px (computador) | Também 320 px em todas as páginas |
| L7 | Onde ficam os controles | Botão "Acessibilidade" no topo de todas as telas, com painel | Controles soltos no rodapé de cada tela |

## 9. Testes

- **Unitários:** extração do texto para a leitura (ordem, oculto, rótulos e valores, tabelas), divisão em trechos, escolha da voz, leitura e gravação das preferências, estado do menu recolhível.
- **E2E:** sem rolagem lateral nas páginas da lista a 360 px e 768 px; menu recolhido por mouse e teclado; varredura do `axe-core` nos dois temas; alto contraste lembrado entre visitas e no login; leitura com a fala simulada (o navegador do teste recebe um `speechSynthesis` falso que registra o que seria falado).
- Não há integração com o banco: nada desta SPEC grava no banco.

## 10. Tarefas e estimativa

| Tarefa | Parte | Conteúdo | Horas | Linhas TS (cloc) |
|---|---|---|---|---|
| SF-260 | A | Varredura das larguras (E2E auxiliar) e lista dos problemas | 1 a 1,5 | 80 a 130 |
| SF-261 | A | Menu recolhível nas três áreas e na administração | 1 a 1,5 | 80 a 140 |
| SF-262 | A | Tabelas com rolagem própria, formulários e alvos de toque | 1 a 1,5 | 40 a 80 |
| SF-263 | A | E2E de responsividade e revisão da parte A | 1 a 1,5 | 50 a 100 |
| SF-264 | B | Cores fixas em variáveis e tema de alto contraste | 1 a 1,5 | 0 a 30 |
| SF-265 | B | Preferência guardada, aplicada antes do primeiro desenho, e a do sistema | 1 a 1,5 | 100 a 160 |
| SF-266 | B | Varredura do `axe-core` nos dois temas e E2E da parte B | 1 a 2 | 100 a 160 |
| SF-267 | C | Extração do texto e divisão em trechos (domínio e unitários) | 1 a 1,5 | 150 a 230 |
| SF-268 | C | Controle da fala: voz, página, trecho, pausa, velocidade, sem suporte | 1 a 1,5 | 150 a 230 |
| SF-269 | C | Barra "Acessibilidade", "Pular para o conteúdo" e atalho | 1 a 1,5 | 60 a 110 |
| SF-270 | C | E2E com fala simulada e revisão final | 1 a 1,5 | 60 a 120 |
| **Total** | | 11 tarefas | **11 a 16,5 h** (mais 1 a 1,5 h desta SPEC e dos registros) | **870 a 1.490** |

Além das linhas contadas, cerca de 400 a 650 linhas de CSS (o `cloc-diff.sh` conta só TypeScript e JavaScript). A estimativa usa o ritmo medido na SPEC 2 (de 1 a 2 horas por tarefa com as suítes completas); a incerteza maior está na parte C, porque a fala depende do navegador. **Ordem:** A → B → C; cada parte pode ser entregue e enviada sozinha, e nenhuma pede backup do banco, porque não há migration.
