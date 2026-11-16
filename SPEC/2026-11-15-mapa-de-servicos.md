# SPEC — Mapa de serviços do solicitante

**Data:** 2026-11-15
**Status:** Aprovada em 2026-11-15, a pedido da responsável ("na aba de usuário instale uma área que apresenta de maneira ilustrativa os serviços e os relacionamentos entre os microsserviços, para que o usuário possa se localizar e descreva quais tipos de problemas ele pode resolver sozinho e quais precisa de atendimento ou acompanhamento especializado, considere atividade especializada aquela que necessite com mais de um processo para concluir"), com as escolhas: área do solicitante, serviços da organização (dados reais) e classificação pela configuração (decisões M1 a M3). **Concluída em 2026-11-15** (SF-273 a SF-275; CA-MAP-01 a 05).
**Projeto:** ServiceFlow
**Referências:** `SPEC/2026-09-30-catalogo-e-solicitacoes.md` (catálogo), `2026-11-01-aprovacoes.md` e `2026-11-06-aprofundamento-configurabilidade.md` (níveis e condição de aprovação), `2026-11-01-fluxos-configuraveis.md` (etapas), `2026-11-06-base-conhecimento.md` (artigos), `2026-11-07-operacao-e-automacao.md` (pacotes), `docs/mapa-do-site.md`.

## 1. Objetivo

Uma página **"Mapa de serviços"** na área do solicitante que mostra, de forma ilustrada, como os serviços da organização se organizam (setores, categorias, serviços) e como se ligam (aprovação de outro setor, etapas, documentos, pacotes), para que a pessoa se localize antes de pedir. A página diz, para cada tipo de problema, se a pessoa **resolve sozinha**, se **precisa de atendimento** ou se precisa de **atendimento especializado**, que é o que exige **mais de um processo** para terminar.

Observação de vocabulário: o pedido fala em "microsserviços"; o ServiceFlow é um sistema único (`docs/mapa-do-site.md`), e o que o solicitante vê como partes que se relacionam são os **serviços da organização**, que esta página desenha.

## 2. Decisões (escolhidas pela responsável em 2026-11-15)

| # | Questão | Escolha |
|---|---|---|
| M1 | Onde fica | Área do solicitante: link "Mapa de serviços" no menu, ao lado de "Catálogo" |
| M2 | O que o mapa mostra | Os serviços da organização, a partir dos dados reais, sem cadastro novo: muda sozinho quando o administrador muda o catálogo |
| M3 | Como classificar | Pela configuração que já existe, sem campo novo nem migration (regras da seção 4) |

## 3. Escopo

1. **Página `/catalog/map`** ("Mapa de serviços"), só para o solicitante, como o catálogo.
2. **Visão geral ilustrada:** um desenho com os setores que atendem e as ligações entre eles: um serviço de um setor que passa pela aprovação de outro setor, e um pacote que junta serviços de setores diferentes. O desenho tem uma versão em texto (lista das ligações) para leitores de tela.
3. **Três grupos, na ordem em que a pessoa deve pensar:**
   1. **Você resolve sozinho:** o que a pessoa faz sem abrir solicitação: os artigos publicados da base de conhecimento ("antes de abrir, veja se isto resolve"), com o serviço a que cada um pertence, e as ações da própria conta (alterar senha, ver os próprios dados, acompanhar as próprias solicitações, escolher os avisos, ler a ajuda).
   2. **Precisa de atendimento:** serviços que terminam em **um só processo**.
   3. **Atendimento especializado ou acompanhamento:** serviços e pacotes com **mais de um processo**, cada um com o motivo em palavras ("aprovação do gestor de Compras antes do atendimento", "3 etapas de atendimento", "pacote com 3 serviços").
4. **Caminho de cada serviço:** em cada serviço, o percurso desenhado em passos ("Você pede" → aprovação, se houver → atendimento, com as etapas → "Concluída"), com o setor de cada passo, os documentos que a pessoa precisa ter em mãos e o prazo-base, quando houver; e o link para abrir a solicitação (a página do serviço no catálogo).
5. **Na entrada do catálogo**, um link para o mapa.

## 4. Regras

1. **Só o que a pessoa pode pedir:** entram os serviços publicados (ativos, com categoria e setor ativos), os pacotes que o catálogo mostra e os artigos publicados de serviços publicados; nada interno (notas, atendentes, regras de distribuição) aparece.
2. **Processos de um serviço:** conta-se **o atendimento** como um processo, ou, se o serviço tem etapas ativas, **uma por etapa**; mais **um por nível de aprovação**, quando o serviço exige aprovação (os níveis são os setores da aprovação; sem setores, um nível, o do próprio setor).
3. **Classificação:** serviço com **1 processo** → "Precisa de atendimento"; com **2 ou mais** → "Atendimento especializado". **Pacote** → sempre especializado (cada serviço do pacote é uma solicitação).
4. **O que pode acontecer conta:** uma aprovação que só vale conforme uma resposta do formulário, ou uma etapa com condição, conta como processo, e o motivo diz "pode exigir ..., conforme o que você responder". A pessoa é avisada do caminho mais longo possível.
5. **Documentos exigidos não são processo:** são o que a pessoa leva; aparecem no caminho do serviço, não mudam a classificação.
6. **Resolve sozinho** não substitui o atendimento: um serviço com artigos aparece também no seu grupo de atendimento; o artigo é a primeira tentativa.
7. **Sem dado pessoal e sem gravação:** a página só lê a configuração; não grava nada nem mostra solicitações de ninguém.
8. **Acessível:** títulos em ordem; o desenho tem `role="img"` e um nome, e a mesma informação está em texto logo abaixo; funciona nos dois temas e a 360 px sem rolagem lateral (SPEC de acessibilidade).

