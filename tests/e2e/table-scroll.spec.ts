import { expect, test } from "@playwright/test";
import { WIDTHS, enterAs, measureOverflow } from "./responsive-pages";

// SPEC 2026-11-15-acessibilidade, 4.1 items 2 and 3 (SF-262; CA-RSP-03): on a phone a wide table scrolls inside its
// own named area, reachable by keyboard, without pushing the page; buttons and menu links are touch targets of
// at least 44 × 44 px.

test("a wide table scrolls inside its own area on a phone, by keyboard too", async ({ page }) => {
  test.setTimeout(120_000);
  await enterAs(page, "Gestor");
  await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
  await page.goto("/approvals/analytics");

  // The tables of the charts are behind "Ver os números em tabela"; the first one is opened.
  const firstChartTable = page.locator("details.chart-table").first();
  await firstChartTable.locator("summary").click();
  const area = firstChartTable.locator(".table-scroll");
  await expect(area).toHaveAttribute("role", "region");
  await expect(area).toHaveAttribute("tabindex", "0");
  expect(await area.getAttribute("aria-label")).toBeTruthy();

  // A table wider than the phone (as with long names or many columns) stays inside its area.
  await area.locator("table").evaluate((table) => {
    table.style.minWidth = "900px";
  });
  const overflow = await measureOverflow(page);
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  const sizes = await area.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(sizes.scroll).toBeGreaterThan(sizes.client);

  // By keyboard: Tab reaches the area from the summary and the arrow keys scroll it.
  await firstChartTable.locator("summary").focus();
  await page.keyboard.press("Tab");
  await expect(area).toBeFocused();
  for (let press = 0; press < 5; press += 1) await page.keyboard.press("ArrowRight");
  await expect.poll(() => area.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test("buttons and menu links are touch targets of at least 44 × 44 px on a phone", async ({ page }) => {
  test.setTimeout(120_000);
  await enterAs(page, "Gestor");
  await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
  await page.goto("/approvals");
  await page.getByRole("button", { name: "Menu" }).click();

  const small = await page.evaluate(() =>
    [...document.querySelectorAll("header button, header nav a, main button")]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { text: (element.textContent ?? "").trim(), width: Math.round(box.width), height: Math.round(box.height) };
      })
      .filter(({ width, height }) => width < 44 || height < 44),
  );
  expect(small).toEqual([]);
});
