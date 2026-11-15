import { expect, test, type Page } from "@playwright/test";
import { enterAs } from "./responsive-pages";
import { accessibilityButton } from "./accessibility-panel-helpers";

// SPEC 2026-11-15-acessibilidade, section 7 (SF-269; decision L7): "Pular para o conteúdo", then the "Acessibilidade"
// button with its panel, by keyboard, by the shortcut Alt+Shift+A and on every screen.

const panel = (page: Page) => page.getByRole("group", { name: "Opções de acessibilidade" });
const firstControl = (page: Page) => page.getByRole("button", { name: "Ouvir esta página" });

test("Tab reaches the skip link first, which moves the focus to the main content, then the button", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Tab");
  await expect(accessibilityButton(page)).toBeFocused();

  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#conteudo$/);
  await expect(page.locator("main")).toBeFocused();
  // From the main content, the next Tab goes to the page's first control, not back to the top.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Entrar como Administrador" })).toBeFocused();
});

test("the panel opens and closes by keyboard, says its state and gives the focus back on Esc", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/help");
  await page.waitForLoadState("networkidle");
  const button = accessibilityButton(page);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toHaveAttribute("aria-keyshortcuts", "Alt+Shift+A");
  await expect(panel(page)).toBeHidden();

  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Alto contraste" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(firstControl(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // A click outside closes it too.
  await button.click();
  await expect(panel(page)).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(panel(page)).toBeHidden();
});

test("Alt+Shift+A opens the panel from anywhere with the focus on its first control, and closes it again", async ({ page }) => {
  test.setTimeout(120_000);
  await enterAs(page, "Gestor");
  await page.waitForLoadState("networkidle");
  await page.locator("main").click({ position: { x: 5, y: 5 } });

  await page.keyboard.press("Alt+Shift+A");
  await expect(panel(page)).toBeVisible();
  await expect(firstControl(page)).toBeFocused();
  await page.keyboard.press("Alt+Shift+A");
  await expect(panel(page)).toBeHidden();
  await expect(accessibilityButton(page)).toBeFocused();
});

test("the button and the skip link are on every screen (section 7)", async ({ page }) => {
  test.setTimeout(120_000);
  const check = async () => {
    await expect(accessibilityButton(page)).toBeVisible();
    await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toHaveAttribute("href", "#conteudo");
    await expect(page.locator("main#conteudo")).toHaveCount(1);
  };
  for (const path of ["/", "/login", "/help"]) {
    await page.goto(path);
    await check();
  }
  for (const profile of ["Solicitante", "Atendente", "Gestor", "Administrador"] as const) {
    await enterAs(page, profile);
    await check();
    await page.context().clearCookies();
  }
});
