import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PROFILE_PAGES, PUBLIC_PAGES, enterAs, openChecked, pageName, type CheckedPage, type Profile } from "./responsive-pages";

// SPEC 2026-11-15-acessibilidade, 5.4 (SF-266; CA-CON-02; decision L5): the axe-core scan of every page of the list,
// in the normal theme and in high contrast. It uses the axe-core already in node_modules (it comes with
// eslint-plugin-jsx-a11y), injected into the page, without a new dependency.

const AXE_SCRIPT = join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const WCAG_A_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type Theme = "normal" | "high";
type Violation = { theme: Theme; page: string; rule: string; targets: string[]; summary: string };

/** Runs axe on the open page: WCAG A and AA, plus the enhanced contrast (7:1, 1.4.6) in high contrast. */
async function scan(page: Page, theme: Theme): Promise<Array<Omit<Violation, "theme" | "page">>> {
  await page.addScriptTag({ path: AXE_SCRIPT });
  return page.evaluate(async (high) => {
    type AxeResult = { violations: Array<{ id: string; nodes: Array<{ target: unknown[]; failureSummary?: string }> }> };
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<AxeResult> } }).axe;
    // The development overlay of Next.js is not part of the application.
    const context = { exclude: [["nextjs-portal"]] };
    // axe runs one scan at a time.
    const results = [await axe.run(context, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })];
    if (high) results.push(await axe.run(context, { runOnly: { type: "rule", values: ["color-contrast-enhanced"] } }));
    return results.flatMap(({ violations }) =>
      violations.map(({ id, nodes }) => ({
        rule: id,
        targets: nodes.slice(0, 5).map(({ target }) => target.map(String).join(" ")),
        summary: (nodes[0]?.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 300),
      })),
    );
  }, theme === "high");
}

async function scanPages(page: Page, label: string, pages: CheckedPage[], theme: Theme, missing: string[]): Promise<Violation[]> {
  const found: Violation[] = [];
  for (const checked of pages) {
    if (!(await openChecked(page, checked))) {
      missing.push(`${label} ${pageName(checked)}`);
      continue;
    }
    await page.waitForLoadState("networkidle");
    const contrast = await page.evaluate(() => document.documentElement.getAttribute("data-contrast"));
    expect(contrast, `${label} ${pageName(checked)}`).toBe(theme === "high" ? "high" : null);
    for (const violation of await scan(page, theme)) found.push({ theme, page: `${label} ${pageName(checked)}`, ...violation });
  }
  return found;
}

for (const theme of ["normal", "high"] as const) {
  test(`axe finds no WCAG A/AA violation${theme === "high" ? " nor enhanced contrast one" : ""} in the ${theme} theme (CA-CON-02)`, async ({ page }) => {
    test.setTimeout(600_000);
    expect(WCAG_A_AA).toHaveLength(5);
    // Without motion, so colors are read at their final value; the theme comes from its real cookie (SF-265).
    await page.emulateMedia({ reducedMotion: "reduce", contrast: "no-preference" });
    if (theme === "high") {
      await page.context().addCookies([{ name: "sf-contrast", value: "high", url: "http://127.0.0.1:3100" }]);
    }
    const missing: string[] = [];
    const violations = await scanPages(page, "Sem login", PUBLIC_PAGES, theme, missing);
    for (const profile of Object.keys(PROFILE_PAGES) as Profile[]) {
      await enterAs(page, profile);
      violations.push(...(await scanPages(page, profile, PROFILE_PAGES[profile], theme, missing)));
      // Signing out keeps the theme's cookie: only the session's cookies go.
      const keep = (await page.context().cookies()).filter(({ name }) => name === "sf-contrast");
      await page.context().clearCookies();
      await page.context().addCookies(keep);
    }
    expect(missing).toEqual([]);
    // A failure lists each page, rule, the first elements and axe's summary.
    expect(violations).toEqual([]);
  });
}
