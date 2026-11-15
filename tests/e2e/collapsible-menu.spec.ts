import { expect, test, type Page } from "@playwright/test";
import { WIDTHS, enterAs, measureOverflow } from "./responsive-pages";

// SPEC 2026-11-15-acessibilidade, 4.1 item 1 (SF-261; CA-RSP-02): the "Menu" button of the areas and of the
// administration, by mouse and by keyboard, and the screens above 760 px.

const mainNavigation = (page: Page) => page.getByRole("navigation", { name: "Navegação principal" });
const menuButton = (page: Page) => page.getByRole("button", { name: "Menu" });

test("the area menu collapses on phones, opens by mouse and keyboard and returns the focus", async ({ page }) => {
  test.setTimeout(120_000);
  await enterAs(page, "Gestor");

  // Desktop: no button, the links as before, now without pushing the page sideways.
  await page.setViewportSize({ width: WIDTHS.desktop, height: 800 });
  await expect(menuButton(page)).toBeHidden();
  await expect(mainNavigation(page).getByRole("link", { name: "Calendário" })).toBeVisible();
  const desktop = await measureOverflow(page);
  expect(desktop.scrollWidth).toBeLessThanOrEqual(desktop.clientWidth);

  // Phone: the list is behind the closed button.
  await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
  await expect(menuButton(page)).toBeVisible();
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(mainNavigation(page)).toBeHidden();

  // By mouse: opens, and following a link closes it on the new page.
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
  await mainNavigation(page).getByRole("link", { name: "Calendário" }).click();
  await expect(page).toHaveURL(/\/approvals\/calendar$/);
  await expect(mainNavigation(page)).toBeHidden();
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");

  // By keyboard: Enter opens, Tab reaches the first link, Esc closes and gives the focus back to the button.
  await menuButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(mainNavigation(page)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(mainNavigation(page).getByRole("link", { name: "Aprovações" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(mainNavigation(page)).toBeHidden();
  await expect(menuButton(page)).toBeFocused();
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
  // Space toggles it too, and the button closes it again.
  await page.keyboard.press("Space");
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(mainNavigation(page)).toBeHidden();
});

test("the administration's sections collapse on phones and the top links wrap", async ({ page }) => {
  test.setTimeout(120_000);
  await enterAs(page, "Administrador");
  const sections = page.getByRole("navigation", { name: "Seções administrativas" });

  await page.setViewportSize({ width: WIDTHS.desktop, height: 800 });
  await expect(menuButton(page)).toBeHidden();
  await expect(sections.getByRole("link", { name: "Usuários", exact: true })).toBeVisible();

  await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
  await expect(sections).toBeHidden();
  await menuButton(page).click();
  await sections.getByRole("link", { name: "Usuários", exact: true }).click();
  await expect(page).toHaveURL(/section=users$/);
  await expect(sections).toBeHidden();
  // The links at the top no longer push the page sideways (finding R3 of SF-260).
  const phone = await measureOverflow(page);
  expect(phone.scrollWidth).toBeLessThanOrEqual(phone.clientWidth);
});
