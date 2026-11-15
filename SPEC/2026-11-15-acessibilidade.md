# SPEC — Acessibilidade: telas responsivas, alto contraste e leitura em voz alta

**Data:** 2026-11-15
**Status:** Concluída em 2026-11-15 (SF-260 a SF-270; 10 de 10 critérios). Escrita em 2026-11-15, a pedido da responsável ("escreva a SPEC de acessibilidade"); decisões L1 a L7 aprovadas como propostas no mesmo dia ("pode começar a SPEC de acessibilidade com as decisões propostas").
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

### 2.1 Varredura das larguras (SF-260, 2026-11-15)

Feita com `tests/e2e/responsive-survey.spec.ts` (rodava só com `RESPONSIVE_SURVEY=1`; na SF-263 virou o E2E `responsive.spec.ts`, que reprova): 70 páginas (3 sem login, 11 do solicitante, 12 do atendente, 17 do gestor, as 25 seções da administração e 4 da conta da administração), a 360 px e a 768 px, com os dados de demonstração. Uma página "rola de lado" quando a largura do documento passa a da janela; a varredura aponta o elemento mais externo que passa da borda e não está numa área com rolagem própria. **47 ocorrências, de três causas:**

| # | Largura | Onde | Causa | Tarefa |
|---|---|---|---|---|
| R1 | 768 px | As 12 páginas do atendente (documento com 872 px) | O menu (`nav`, 654 px, 8 links) fica numa linha só ao lado da marca e empurra o botão "Sair" | SF-261 |
| R2 | 768 px | As 17 páginas do gestor (documento com 1.307 px) | O menu (1.089 px, 14 links) numa linha só | SF-261 |
| R3 | 360 px | As 25 seções da administração e "Acesso à API" do administrador (documento com 418 px) | Os links do topo (`page-nav`: Ajuda, Meus dados, Alterar senha, Sair; 386 px) não quebram linha | SF-261 |

**Não rolam de lado:** as páginas sem login, todas as do solicitante e, a 360 px, as do atendente e do gestor (abaixo de 480 px o menu já quebra em várias linhas, regra de uma correção anterior). As 23 tabelas de dados não empurraram a página com os dados de demonstração, porque as células quebram o texto; com textos mais longos ou mais colunas, elas apertam ou empurram a página, então a rolagem própria da SF-262 continua necessária. Os links das seções da administração já rolam na horizontal abaixo de 760 px.

**A 1.280 px** (medido depois, na SF-261): as 13 páginas do gestor também rolavam de lado (documento com 1.363 px), pelo mesmo menu de 14 links (R2). Depois da SF-261, a varredura nas três larguras não acha nenhuma página que role de lado.

**Correção da estimativa:** os problemas são todos de menu e cabeçalho; isso reforça a SF-261 e não muda as outras tarefas.

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
4. **Esclarecimento (SF-261, 2026-11-15):** a varredura mostrou que o menu do gestor passa da tela também a 768 px e a 1.280 px (seção 2.1). Por isso, acima de 760 px, um menu que não cabe ao lado da marca **quebra em mais linhas** em vez de empurrar a página; um menu que cabe fica exatamente como antes. Conferido na SF-263 com o CSS antigo reaplicado na página: a 1.280 px, o menu do solicitante cabe numa linha e ficou igual; o do atendente já não cabia (o texto dos links quebrava em duas linhas, "Fila do meu / setor") e passou a mostrar os links inteiros em duas linhas; o do gestor rolava a página e também passou a duas linhas. O CA-RSP-04 ("acima de 760 px as telas não mudam") vale para as telas que já cabiam; as do atendente e do gestor mudam só para deixar de quebrar o texto dos links ou de rolar de lado. Os links do topo da administração (Ajuda, Meus dados, Alterar senha, Sair) também quebram linha quando não cabem. Na administração, o "Menu" recolhe a lista das seções.
6. **Esclarecimento (SF-262, 2026-11-15):** a área de rolagem de cada tabela (componente `TableScroll`) é uma região com nome (a legenda da tabela; sem legenda, o título do gráfico ou um nome curto como "Tabela da equipe", que não repete o nome da seção), alcançável pela tecla Tab em qualquer largura, para que quem usa o teclado role a tabela com as setas. Os alvos de toque de 44 × 44 px valem abaixo de 760 px para todos os botões e links com aparência de botão, não só os do menu; acima disso, os tamanhos não mudam. Os formulários já ficavam em uma coluna abaixo de 760 px; a varredura não achou formulário que passasse da tela.
5. **Sem JavaScript**, a lista fica visível (o botão só a esconde depois que a página carrega o script), então ninguém perde o menu.

