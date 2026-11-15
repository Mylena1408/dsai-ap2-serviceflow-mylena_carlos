import { describe, expect, it } from "vitest";
import { MAIN_CONTENT_ID, isAccessibilityShortcut, nextPanelState, type ShortcutKey } from "@/modules/accessibility";

// SPEC 2026-11-15-acessibilidade, section 7 (SF-269): the shortcut and the panel's state.

const key = (overrides: Partial<ShortcutKey>): ShortcutKey => ({
  altKey: true,
  shiftKey: true,
  ctrlKey: false,
  metaKey: false,
  code: "KeyA",
  ...overrides,
});

describe("the shortcut Alt+Shift+A", () => {
  it("is the physical A key with Alt and Shift, and nothing else", () => {
    expect(isAccessibilityShortcut(key({}))).toBe(true);
    expect(isAccessibilityShortcut(key({ shiftKey: false }))).toBe(false);
    expect(isAccessibilityShortcut(key({ altKey: false }))).toBe(false);
    expect(isAccessibilityShortcut(key({ ctrlKey: true }))).toBe(false);
    expect(isAccessibilityShortcut(key({ metaKey: true }))).toBe(false);
    expect(isAccessibilityShortcut(key({ code: "KeyS" }))).toBe(false);
  });
});

describe("the panel", () => {
  it("opens and closes by the button and the shortcut; Esc and a click outside only close it", () => {
    expect(nextPanelState(false, "toggle")).toBe(true);
    expect(nextPanelState(true, "toggle")).toBe(false);
    expect(nextPanelState(false, "shortcut")).toBe(true);
    expect(nextPanelState(true, "shortcut")).toBe(false);
    expect(nextPanelState(true, "escape")).toBe(false);
    expect(nextPanelState(false, "escape")).toBe(false);
    expect(nextPanelState(true, "outside")).toBe(false);
  });

  it("points the skip link to the main content's id", () => {
    expect(MAIN_CONTENT_ID).toBe("conteudo");
  });
});

describe("the skip link's target and the panel's markup (section 7)", () => {
  it("every main content of the screens is the skip link's target and can take the focus", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files = (directory: string): string[] =>
      readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);
        return statSync(path).isDirectory() ? files(path) : path.endsWith(".tsx") ? [path] : [];
      });
    const mains = files(join(process.cwd(), "src", "app")).flatMap((file) =>
      (readFileSync(file, "utf8").match(/<main[^>]*>/g) ?? []).map((tag) => ({ file, tag })),
    );
    expect(mains.length).toBeGreaterThanOrEqual(37);
    for (const { file, tag } of mains) expect(tag, file).toContain(`id="${MAIN_CONTENT_ID}" tabIndex={-1}`);
  });

  it("starts closed, naming the panel it controls and its shortcut", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AccessibilityPanel } = await import("@/app/_components/accessibility-panel");
    const html = renderToStaticMarkup(
      createElement(AccessibilityPanel, null as unknown as Parameters<typeof AccessibilityPanel>[0], createElement("span", null, "x")),
    );
    const button = /<button[^>]*>/.exec(html)![0];
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('aria-keyshortcuts="Alt+Shift+A"');
    const controls = /aria-controls="([^"]+)"/.exec(button)![1];
    expect(html).toContain(`id="${controls}"`);
    expect(html).toMatch(/<div aria-label="Opções de acessibilidade" class="accessibility-panel" hidden="" id="[^"]+" role="group"><span>x<\/span><\/div>/);
  });
});
