import { expect, type Page } from "@playwright/test";

// SPEC 2026-11-15-acessibilidade, section 7 (SF-269): the controls of the high contrast and of the reading live in the
// panel of the "Acessibilidade" button. These helpers open it before using a control.

export const accessibilityButton = (page: Page) => page.getByRole("button", { name: "Acessibilidade", exact: true });

/** The "Alto contraste" button, also while the panel is closed (its state is read without opening it). */
export const contrastToggle = (page: Page) => page.getByRole("button", { name: "Alto contraste", includeHidden: true });

/** Opens the panel, once the page is hydrated, if it is not open yet. */
export async function openAccessibility(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  const button = accessibilityButton(page);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
}

/** Switches the high contrast as a person does: opens the panel and presses the button. */
export async function clickContrast(page: Page): Promise<void> {
  await openAccessibility(page);
  await contrastToggle(page).click();
}
