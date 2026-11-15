// SPEC 2026-11-15-acessibilidade, section 7 (SF-269; decision L7): the "Acessibilidade" button and its panel, at
// the top of every screen. The rules below are the parts that need no browser: the shortcut and the panel's state.

/** The id of every page's main content, the target of "Pular para o conteúdo". */
export const MAIN_CONTENT_ID = "conteudo";

/** The part of a keyboard event the shortcut needs. */
export interface ShortcutKey {
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  /** The physical key ("KeyA"), the same in any keyboard layout and with Alt held (which may change `key`). */
  readonly code: string;
}

/** Alt+Shift+A, and only that: with Ctrl or the command key it belongs to the system or the browser. */
export function isAccessibilityShortcut(event: ShortcutKey): boolean {
  return event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === "KeyA";
}

export type PanelEvent = "toggle" | "shortcut" | "escape" | "outside";

/** Whether the panel is open after an event: the button and the shortcut switch it; Esc and a click outside close it. */
export function nextPanelState(open: boolean, event: PanelEvent): boolean {
  return event === "toggle" || event === "shortcut" ? !open : false;
}
