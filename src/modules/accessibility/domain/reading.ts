// SPEC 2026-11-15-acessibilidade, 6.1 item 1 and 6.3 item 2 (SF-267): what "Ouvir esta página" reads and how the
// text is cut. The rules work on a minimal view of the page's nodes, which the browser's DOM already offers, so they
// are tested here without a browser; the screen's component (SF-268) passes the real `main` and tells which elements
// are hidden and what each field holds.

/** The part of a DOM node the reading needs: element (nodeType 1) or text (nodeType 3). */
export interface ReadingNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly textContent: string | null;
  readonly childNodes: ArrayLike<ReadingNode>;
  getAttribute?(name: string): string | null;
}

/** What a form field holds, as the screen sees it. */
export type FieldState =
  | { kind: "text"; label: string; value: string }
  | { kind: "password"; label: string; filled: boolean }
  | { kind: "checkbox" | "radio"; label: string; checked: boolean }
  | { kind: "select"; label: string; selected: string[] };

export interface ReadingEnvironment {
  /** Not shown on the screen (display, visibility, a closed details...). */
  isHidden(element: ReadingNode): boolean;
  /** The label and the value of a field (input, select, textarea). */
  fieldState(field: ReadingNode): FieldState;
}

/** The longest piece handed to the voice at once (6.3 item 2): pause and stop answer at once, nothing is cut. */
export const MAX_CHUNK_LENGTH = 220;

const ELEMENT = 1;
const TEXT = 3;

/** Never read: navigation, actions, code and drawings (the charts have their numbers in tables). */
const SKIPPED = new Set(["NAV", "BUTTON", "SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "SVG", "CANVAS", "IFRAME", "DATALIST", "OPTION", "HEAD"]);
const FIELDS = new Set(["INPUT", "SELECT", "TEXTAREA"]);
const NOT_READ_INPUTS = new Set(["hidden", "submit", "button", "reset", "image"]);
const BLOCKS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "DD", "DETAILS", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION",
  "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LEGEND", "LI", "MAIN", "OL", "P",
  "PRE", "SECTION", "SUMMARY", "UL",
]);

export function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function tagOf(node: ReadingNode): string {
  return node.nodeName.toUpperCase();
}

function attribute(node: ReadingNode, name: string): string | null {
  return node.getAttribute ? node.getAttribute(name) : null;
}

function children(node: ReadingNode): ReadingNode[] {
  return Array.from(node.childNodes);
}

function isField(node: ReadingNode): boolean {
  const tag = tagOf(node);
  if (!FIELDS.has(tag)) return false;
  return tag !== "INPUT" || !NOT_READ_INPUTS.has((attribute(node, "type") ?? "text").toLowerCase());
}

/** An element left out with everything inside it. */
function isLeftOut(node: ReadingNode, environment: ReadingEnvironment): boolean {
  if (SKIPPED.has(tagOf(node))) return true;
  if (attribute(node, "aria-hidden") === "true" || attribute(node, "hidden") !== null) return true;
  if (attribute(node, "data-reading") === "skip") return true;
  if (tagOf(node) === "INPUT" && !isField(node)) return true;
  return environment.isHidden(node);
}

/** A field in words: "Nome: Ana", "Senha: preenchido", "Urgente: marcado", "Setor: nenhum selecionado". */
export function describeField(state: FieldState): string {
  const label = normalizeSpaces(state.label) || "Campo sem nome";
  switch (state.kind) {
    case "text": {
      const value = normalizeSpaces(state.value);
      return `${label}: ${value || "vazio"}`;
    }
    case "password":
      // The value of a password is never read aloud.
      return `${label}: ${state.filled ? "preenchido" : "vazio"}`;
    case "checkbox":
      return `${label}: ${state.checked ? "marcado" : "desmarcado"}`;
    case "radio":
      return `${label}: ${state.checked ? "selecionado" : "não selecionado"}`;
    case "select": {
      const selected = state.selected.map(normalizeSpaces).filter(Boolean);
      return `${label}: ${selected.length > 0 ? selected.join(", ") : "nenhum selecionado"}`;
    }
  }
}

/** The text of an element as it is read inside a line: hidden parts, actions and fields left out. */
function inlineText(node: ReadingNode, environment: ReadingEnvironment): string {
  if (node.nodeType === TEXT) return node.textContent ?? "";
  if (node.nodeType !== ELEMENT || isLeftOut(node, environment) || isField(node)) return "";
  if (tagOf(node) === "IMG") return ` ${attribute(node, "alt") ?? ""} `;
  const text = children(node).map((child) => inlineText(child, environment)).join("");
  return BLOCKS.has(tagOf(node)) ? ` ${text} ` : text;
}

/** The fields inside an element, in order, leaving out the hidden ones. */
function fieldsIn(node: ReadingNode, environment: ReadingEnvironment): ReadingNode[] {
  if (node.nodeType !== ELEMENT || isLeftOut(node, environment)) return [];
  if (isField(node)) return [node];
  return children(node).flatMap((child) => fieldsIn(child, environment));
}

function rowsOf(node: ReadingNode): ReadingNode[] {
  return children(node).flatMap((child) => {
    const tag = tagOf(child);
    if (tag === "TR") return [child];
    if (tag === "THEAD" || tag === "TBODY" || tag === "TFOOT") return rowsOf(child);
    return [];
  });
}

function cellsOf(row: ReadingNode): ReadingNode[] {
  return children(row).filter((cell) => tagOf(cell) === "TH" || tagOf(cell) === "TD");
}