### 4.4 Critérios de aceitação

- [x] **CA-RSP-01** — As páginas de cada perfil não rolam de lado a 360 px e a 768 px (E2E com a lista de páginas). *Verificado em 2026-11-15 (SF-263): E2E `responsive.spec.ts` com as 70 páginas a 360, 768 e 1.280 px (nenhuma rola de lado e todas as de detalhe foram abertas pela lista) e uma amostra de 11 páginas a 320 px (regra 4.3.1).*
- [x] **CA-RSP-02** — O menu recolhido abre e fecha pelo mouse e pelo teclado, diz seu estado e devolve o foco ao fechar. *Verificado em 2026-11-15 (SF-261): unitário (estado e marcação) e E2E `collapsible-menu.spec.ts` (gestor e administração a 360 px: mouse, Enter, Espaço, Tab, Esc com o foco de volta, link que fecha o menu; botão oculto a 1.280 px).*
- [x] **CA-RSP-03** — As tabelas rolam dentro de si, com nome, e são alcançáveis pelo teclado. *Verificado em 2026-11-15 (SF-262): unitário (área nomeada com `tabindex="0"`; toda `data-table` do código dentro de uma; a grade de chegadas também) e E2E `table-scroll.spec.ts` (tabela de 900 px a 360 px rola na própria área, sem rolar a página, com Tab e setas; botões e links do menu com 44 × 44 px).*
- [x] **CA-RSP-04** — Acima de 760 px as telas não mudam; nenhuma dependência nova. *Verificado em 2026-11-15 (SF-263), com o esclarecimento 4.3 item 4: E2E (sem o botão "Menu"; o menu do solicitante numa linha só ao lado da marca e do "Sair"; o do atendente e o do gestor com os links inteiros em mais linhas a 1.280 e 768 px; as seções da administração visíveis a 768 px). `package.json`, `package-lock.json` e `prisma/` sem mudança desde o início da SPEC.*

### 4.5 Revisão da parte A (SF-263, 2026-11-15)

- **Critérios:** CA-RSP-01 a 04 marcados.
- **O que mudou nas telas:** botão "Menu" abaixo de 760 px nas três áreas e nas seções da administração; menus do atendente e do gestor com os links inteiros em mais linhas acima de 760 px; links do topo da administração que quebram linha; as 23 tabelas de dados e a grade de chegadas com rolagem própria; botões com 44 × 44 px no celular. Nenhuma regra, dado ou permissão mudou; sem migration.
- **Suítes anteriores:** passaram sem mudar asserções. Uma falha do E2E de "Análises" na SF-262 foi corrigida no código (nome da área da tabela), não no teste.
- **Fica para depois:** a varredura mede a rolagem lateral com os dados de demonstração; textos muito longos digitados pelas pessoas (nomes de serviço, por exemplo) são cobertos pelas quebras de linha e pela rolagem própria das tabelas, mas não por uma página a mais na lista.

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
5. **Esclarecimento (SF-264, 2026-11-15):** o levantamento contou 87 cores fixas; na troca, eram 57 cores diferentes em cerca de 80 regras (algumas repetidas), que viraram 56 variáveis no `:root` (o branco das superfícies passou a usar a `--surface` que já existia). O tema vale quando a página tem `data-contrast="high"`; quem põe o atributo é a SF-265. Detalhes do tema: botões principais amarelos com texto preto; botões secundários pretos com borda e texto brancos; nenhuma sombra (nem o anel de foco dos campos, trocado pelo contorno amarelo de 3 px); caixas de marcar com o visto amarelo. As cores das etiquetas no alto contraste ficam na paleta (`contrastText`, uma por cor, todas de 7:1 ou mais no preto), e a faixa de avisos fica preta com borda branca (informação) ou amarela e mais grossa (urgente). Na grade de chegadas do painel, as células vão do branco ao azul-escuro, para que "mais escuro, mais solicitações" continue valendo sobre o fundo preto.
6. **Esclarecimento (SF-265, 2026-11-15):** o cookie `sf-contrast` (valores `high` ou `normal`, um ano, todo o site, `SameSite=Lax`, `Secure` em https) é gravado e lido no navegador; o servidor não o lê, para que as páginas sem login continuem pré-renderizadas. Um script curto no `<head>` lê o cookie, ou a preferência do sistema sem ele, e marca a página antes do primeiro desenho, como recomenda o guia do Next.js 16 ("Preventing flash before hydration"). Sem escolha, o tema acompanha a preferência do sistema também quando ela muda com a página aberta; depois de uma escolha, ela vale sobre o sistema. Até a SF-269, o botão "Alto contraste" fica numa barra própria no topo de todas as telas; a SF-269 o leva para o painel "Acessibilidade".

