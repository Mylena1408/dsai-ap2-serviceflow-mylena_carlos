import { describe, expect, it } from "vitest";
import {
  MAX_CHUNK_LENGTH,
  describeField,
  readingChunks,
  readingLines,
  selectionChunks,
  splitLongText,
  type FieldState,
  type ReadingEnvironment,
  type ReadingNode,
} from "@/modules/accessibility";

// SPEC 2026-11-15-acessibilidade, 6.1 items 1 and 2 and 6.3 item 2 (SF-267; CA-VOZ-01 by the rules).

// A small fake of the DOM: enough of an element for the reading rules.
type FakeNode = ReadingNode & { attributes: Record<string, string>; state?: FieldState; hiddenOnScreen?: boolean };

function el(tag: string, attributes: Record<string, string> = {}, ...content: Array<FakeNode | string>): FakeNode {
  const childNodes = content.map((child) => (typeof child === "string" ? text(child) : child));
  return {
    nodeType: 1,
    nodeName: tag.toUpperCase(),
    attributes,
    childNodes,
    get textContent() {
      return childNodes.map((child) => child.textContent ?? "").join("");
    },
    getAttribute: (name: string) => attributes[name] ?? null,
  };
}

function text(value: string): FakeNode {
  return { nodeType: 3, nodeName: "#text", textContent: value, childNodes: [], attributes: {} };
}

function field(tag: string, state: FieldState, attributes: Record<string, string> = {}, ...content: FakeNode[]): FakeNode {
  return Object.assign(el(tag, attributes, ...content), { state });
}

function hiddenOnScreen(node: FakeNode): FakeNode {
  return Object.assign(node, { hiddenOnScreen: true });
}

const environment: ReadingEnvironment = {
  isHidden: (node) => Boolean((node as FakeNode).hiddenOnScreen),
  fieldState: (node) => (node as FakeNode).state!,
};

const read = (root: FakeNode) => readingLines(root, environment);

describe("what is read from the main content (6.1 item 1)", () => {
  it("one line per heading, paragraph and list item, in order, with inline links and spaces joined", () => {
    const main = el(
      "main",
      {},
      el("h1", {}, "Fila do meu setor"),
      el("p", {}, "Solicitações   encaminhadas à ", el("a", { href: "/x" }, "equipe"), " que você atende."),
      el("ul", {}, el("li", {}, "Primeira"), el("li", {}, el("strong", {}, "Segunda"), " com destaque")),
      "Texto solto",
    );
    expect(read(main)).toEqual([
      "Fila do meu setor",
      "Solicitações encaminhadas à equipe que você atende.",
      "Primeira",
      "Segunda com destaque",
      "Texto solto",
    ]);
  });

  it("leaves out the navigation, buttons, drawings, hidden parts and what is marked to skip", () => {
    const main = el(
      "main",
      {},
      el("nav", {}, el("a", { href: "/" }, "Menu")),
      el("p", {}, "Visível ", el("button", {}, "Sair"), el("span", { "aria-hidden": "true" }, "decoração")),
      el("svg", {}, el("text", {}, "4")),
      el("p", { hidden: "" }, "Escondido"),
      hiddenOnScreen(el("div", {}, el("p", {}, "Dentro de um details fechado"))),
      el("div", { "data-reading": "skip" }, "Barra de acessibilidade"),
      el("p", {}, el("img", { alt: "Gráfico de barras" }), " legenda"),
      el("p", {}, el("span", { class: "visually-hidden" }, "Rótulo só para leitores de tela")),
    );
    expect(read(main)).toEqual(["Visível", "Gráfico de barras legenda", "Rótulo só para leitores de tela"]);
  });

  it("reads each field once, with its label and value, also when the label wraps the field", () => {
    const main = el(
      "main",
      {},
      el(
        "form",
        {},
        el("label", {}, "Buscar", field("input", { kind: "text", label: "Buscar", value: "impressora" }, { type: "search" })),
        el(
          "label",
          {},
          "Status",
          field("select", { kind: "select", label: "Status", selected: ["Aberta"] }, {}, el("option", {}, "Aberta"), el("option", {}, "Concluída")),
        ),
        field("input", { kind: "checkbox", label: "Que eu acompanho", checked: true }, { type: "checkbox" }),
        field("textarea", { kind: "text", label: "Descrição", value: "" }),
        field("input", { kind: "password", label: "Senha atual", filled: true }, { type: "password" }),
        field("input", { kind: "text", label: "token", value: "segredo" }, { type: "hidden" }),
        field("input", { kind: "text", label: "Enviar", value: "Enviar" }, { type: "submit" }),
      ),
    );
    expect(read(main)).toEqual([
      "Buscar: impressora",
      "Status: Aberta",
      "Que eu acompanho: marcado",
      "Descrição: vazio",
      "Senha atual: preenchido",
    ]);
  });

  it("reads tables row by row with the name of each column, after the caption", () => {
    const table = el(
      "table",
      {},
      el("caption", {}, "Lançamentos"),
      el("thead", {}, el("tr", {}, el("th", {}, "Data"), el("th", {}, "Horas"), el("th", {}, "Ações"))),
      el(
        "tbody",
        {},
        el("tr", {}, el("th", { scope: "row" }, "10/11"), el("td", {}, "2 h"), el("td", {}, el("button", {}, "Apagar"))),
        el("tr", {}, el("th", { scope: "row" }, "11/11"), el("td", {}, " 1 h 30 "), el("td", {})),
      ),
    );
    expect(read(el("main", {}, table))).toEqual([
      "Tabela: Lançamentos",
      "Data: 10/11; Horas: 2 h; Ações: vazio",
      "Data: 11/11; Horas: 1 h 30; Ações: vazio",
    ]);
  });

  it("takes the column names from a first row of headers when there is no thead, and reads plain rows without them", () => {
    const withHeaders = el("table", {}, el("tr", {}, el("th", {}, "Nome"), el("th", {}, "Nota")), el("tr", {}, el("td", {}, "Rede"), el("td", {}, "5")));
    const plain = el("table", {}, el("tr", {}, el("td", {}, "a"), el("td", {}, "b")));
    expect(read(el("main", {}, withHeaders, plain))).toEqual(["Nome: Rede; Nota: 5", "a; b"]);
  });

  it("does not read a label that points to its field elsewhere (for=...) on its own", () => {
    const main = el(
      "main",
      {},
      el("label", { for: "search" }, "Buscar"),
      field("input", { kind: "text", label: "Buscar", value: "" }, { id: "search", type: "search" }),
      el("label", {}, "Sem campo dentro nem destino"),
    );
    expect(read(main)).toEqual(["Buscar: vazio", "Sem campo dentro nem destino"]);
  });

  it("keeps apart the words of elements shown apart inside a line, as the screen does", () => {
    const badge = (words: string) => Object.assign(el("span", { class: "status-pill" }, words), { spaced: true });
    const spacedEnvironment: ReadingEnvironment = {
      ...environment,
      isSpacedApart: (node) => Boolean((node as FakeNode & { spaced?: boolean }).spaced),
    };
    const line = el("p", {}, badge("Prioridade: Normal"), badge("Sem prazo"), el("strong", {}, "Seg"), "unda");
    expect(readingLines(el("main", {}, line), spacedEnvironment)).toEqual(["Prioridade: Normal Sem prazo Segunda"]);
    expect(read(el("main", {}, line))).toEqual(["Prioridade: NormalSem prazoSegunda"]);
  });

  it("names an alert as such", () => {
    const main = el("main", {}, el("p", { role: "alert" }, "Não foi possível salvar."), el("p", { role: "status" }, "Salvo."));
    expect(read(main)).toEqual(["Alerta: Não foi possível salvar.", "Salvo."]);
  });
});

