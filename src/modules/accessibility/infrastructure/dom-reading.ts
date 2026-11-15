import { normalizeSpaces, type FieldState, type ReadingEnvironment, type ReadingNode } from "../domain/reading";

// SPEC 2026-11-15-acessibilidade, 6.1 item 1 (SF-268): the reading rules on the browser's real page. Runs only in the
// browser; the E2E checks it (SF-270).

const FIELD_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA", "BUTTON"]);

/** The words of a label without the words of the fields inside it (a select's options, for one). */
function labelWords(label: Element): string {
  let words = "";
  for (const node of Array.from(label.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) words += node.textContent ?? "";
    else if (node instanceof Element && !FIELD_TAGS.has(node.tagName) && node.getAttribute("aria-hidden") !== "true") {
      words += ` ${labelWords(node)} `;
    }
  }
  return normalizeSpaces(words);
}

/** The field's name as a screen reader would say it: aria-label, aria-labelledby, its label, then hints. */
function fieldLabel(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const ariaLabel = field.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel;
  const labelledBy = field.getAttribute("aria-labelledby");
  if (labelledBy) {
    const words = labelledBy
      .split(/\s+/)
      .map((id) => field.ownerDocument.getElementById(id))
      .map((element) => (element ? labelWords(element) : ""))
      .join(" ");
    if (words.trim()) return words;
  }
  const label = field.labels?.[0];
  if (label) {
    const words = labelWords(label);
    if (words) return words;
  }
  return field.getAttribute("placeholder") ?? field.getAttribute("title") ?? "";
}

function fieldState(node: ReadingNode): FieldState {
  const field = node as unknown as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const label = fieldLabel(field);
  if (field instanceof HTMLSelectElement) {
    return { kind: "select", label, selected: Array.from(field.selectedOptions).map((option) => option.text) };
  }
  if (field instanceof HTMLInputElement) {
    const type = field.type.toLowerCase();
    if (type === "checkbox" || type === "radio") return { kind: type, label, checked: field.checked };
    if (type === "password") return { kind: "password", label, filled: field.value.length > 0 };
    if (type === "file") {
      return { kind: "text", label, value: Array.from(field.files ?? []).map((file) => file.name).join(", ") };
    }
  }
  return { kind: "text", label, value: field.value };
}

function isHidden(node: ReadingNode): boolean {
  const element = node as unknown as Element;
  if (typeof element.checkVisibility === "function") return !element.checkVisibility({ visibilityProperty: true });
  const style = getComputedStyle(element);
  return style.display === "none" || style.visibility === "hidden";
}

/** Everything but plain inline text is shown apart from its neighbours (badges are inline-flex, for one). */
function isSpacedApart(node: ReadingNode): boolean {
  const display = getComputedStyle(node as unknown as Element).display;
  return display !== "inline" && display !== "contents";
}

export const domReadingEnvironment: ReadingEnvironment = { isHidden, fieldState, isSpacedApart };