### 5.4 Critérios de aceitação

- [x] **CA-CON-01** — A opção liga e desliga o tema na hora, em todas as telas, e a escolha vale nas próximas visitas. *Verificado em 2026-11-15 (SF-265): E2E `contrast-preference.spec.ts` (liga na entrada, sem login; o cookie vale um ano; a próxima visita, o login e a área do solicitante já abrem no alto contraste; desligado, volta ao normal na hora e na visita seguinte; o botão está na entrada, no login, na ajuda, nas três áreas e na administração) e unitários da preferência e do script.*
- [x] **CA-CON-02** — A varredura do `axe-core` não acusa violação AA nas páginas da lista, nos dois temas, nem de contraste aprimorado (7:1) no alto contraste. *Verificado em 2026-11-15 (SF-266): E2E `accessibility-scan.spec.ts` com o `axe-core` 4.13 de `node_modules` (decisão L5) nas 70 páginas, nos dois temas, com as regras WCAG 2.0, 2.1 e 2.2 A/AA e, no alto contraste, também a de contraste aprimorado (7:1). A primeira varredura achou só alvos pequenos (2.5.8) no tema normal, em 4 páginas, corrigidos (seção 5.5); depois, nenhuma violação nos dois temas.*
- [x] **CA-CON-03** — O tema normal não muda (as cores de hoje ficam iguais); sem escolha, vale a preferência do sistema. *Primeira metade verificada em 2026-11-15 (SF-264): as cores calculadas de todos os elementos das 72 páginas (26.915 estilos, com os pseudoelementos) foram comparadas antes e depois da troca, sem nenhuma diferença; o E2E `high-contrast-theme.spec.ts` liga e desliga o tema e confere que cada elemento volta às cores de antes. Segunda metade verificada na SF-265: sem escolha, o tema segue `prefers-contrast: more`, também quando ela muda com a página aberta, sem gravar cookie (E2E e unitários com as dez combinações de cookie e sistema).*

### 5.5 Revisão da parte B (SF-266, 2026-11-15)