## 5. Fora de escopo

- Marcação manual de classificação (alternativa da decisão M3), edição do mapa, mapa para atendente, gestor ou administração.
- Desenho das partes internas do sistema (está em `docs/mapa-do-site.md`).
- Estimativa de prazo além do prazo-base configurado no serviço.

## 6. Critérios de aceitação

- [x] **CA-MAP-01** — O solicitante chega ao "Mapa de serviços" pelo menu e pelo catálogo; outros perfis não abrem a página. *Verificado em 2026-11-15 (SF-273 a SF-275): E2E `service-map.spec.ts` (pelo menu e pelo catálogo; o atendente é levado para fora) e integração `service-map.test.ts` (o módulo recusa quem não é solicitante, além da página).*
- [x] **CA-MAP-02** — A classificação segue a seção 4: um processo → atendimento; mais de um (níveis de aprovação, etapas, pacote; condicionais contadas) → especializado, cada um com o motivo em palavras. *Verificado em 2026-11-15: unitários `service-map.test.ts` (sem etapas, uma etapa, aprovação do próprio setor e em dois níveis, condicionais, documentos fora da conta, pacote) e E2E (serviço com aprovação de outro setor e duas etapas aparece como especializado, "3 processos", com os dois motivos).*
- [x] **CA-MAP-03** — "Você resolve sozinho" mostra os artigos publicados de serviços publicados e as ações da própria conta; nada de serviço inativo, artigo em rascunho ou dado interno aparece. *Verificado em 2026-11-15: integração (serviço inativo e de setor inativo ficam de fora; artigo em rascunho e artigo de serviço fora do catálogo também) e E2E (o artigo publicado e as ações da conta, com os links).*
- [x] **CA-MAP-04** — O desenho mostra os setores e as ligações entre eles (aprovação de outro setor, pacote entre setores), com versão em texto; cada serviço mostra seu caminho, documentos e link para abrir. *Verificado em 2026-11-15: unitário da tela (desenho com `role="img"`, título e descrição, ligações em texto, uma caixa por setor, inclusive o que só aprova; linhas da borda à borda, lado a lado quando duas ligam os mesmos setores) e E2E (ligações de aprovação e de pacote, caminho do serviço passo a passo, documentos e link que leva à página do serviço).*
- [x] **CA-MAP-05** — A página passa na varredura do `axe-core` nos dois temas e não rola de lado a 360 px; nenhuma migration nem dependência nova. *Verificado em 2026-11-15: a página entrou na lista da parte A da SPEC de acessibilidade, então o E2E de larguras (360, 768 e 1.280 px) e a varredura do `axe-core` nos dois temas passam por ela; `package.json` e `prisma/` sem mudança.*

## 7. Testes

- **Unitários:** contagem de processos e classificação (sem etapas, com etapas, com aprovação de um e de vários níveis, com condição, pacote); motivos em palavras; ligações entre setores do desenho; marcação da página.
- **Integração:** a leitura do banco traz só o publicado (serviço, categoria ou setor inativo fica de fora; artigo em rascunho fica de fora; pacote inativo fica de fora).
- **E2E:** o solicitante abre o mapa pelo menu e vê os três grupos; um serviço configurado com aprovação de outro setor aparece como especializado, com a ligação no desenho; as páginas entram na lista da varredura de larguras e do `axe-core`.

## 8. Tarefas e estimativa

| Tarefa | Conteúdo | Horas | Linhas TS (cloc) |
|---|---|---|---|
| SF-273 | Módulo `service-map`: domínio (processos, classificação, motivos, ligações) e leitura do banco, com unitários e integração | 2 a 3 | 450 a 650 |
| SF-274 | Página `/catalog/map`: desenho, três grupos, caminho de cada serviço, links no menu e no catálogo, CSS | 2 a 3 | 300 a 450 |
| SF-275 | E2E, varreduras (larguras e `axe-core`) e revisão final | 1 a 1,5 | 150 a 250 |
| **Total** | 3 tarefas | **5 a 7,5 h** | **900 a 1.350** |

Sem migration (decisão M3): o push não pede backup do banco.

## 9. Revisão final (SF-275, 2026-11-15)

- **Critérios:** 5 de 5 marcados.
- **Acertos durante a construção, com teste:** um setor que só aprova (sem serviço próprio) ficava sem caixa no desenho, e sua seta não aparecia; agora todo setor de uma ligação é desenhado. A ponta da seta ficava escondida sob a caixa, e duas ligações entre os mesmos setores (uma aprovação e um pacote) se sobrepunham; as linhas agora vão da borda de uma caixa à outra, lado a lado quando há duas. Com um ou dois setores, o desenho fica numa faixa baixa, sem espaço vazio. A seta entre os passos do caminho é só desenho (`content: "→" / ""`), para o leitor de tela não a anunciar.
- **Com os dados de demonstração:** um setor (Central de Serviços), 8 serviços em "Precisa de atendimento" e 1 em "Atendimento especializado" (solicitação de equipamento, com aprovação do gestor); sem artigos publicados. As ligações entre setores aparecem quando a organização tem aprovação de outro setor ou pacote entre setores (conferido no E2E).
- **Sem migration e sem dependência nova** (decisão M3).
