import { expect, test, type Page } from "@playwright/test";
import { enterAs } from "./responsive-pages";

// SPEC 2026-11-15-acessibilidade, 5.1 items 1, 3 and 4 and 5.3 item 4 (SF-265; CA-CON-01 and CA-CON-03): "Alto
// contraste" on every screen, kept between visits and across the sign-in, the system's preference without a choice,
// and the theme already there at the first paint.

const toggle = (page: Page) => page.getByRole("button", { name: "Alto contraste" });
const contrastOf = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-contrast"));

/** Records, for each load, the page's data-contrast at the moment the body starts: before anything is painted. */
async function watchFirstPaint(page: Page) {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (!document.body) return;
      (window as unknown as { contrastAtBody: string | null }).contrastAtBody = document.documentElement.getAttribute("data-contrast");
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
}
const contrastAtBody = (page: Page) => page.evaluate(() => (window as unknown as { contrastAtBody: string | null }).contrastAtBody);

test("the choice switches the theme at once, holds on the next visits and across the sign-in (CA-CON-01)", async ({ page }) => {
  test.setTimeout(120_000);
  await watchFirstPaint(page);

  // At the entrance, without a session.
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // the button only works after hydration
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  expect(await contrastOf(page)).toBeNull();
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  expect(await contrastOf(page)).toBe("high");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  const cookie = (await page.context().cookies()).find(({ name }) => name === "sf-contrast");
  expect(cookie?.value).toBe("high");
  expect(cookie?.path).toBe("/");
  expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 360 * 24 * 3600);

  // The next visit starts in high contrast before the first paint (5.3 item 4), on the login screen too.
  await page.goto("/login");
  expect(await contrastAtBody(page)).toBe("high");
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");

  // After the sign-in the choice still holds, and the button is on the area's screens.
  await enterAs(page, "Solicitante");
  expect(await contrastAtBody(page)).toBe("high");
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");

  // Switched off, the normal theme comes back at once and on the next visit, even if the system asks for more.
  await page.emulateMedia({ contrast: "more" });
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  expect(await contrastOf(page)).toBeNull();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(243, 246, 247)");
  await page.reload();
  expect(await contrastAtBody(page)).toBeNull();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
});

test("without a choice, the theme follows the system's preference, also when it changes (CA-CON-03)", async ({ page }) => {
  test.setTimeout(120_000);
  await watchFirstPaint(page);

  await page.emulateMedia({ contrast: "no-preference" });
  await page.goto("/help");
  expect(await contrastAtBody(page)).toBeNull();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");

  await page.emulateMedia({ contrast: "more" });
  await page.reload();
  expect(await contrastAtBody(page)).toBe("high");
  await page.waitForLoadState("networkidle");
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");

  // The system changes while the page is open: the theme follows it, as no choice was made.
  await page.emulateMedia({ contrast: "no-preference" });
  await expect.poll(() => contrastOf(page)).toBeNull();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  expect((await page.context().cookies()).some(({ name }) => name === "sf-contrast")).toBe(false);
});

test("the button is on every screen: entrance, login, help, each area and the administration (5.1 item 1)", async ({ page }) => {
  test.setTimeout(120_000);
  for (const path of ["/", "/login", "/help"]) {
    await page.goto(path);
    await expect(toggle(page)).toBeVisible();
  }
  for (const profile of ["Solicitante", "Atendente", "Gestor", "Administrador"] as const) {
    await enterAs(page, profile);
    await expect(toggle(page)).toBeVisible();
    await page.context().clearCookies();
  }
});