- **Critérios:** CA-CON-01 a 03 marcados.
- **Varredura:** a primeira rodada no tema normal achou um único tipo de violação, `target-size` (WCAG 2.2, 2.5.8, alvo de pelo menos 24 × 24 px ou com espaço em volta), em 4 páginas: o link "Ajuda e perguntas frequentes" logo abaixo dos botões da entrada (20 px de altura, colado neles; acrescentado na SF-272) e a linha que abre cada serviço em "Checklists" (23,3 px), no gestor e na administração. Correção: toda linha de abrir (`summary`) com pelo menos 24 px, e o link da entrada com 24 px e espaço acima. No alto contraste, nenhuma violação, nem de 7:1.
- **Conferência da varredura:** um texto cinza (`#777`) posto de propósito no alto contraste foi acusado pela regra de 7:1; o `axe-core` deixa como "inconclusivos" só os números dos eixos dos gráficos (texto curto demais para julgar), que usam `--muted`, conferida em 7:1 pelo unitário do tema.
- **Garantia:** o tema normal tem as mesmas cores de antes (SF-264); as únicas mudanças visíveis para quem não usa o alto contraste são o botão "Alto contraste" no topo e os alvos de 24 px acima.
- **Dependência do `axe-core`:** ele vem do `eslint-plugin-jsx-a11y` (via `eslint-config-next`), não do `package.json`; se um dia sair de lá, a varredura falha ao injetar o arquivo, e a escolha passa a ser declarar a dependência (alternativa da decisão L5).

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
5. **Esclarecimento (SF-267, 2026-11-15):** o que se lê, regra a regra. Uma linha por título, parágrafo, item de lista ou outro bloco, na ordem da página; links e trechos destacados entram na linha em que estão. Cada campo é lido uma vez, como "rótulo: valor" ("Status: Aberta", "Que eu acompanho: marcado", "Descrição: vazio", "Setor: nenhum selecionado"), mesmo quando o rótulo envolve o campo; campos ocultos e botões de envio não são lidos. **O valor de um campo de senha nunca é lido em voz alta**, só "preenchido" ou "vazio". Tabelas: "Tabela:" e a legenda, depois cada linha com o nome de cada coluna ("Data: 10/11; Horas: 2 h"); célula vazia, "vazio". Uma mensagem com `role="alert"` começa com "Alerta:". Ficam de fora a navegação, os botões (são ações, não conteúdo), os desenhos (os gráficos têm os números em tabela), o que está oculto na tela ou para leitores de tela (`aria-hidden`), e o que for marcado com `data-reading="skip"`. Os textos só para leitores de tela (classe `visually-hidden`) são lidos. Os trechos entregues à voz têm até 220 caracteres, cortados por frase, depois por vírgula ou palavra; o trecho selecionado é cortado primeiro por linha.
6. **Esclarecimento (SF-268, 2026-11-15):** os controles são "Ouvir esta página", "Ouvir o trecho selecionado", "Pausar leitura" (vira "Continuar leitura" na pausa), "Parar leitura" e "Velocidade"; os três do meio levam "leitura" no nome porque ficam fora do conteúdo e porque a tela já tem botões "Pausar" e "Continuar" de outras coisas. A velocidade fica no cookie `sf-speech-rate`, como o contraste. Voz: português do Brasil, depois outro português; entre elas, a do próprio aparelho antes da que depende da rede, e a padrão do sistema antes das outras. Se o navegador não tem fala, ou tem vozes mas nenhuma em português, os controles dão lugar a um aviso que sugere o leitor de tela do sistema. Mudar de página para a leitura sem aviso. Duas regras da leitura foram acertadas ao ouvir a fila de verdade (com a fala simulada): um rótulo ligado ao campo por `for` não é lido sozinho, e elementos mostrados separados na mesma linha (as etiquetas de prioridade e prazo, por exemplo) têm as palavras separadas. Até a SF-269, os controles ficam na barra do topo, ao lado de "Alto contraste".

### 6.4 Critérios de aceitação

- [x] **CA-VOZ-01** — "Ouvir esta página" lê o conteúdo principal na ordem, sem o menu nem o que está oculto, com rótulos e valores dos campos e as linhas das tabelas. *Verificado em 2026-11-15 (SF-270): E2E `reading-aloud.spec.ts` com a fala do navegador simulada: a ajuda lida na ordem (rótulo, título, campo de busca com valor, temas e perguntas), sem as respostas das perguntas fechadas, sem os botões e sem a barra; em "Análises", a tabela aberta lida linha a linha com o nome das colunas e sem o menu da área; voz pt-BR, trechos de até 220 caracteres; e unitários das regras (SF-267 e SF-268).*
- [x] **CA-VOZ-02** — O trecho selecionado é lido; pausar, continuar, parar e velocidade funcionam e a velocidade é lembrada. *Verificado em 2026-11-15 (SF-270): E2E (sem seleção, avisa; o trecho selecionado é lido como o navegador o entrega; pausar, continuar e parar chamam a fala na hora e nada mais é dito depois de parar; 1,5× vale para a leitura seguinte, fica no cookie e volta na visita seguinte; mudar de página para a leitura) e unitários do `SpeechPlayer`.*
- [x] **CA-VOZ-03** — Sem suporte do navegador, a opção avisa e nada quebra; nenhuma dependência nova e nada é enviado para fora. *Verificado em 2026-11-15 (SF-270): E2E sem `speechSynthesis` (aviso com o leitor de tela, nenhum erro na página, o alto contraste continua funcionando) e com vozes sem português (aviso próprio); uma leitura inteira da ajuda não fez nenhuma requisição; `package.json` sem mudança desde o início da SPEC.*

## 7. A barra "Acessibilidade"