/** A table: its caption, then each row with the name of each column ("Serviço: Rede; Média: 2 h"). */
function tableLines(table: ReadingNode, environment: ReadingEnvironment): string[] {
  const lines: string[] = [];
  const caption = children(table).find((child) => tagOf(child) === "CAPTION");
  if (caption && !isLeftOut(caption, environment)) {
    const text = normalizeSpaces(inlineText(caption, environment));
    if (text) lines.push(`Tabela: ${text}`);
  }
  const head = children(table).find((child) => tagOf(child) === "THEAD");
  const rows = rowsOf(table).filter((row) => !isLeftOut(row, environment));
  const headRows = head ? rowsOf(head) : [];
  let headers: string[] = [];
  let bodyRows = rows.filter((row) => !headRows.includes(row));
  if (headRows.length > 0) {
    headers = cellsOf(headRows[headRows.length - 1]!).map((cell) => normalizeSpaces(inlineText(cell, environment)));
  } else if (rows.length > 0 && cellsOf(rows[0]!).every((cell) => tagOf(cell) === "TH")) {
    headers = cellsOf(rows[0]!).map((cell) => normalizeSpaces(inlineText(cell, environment)));
    bodyRows = rows.slice(1);
  }
  for (const row of bodyRows) {
    const values = cellsOf(row)
      .filter((cell) => !isLeftOut(cell, environment))
      .map((cell, index) => {
        const value = normalizeSpaces(inlineText(cell, environment)) || "vazio";
        const header = headers[index];
        return header ? `${header}: ${value}` : value;
      });
    if (values.length > 0) lines.push(values.join("; "));
  }
  return lines;
}

/**
 * What "Ouvir esta página" reads from the main content, in order (6.1 item 1): one line per heading, paragraph, list
 * item or other block; fields with their label and value; tables row by row with the column names; alerts named as
 * such. The navigation, the actions (buttons), drawings and everything hidden are left out.
 */
export function readingLines(root: ReadingNode, environment: ReadingEnvironment): string[] {
  const lines: string[] = [];
  let current = "";

  const flush = () => {
    const line = normalizeSpaces(current);
    if (line) lines.push(line);
    current = "";
  };

  const walk = (node: ReadingNode) => {
    if (node.nodeType === TEXT) {
      current += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== ELEMENT || isLeftOut(node, environment)) return;
    const tag = tagOf(node);
    if (isField(node)) {
      flush();
      lines.push(describeField(environment.fieldState(node)));
      return;
    }
    if (tag === "LABEL") {
      // The label's words are read with its field ("Nome: Ana"), not again on their own.
      const fields = fieldsIn(node, environment);
      if (fields.length > 0) {
        flush();
        for (const field of fields) lines.push(describeField(environment.fieldState(field)));
        return;
      }
    }
    if (tag === "TABLE") {
      flush();
      lines.push(...tableLines(node, environment));
      return;
    }
    if (tag === "IMG") {
      current += ` ${attribute(node, "alt") ?? ""} `;
      return;
    }
    const role = attribute(node, "role");
    if (role === "alert") {
      flush();
      const text = normalizeSpaces(inlineText(node, environment));
      if (text) lines.push(`Alerta: ${text}`);
      return;
    }
    const block = BLOCKS.has(tag);
    if (block) flush();
    for (const child of children(node)) walk(child);
    if (block) flush();
  };

  walk(root);
  flush();
  return lines;
}

/** Cuts a text into pieces of at most `max` characters: by sentence, then by comma, then by word. */
export function splitLongText(text: string, max: number = MAX_CHUNK_LENGTH): string[] {
  const clean = normalizeSpaces(text);
  if (clean.length <= max) return clean ? [clean] : [];
  const pieces: string[] = [];
  let current = "";
  const push = (part: string) => {
    if (!part) return;
    if (current && `${current} ${part}`.length > max) {
      pieces.push(current);
      current = "";
    }
    if (part.length > max) {
      for (const smaller of splitPart(part, max)) {
        if (current && `${current} ${smaller}`.length > max) {
          pieces.push(current);
          current = "";
        }
        current = current ? `${current} ${smaller}` : smaller;
      }
      return;
    }
    current = current ? `${current} ${part}` : part;
  };
  for (const sentence of clean.split(/(?<=[.!?;:…])\s+/)) push(sentence);
  if (current) pieces.push(current);
  return pieces;
}

/** A sentence longer than the limit: by comma, then by word, and a word longer than the limit is cut. */
function splitPart(part: string, max: number): string[] {
  const out: string[] = [];
  let current = "";
  const words = part.split(/(?<=,)\s+|\s+/);
  for (const word of words) {
    for (let start = 0; start < word.length; start += max) {
      const slice = word.slice(start, start + max);
      if (current && `${current} ${slice}`.length > max) {
        out.push(current);
        current = "";
      }
      current = current ? `${current} ${slice}` : slice;
    }
  }
  if (current) out.push(current);
  return out;
}

/** The pieces handed to the voice, one line after the other, none longer than `max` (6.3 item 2). */
export function readingChunks(lines: readonly string[], max: number = MAX_CHUNK_LENGTH): string[] {
  return lines.flatMap((line) => splitLongText(line, max));
}

/** The selected text (6.1 item 2), cut by line and then by length. */
export function selectionChunks(selection: string, max: number = MAX_CHUNK_LENGTH): string[] {
  return readingChunks(selection.split(/\r?\n/), max);
}
