import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HELP_TOPICS, MAX_HELP_QUERY_LENGTH, helpQueryOf, normalizeHelpText, searchHelp, topicsFor } from "@/modules/help";
import { HelpContent, helpCountText } from "@/app/_components/help";

// SPEC 2026-11-15-ajuda-faq (SF-271 and SF-272; CA-AJD-01 and CA-AJD-02 by the rules).

const ids = (role: Parameters<typeof topicsFor>[0]) => topicsFor(role).map(({ id }) => id);

describe("the topics of each profile (rule 3)", () => {
  it("without a session, only the general topics; with one, the profile's first and no other profile's", () => {
    expect(ids(null)).toEqual(["primeiros-passos", "conta-e-acesso"]);
    expect(ids("REQUESTER")).toEqual(["solicitante", "primeiros-passos", "conta-e-acesso"]);
    expect(ids("ATTENDANT")).toEqual(["atendente", "primeiros-passos", "conta-e-acesso"]);
    expect(ids("MANAGER")).toEqual(["gestor", "primeiros-passos", "conta-e-acesso"]);
    expect(ids("ADMIN")).toEqual(["administracao", "primeiros-passos", "conta-e-acesso"]);
  });

  it("every topic and question has a unique id and texts written out", () => {
    const topicIds = HELP_TOPICS.map(({ id }) => id);
    expect(new Set(topicIds).size).toBe(topicIds.length);
    for (const topic of HELP_TOPICS) {
      expect(topic.questions.length).toBeGreaterThanOrEqual(4);
      const questionIds = topic.questions.map(({ id }) => id);
      expect(new Set(questionIds).size, topic.id).toBe(questionIds.length);
      for (const item of topic.questions) {
        expect(item.question.endsWith("?") || item.question.endsWith("."), item.id).toBe(true);
        expect(item.answer.length, item.id).toBeGreaterThan(40);
      }
    }
  });
});

describe("the search (rule 5)", () => {
  it("ignores case, accents and extra spaces", () => {
    expect(normalizeHelpText("  Solicitação   ÚTEIS ")).toBe("solicitacao uteis");
  });

  it("finds by the question or by the answer, with every word searched", () => {
    const byQuestion = searchHelp("REQUESTER", "CANCELO");
    expect(byQuestion.found).toBe(1);
    expect(byQuestion.topics[0]!.questions[0]!.id).toBe("cancelar");
    // "horas úteis" is only in answers.
    const byAnswer = searchHelp("MANAGER", "horas uteis");
    expect(byAnswer.topics.flatMap(({ questions }) => questions.map(({ id }) => id))).toEqual(["calendario"]);
    expect(searchHelp("REQUESTER", "senha prazo").found).toBe(0);
  });

  it("never shows another profile's questions, even when the words match them", () => {
    // "Encerrar como duplicada" is an attendant's action.
    expect(searchHelp("REQUESTER", "duplicada").found).toBe(0);
    expect(searchHelp("ATTENDANT", "duplicada").found).toBe(1);
    expect(searchHelp(null, "aprovar").found).toBe(0);
  });

  it("an empty or invalid search shows everything; a long one is cut", () => {
    const all = searchHelp("ADMIN", "   ");
    expect(all.query).toBe("");
    expect(all.found).toBe(topicsFor("ADMIN").reduce((total, topic) => total + topic.questions.length, 0));
    expect(helpQueryOf(["senha", "outra"])).toBe("senha");
    expect(helpQueryOf(42)).toBe("");
    expect(helpQueryOf("x".repeat(150))).toHaveLength(MAX_HELP_QUERY_LENGTH);
  });
});

describe("the page's content (rule 4)", () => {
  it("shows the search, the count and each question in a closed details without a search", () => {
    const html = renderToStaticMarkup(createElement(HelpContent, { result: searchHelp(null, "") }));
    expect(html).toContain('role="search"');
    expect(html).toContain('<h2 id="help-primeiros-passos">Primeiros passos</h2>');
    expect(html).toContain('<details class="help-question"><summary>O que é o ServiceFlow?</summary>');
    expect(html).not.toContain("Ver todas as perguntas");
  });

  it("opens the questions found and offers the way back to all of them", () => {
    const html = renderToStaticMarkup(createElement(HelpContent, { result: searchHelp("REQUESTER", "reabrir") }));
    expect(html).toContain('<details class="help-question" open="">');
    expect(html).toContain('1 pergunta encontrada para &quot;reabrir&quot;.');
    expect(html).toContain('<a href="/help">Ver todas as perguntas</a>');
  });

  it("names the counts", () => {
    expect(helpCountText({ found: 10, query: "" })).toBe("10 perguntas.");
    expect(helpCountText({ found: 0, query: "xyz" })).toBe('Nenhuma pergunta encontrada para "xyz".');
    expect(helpCountText({ found: 3, query: "prazo" })).toBe('3 perguntas encontradas para "prazo".');
  });
});