Um botão "Acessibilidade" no topo de todas as telas, inclusive na entrada e no login, abre um painel com o alto contraste e a leitura em voz alta. Ele é o primeiro item alcançado pela tecla Tab depois do link "Pular para o conteúdo" (acrescentado por esta SPEC) e tem o atalho Alt+Shift+A. O painel é acessível por teclado, diz seu estado e fecha com Esc.

**Esclarecimento (SF-269, 2026-11-15):** o painel abre abaixo do botão, por cima da página (a barra do topo volta a ter uma linha só, também no celular), e tem a leitura em voz alta e o "Alto contraste". Ele fecha também com um clique fora; Esc devolve o foco ao botão. O atalho Alt+Shift+A abre o painel de qualquer lugar, com o foco no primeiro controle, e fecha de novo com o foco no botão; ele usa a tecla física (A), que vale em qualquer teclado, e não age com Ctrl ou com a tecla de comando. O painel fechado mantém os controles montados, então uma leitura continua depois de o painel fechar. "Pular para o conteúdo" leva ao `main` de cada tela, que ganhou `id="conteudo"` e `tabIndex={-1}` nas 37 telas (o link funciona sem JavaScript); um unitário exige isso em toda tela nova. Os E2E das SF-264 e SF-265 passaram a abrir o painel antes de usar "Alto contraste" (são testes desta SPEC; os testes anteriores não mudaram).

## 8. Decisões (aprovadas como propostas em 2026-11-15)

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

## 11. Revisão final (SF-270, 2026-11-15)

- **Critérios:** 10 de 10 marcados (CA-RSP-01 a 04, CA-CON-01 a 03, CA-VOZ-01 a 03); a barra da seção 7, que não tem critério próprio, foi conferida pelo E2E do painel (`accessibility-panel.spec.ts`). Revisões das partes nas seções 4.5 e 5.5.
- **Painel aberto:** a varredura das 70 páginas vê o painel fechado; a SF-270 acrescentou a varredura do painel aberto, nos dois temas, a 360 px e a 1.280 px, sem violação do `axe-core` e sem rolagem lateral.
- **O que a pessoa vê de novo em toda tela:** "Pular para o conteúdo" (só com o foco do teclado) e o botão "Acessibilidade", com a leitura em voz alta e o alto contraste no painel. No celular, o menu recolhido em "Menu" e as tabelas com rolagem própria. O tema normal tem as mesmas cores de antes (conferido elemento por elemento em 72 páginas na SF-264).
- **Sem banco, sem dependência:** nenhuma migration; `package.json` e `package-lock.json` sem mudança; as preferências (contraste e velocidade) ficam em cookies do navegador; a fala é a do navegador e nada sai do aparelho.
- **Decisões de execução registradas nos esclarecimentos:** menus que não cabiam acima de 760 px quebram em linhas (4.3 item 4); nomes das áreas de tabela (4.3 item 6); tema e etiquetas no alto contraste (5.3 itens 5 e 6); o que se lê, inclusive que a senha nunca é lida (6.3 itens 5 e 6); o painel (seção 7).
- **Linhas e tempo, medidos:** de `d99f4a7` (antes da SF-260) a `e44f49c` (SF-269), o `cloc-diff.sh` contou **2.455 linhas `added`** de TypeScript (aplicação 1.169, testes 1.286), mais cerca de 200 da SF-270 (testes); 241 linhas removidas na aplicação, quase todas pela reindentação das tabelas dentro de `TableScroll` (a mesma linha volta como `added`). O CSS cresceu 548 linhas e perdeu 94 (estimativa: 400 a 650). A estimativa de TypeScript era de 870 a 1.490: os testes passaram do previsto (varredura, comparação de cores, contraste de cada variável, fala simulada) e a parte C ganhou módulo próprio (domínio, aplicação e infraestrutura). Tempo: das 15h09 (commit da SF-260) às 20h06 (SF-269), mais a SF-270, cerca de 5,5 a 6 horas de relógio, contra a estimativa de 11 a 16,5 h; boa parte do relógio foi espera das rodadas completas do E2E (cerca de 17 min cada, três delas interrompidas por falta de memória no computador).
- **Fica para depois (fora do escopo, registrado):** escala de letra (decisão L3); comandos por voz (decisão L2); duas caixas de marcar dos filtros da fila com 44 px nos dois temas, herdados dos campos (vistas nas capturas da SF-264, já eram assim).