describe("a field in words", () => {
  it("never reads a password, names empty and unchecked states and joins several selections", () => {
    expect(describeField({ kind: "password", label: "Nova senha", filled: false })).toBe("Nova senha: vazio");
    expect(describeField({ kind: "radio", label: "Alta", checked: false })).toBe("Alta: não selecionado");
    expect(describeField({ kind: "checkbox", label: "Aberta", checked: false })).toBe("Aberta: desmarcado");
    expect(describeField({ kind: "select", label: "Etiquetas", selected: ["Rede", "Urgente"] })).toBe("Etiquetas: Rede, Urgente");
    expect(describeField({ kind: "select", label: "Setor", selected: [] })).toBe("Setor: nenhum selecionado");
    expect(describeField({ kind: "text", label: "  ", value: "x" })).toBe("Campo sem nome: x");
  });
});

describe("the pieces handed to the voice (6.3 item 2)", () => {
  it("keeps short lines whole and cuts long ones by sentence, never past the limit", () => {
    const sentence = "Esta é uma frase de exemplo com algumas palavras.";
    const long = Array.from({ length: 12 }, () => sentence).join(" ");
    const pieces = splitLongText(long);
    expect(MAX_CHUNK_LENGTH).toBe(220);
    expect(pieces.length).toBeGreaterThan(2);
    for (const piece of pieces) {
      expect(piece.length).toBeLessThanOrEqual(MAX_CHUNK_LENGTH);
      expect(piece.endsWith(".")).toBe(true);
    }
    expect(pieces.join(" ")).toBe(long);
    expect(readingChunks(["Curta.", "", "Outra."])).toEqual(["Curta.", "Outra."]);
  });

  it("cuts a sentence without stops by comma or word, and a word longer than the limit by length", () => {
    const words = Array.from({ length: 60 }, (_, index) => `palavra${index}`).join(" ");
    const pieces = splitLongText(words, 50);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(50);
    expect(pieces.join(" ")).toBe(words);
    expect(splitLongText("x".repeat(120), 50)).toEqual(["x".repeat(50), "x".repeat(50), "x".repeat(20)]);
  });

  it("cuts the selected text by line first (6.1 item 2)", () => {
    expect(selectionChunks("Primeira linha\r\nSegunda   linha\n\n")).toEqual(["Primeira linha", "Segunda linha"]);
    expect(selectionChunks("   ")).toEqual([]);
  });
});
