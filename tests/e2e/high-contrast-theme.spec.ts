import { expect, test, type Page } from "@playwright/test";
import { enterAs } from "./responsive-pages";

// SPEC 2026-11-15-acessibilidade, 5.1 item 2 and 5.3 (SF-264; CA-CON-03): the high contrast theme, switched here by
// the attribute that SF-265 will set, and the normal theme unchanged around it.

function setContrast(page: Page, high: boolean) {
  return page.evaluate((on) => {
    if (on) document.documentElement.dataset.contrast = "high";
    else delete document.documentElement.dataset.contrast;
  }, high);
}

/** The computed colors of every element of the page, in order. */
function colors(page: Page) {
  return page.evaluate(() =>
    // Only the page's own content: the development overlay of Next.js is not part of it.
    [...document.querySelectorAll("header *, main *")].map((element) => {
      const style = getComputedStyle(element);
      return [style.color, style.backgroundColor, style.borderTopColor, style.boxShadow, style.backgroundImage].join(" ");
    }),
  );
}

test("the high contrast theme turns black with white text and yellow links, and the normal theme comes back unchanged", async ({ page }) => {
  test.setTimeout(120_000);
  // Buttons and fields fade their colors (140 ms); without motion the comparison reads the final colors.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterAs(page, "Atendente");
  await page.goto("/queue");

  // The normal theme, as SF-159 left it (CA-CON-03).
  const body = page.locator("body");
  await expect(body).toHaveCSS("background-color", "rgb(243, 246, 247)");
  await expect(body).toHaveCSS("color", "rgb(23, 43, 58)");
  const before = await colors(page);

  await setContrast(page, true);
  await expect(body).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(body).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(body).toHaveCSS("background-image", "none");
  const link = page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Meu painel" });
  await expect(link).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(link).toHaveCSS("text-decoration-line", "underline");
  const header = page.locator(".page-header").first();
  await expect(header).toHaveCSS("box-shadow", "none");
  await expect(header).toHaveCSS("border-top-color", "rgb(255, 255, 255)");
  // A secondary button: black with white text.
  const signOut = page.getByRole("button", { name: "Sair" });
  await expect(signOut).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(signOut).toHaveCSS("color", "rgb(255, 255, 255)");
  // The focus: a yellow outline of 3 px.
  await link.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(link).toHaveCSS("outline-color", "rgb(255, 212, 0)");
  await expect(link).toHaveCSS("outline-width", "3px");

  // Back to normal: every element has the colors it had before.
  await setContrast(page, false);
  await expect.poll(() => colors(page)).toEqual(before);
});

test("tags keep their own color in high contrast, as a light text on black", async ({ page }) => {
  test.setTimeout(120_000);
  await enterAs(page, "Gestor");
  await page.goto("/approvals/tags");
  // The demo data has no tags: one is created, in red.
  const create = page.locator("form").filter({ has: page.getByRole("button", { name: "Criar etiqueta" }) });
  await create.locator('[name="name"]').fill(`Contraste ${Date.now()}`);
  await create.locator('select[name="color"]').selectOption("red");
  await create.getByRole("button", { name: "Criar etiqueta" }).click();
  const chip = page.locator(".tag-chip").first();
  await expect(chip).toBeVisible();
  const normalColor = await chip.evaluate((element) => getComputedStyle(element).color);

  await setContrast(page, true);
  await expect(chip).toHaveCSS("background-color", "rgb(0, 0, 0)");
  const contrastColor = await chip.evaluate((element) => ({
    color: getComputedStyle(element).color,
    variable: getComputedStyle(element).getPropertyValue("--tag-contrast").trim().toLowerCase(),
  }));
  expect(contrastColor.color).not.toBe(normalColor);
  const [r, g, b] = contrastColor.variable.match(/[0-9a-f]{2}/g)!.map((pair) => Number.parseInt(pair, 16));
  expect(contrastColor.color).toBe(`rgb(${r}, ${g}, ${b})`);
  // Red's light version (TAG_COLORS.red.contrastText).
  expect(contrastColor.color).toBe("rgb(252, 165, 165)");
});
