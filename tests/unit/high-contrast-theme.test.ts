import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TAG_COLORS, contrastRatio } from "@/modules/tags";

// SPEC 2026-11-15-acessibilidade, 5.3 (SF-264; CA-CON-03 and part of CA-CON-02 by the rules): the colors of the
// rules are tokens, and the high contrast theme redefines them with at least 7:1 for text and 3:1 for lines on black.

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\r\n/g, "\n");
const HIGH_CONTRAST = ':root[data-contrast="high"] {';

function block(start: string): string {
  const from = css.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  return css.slice(from + start.length, css.indexOf("\n}", from));
}

function tokens(body: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of body.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)) found.set(match[1]!, match[2]!.trim());
  return found;
}

const normal = tokens(block(":root {"));
const high = tokens(block(HIGH_CONTRAST));
const BLACK = "#000000";

const TEXT = [
  "--ink", "--muted", "--soft-muted", "--brand", "--brand-strong", "--danger", "--success", "--link-hover",
  "--placeholder", "--label-text", "--nav-text", "--control-text", "--admin-nav-text", "--inactive-text",
  "--danger-strong", "--success-text", "--error-text", "--warning-text",
];
const LINES = [
  "--line", "--input-line", "--card-line", "--panel-line", "--secondary-line", "--empty-line", "--pill-line",
  "--history-line", "--history-dot-ring", "--error-line", "--danger-line", "--success-line", "--warning-line",
  "--late-line", "--on-time-line", "--selected-line", "--card-line-hover", "--control-border-hover",
  "--quiet-border-hover", "--save-line", "--focus-outline", "--focus-ring", "--header-line", "--star",
];
const BACKGROUNDS = [
  "--surface", "--canvas", "--brand-soft", "--danger-soft", "--success-soft", "--header-surface", "--nav-surface",
  "--card-surface", "--form-surface", "--inactive-surface", "--empty-surface", "--warning-soft",
];
const GLOWS = [
  "--glow-brand-faint", "--glow-brand-soft", "--glow-slate", "--button-hover-shadow", "--shadow-faint",
  "--shadow-light", "--shadow-strong", "--save-shadow",
];

describe("the colors of the rules are tokens (5.3 item 1)", () => {
  it("no rule of the normal theme writes a color; only the token definitions do", () => {
    const rules = css.slice(css.indexOf("\n}", css.indexOf(":root {")) + 2, css.indexOf("/* SPEC 2026-11-15-acessibilidade, part B"));
    const literals = rules
      .split("\n")
      .filter((line) => !line.trim().startsWith("--") && !line.includes("white-space"))
      .filter((line) => /#[0-9a-f]{3,8}\b|rgb\(|(?<![-\w])(white|black)(?![-\w])/i.test(line));
    expect(literals).toEqual([]);
  });

  it("the high contrast theme redefines every color token of the normal one", () => {
    // The color tokens, by their value (sizes such as --radius or --accessibility-bar-height are not colors).
    const colors = [...normal].filter(([, value]) => /#[0-9a-f]{3,8}\b|rgb\(/i.test(value)).map(([name]) => name);
    expect(colors.length).toBeGreaterThan(60);
    expect(colors.filter((name) => !high.has(name))).toEqual([]);
  });

  it("every token of the lists below is a color of the theme", () => {
    for (const name of [...TEXT, ...LINES, ...BACKGROUNDS, ...GLOWS]) expect(high.has(name), name).toBe(true);
  });
});

describe("the high contrast theme (decision L4; 5.3 item 2)", () => {
  it("is black, with the text in white and the links in yellow", () => {
    for (const name of ["--surface", "--canvas"]) expect(high.get(name)).toBe(BLACK);
    expect(high.get("--ink")).toBe("#ffffff");
    expect(high.get("--brand-strong")).toBe("#ffd400");
    expect(high.get("--focus-outline")).toBe("#ffd400");
  });

  it.each(TEXT)("%s reaches 7:1 on black (AAA, 1.4.6)", (name) => {
    expect(contrastRatio(high.get(name)!, BLACK)).toBeGreaterThanOrEqual(7);
  });

  it.each(LINES)("%s reaches 3:1 on black (1.4.11)", (name) => {
    expect(contrastRatio(high.get(name)!, BLACK)).toBeGreaterThanOrEqual(3);
  });

  it("every background is black, so the text tokens are checked against what they sit on", () => {
    for (const name of BACKGROUNDS) expect(high.get(name), name).toBe(BLACK);
  });

  it("the text on a button reaches 7:1 on the button", () => {
    expect(contrastRatio(high.get("--on-brand")!, high.get("--brand")!)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(high.get("--on-brand")!, high.get("--save")!)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(high.get("--on-brand")!, high.get("--save-hover")!)).toBeGreaterThanOrEqual(7);
  });

  it("has no shadow nor gradient", () => {
    expect(high.get("--shadow")).toBe("none");
    for (const name of GLOWS) expect(high.get(name), name).toBe("transparent");
  });

  it("underlines the links and draws a focus outline of at least 3 px", () => {
    expect(css).toMatch(/:root\[data-contrast="high"\] a,[^{]*\{\s*text-decoration: underline;/);
    expect(css).toMatch(/:root\[data-contrast="high"\] :focus-visible \{\s*outline: 3px solid var\(--focus-outline\);/);
  });
});

describe("tags and charts in high contrast (5.3 item 3)", () => {
  it("each tag color is a light text of at least 7:1 on black, all different", () => {
    const texts = Object.values(TAG_COLORS).map(({ contrastText }) => contrastText);
    for (const text of texts) expect(contrastRatio(text, BLACK)).toBeGreaterThanOrEqual(7);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("the chart series reach 3:1 on black and stay apart from each other", () => {
    const charts = tokens(block(':root[data-contrast="high"] .analytics {'));
    for (const name of ["--series-1", "--series-2", "--chart-grid"]) {
      expect(contrastRatio(charts.get(name)!, BLACK), name).toBeGreaterThanOrEqual(3);
    }
    expect(charts.get("--series-1")).not.toBe(charts.get("--series-2"));
    // The arrivals grid keeps "darker, more requests": each step darker than the one before.
    const steps = [0, 1, 2, 3, 4, 5].map((step) => contrastRatio(charts.get(`--heat-${step}`)!, BLACK));
    for (let step = 1; step < steps.length; step += 1) expect(steps[step]!).toBeLessThan(steps[step - 1]!);
  });
});
