import { expect, test, type Page } from "@playwright/test";
import {
  PROFILE_PAGES,
  PUBLIC_PAGES,
  WIDTHS,
  enterAs,
  measureOverflow,
  openChecked,
  pageName,
  signOut,
  type CheckedPage,
  type Profile,
} from "./responsive-pages";

// SPEC 2026-11-15-acessibilidade, part A (SF-263; CA-RSP-01 and CA-RSP-04). The survey of SF-260 became this
// assertion: no page of the list scrolls sideways at the widths of decision L6, and above 760 px the screens keep
// their layout (no "Menu" button; the menu that fits in one line still in one line).

type Finding = { profile: string; page: string; width: number; scrollWidth: number; culprits: string[] };

async function horizontalScrolls(page: Page, profile: string, pages: CheckedPage[], missing: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const width of Object.values(WIDTHS)) {
    await page.setViewportSize({ width, height: 800 });
    for (const checked of pages) {
      if (!(await openChecked(page, checked))) {
        if (width === WIDTHS.phone) missing.push(`${profile} ${pageName(checked)}`);
        continue;
      }
      await page.waitForLoadState("networkidle");
      const overflow = await measureOverflow(page);
      if (overflow.scrollWidth > overflow.clientWidth) findings.push({ profile, page: pageName(checked), width, ...overflow });
    }
  }
  return findings;
}

test("no page of the list scrolls sideways at 360, 768 and 1280 px (CA-RSP-01)", async ({ page }) => {
  test.setTimeout(600_000);
  const missing: string[] = [];
  const findings = await horizontalScrolls(page, "Sem login", PUBLIC_PAGES, missing);
  for (const profile of Object.keys(PROFILE_PAGES) as Profile[]) {
    await page.setViewportSize({ width: WIDTHS.desktop, height: 800 });
    await enterAs(page, profile);
    findings.push(...(await horizontalScrolls(page, profile, PROFILE_PAGES[profile], missing)));
    await signOut(page);
  }
  // A failure names each page, width and the outermost elements past the edge.
  expect(findings).toEqual([]);
  // Every detail page was reached through its list, so none was skipped silently.
  expect(missing).toEqual([]);
});

test("above 760 px the screens keep their layout (CA-RSP-04)", async ({ page }) => {
  test.setTimeout(120_000);
  const menuButton = page.getByRole("button", { name: "Menu" });
  const linkTops = (navigation: string) =>
    page
      .getByRole("navigation", { name: navigation })
      .getByRole("link")
      // The top of each line of links (links less than 10 px apart are on the same line).
      .evaluateAll((links) =>
        links
          .map((link) => link.getBoundingClientRect().top)
          .sort((first, second) => first - second)
          .filter((top, index, tops) => index === 0 || top - tops[index - 1]! >= 10),
      );

  const linkHeights = () =>
    page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().height)));

  // The requester's menu, which fits at 1280 px, stays in one line beside the brand and "Sair", as before.
  await page.setViewportSize({ width: WIDTHS.desktop, height: 800 });
  await enterAs(page, "Solicitante");
  await page.goto("/catalog");
  await expect(menuButton).toBeHidden();
  const tops = await linkTops("Navegação principal");
  expect(tops).toHaveLength(1);
  const [brand, signOutButton] = await Promise.all([
    page.locator(".app-topbar .brand-link").boundingBox(),
    page.getByRole("button", { name: "Sair" }).boundingBox(),
  ]);
  expect(Math.abs(tops[0]! - brand!.y)).toBeLessThan(brand!.height);
  expect(Math.abs(signOutButton!.y - brand!.y)).toBeLessThan(brand!.height);
  await signOut(page);

  // The attendant's and the manager's menus did not fit in one line (the attendant's links broke their text in two
  // lines; the manager's pushed the page): at 1280 px and 768 px they wrap whole links in more lines, every link
  // visible, no button (SPEC 4.3 item 4).
  for (const profile of ["Atendente", "Gestor"] as const) {
    for (const width of [WIDTHS.desktop, WIDTHS.tablet]) {
      await page.setViewportSize({ width, height: 800 });
      await enterAs(page, profile);
      await expect(menuButton).toBeHidden();
      expect((await linkTops("Navegação principal")).length).toBeGreaterThan(1);
      // Whole links: none breaks its text in two lines.
      expect(Math.max(...(await linkHeights()))).toBeLessThan(30);
      await signOut(page);
    }
  }

  // The administration's sections stay visible at 768 px, without the button.
  await enterAs(page, "Administrador");
  await expect(menuButton).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Seções administrativas" }).getByRole("link", { name: "Webhooks" })).toBeVisible();
});

test("a sample of pages does not scroll sideways at 320 px, the WCAG reflow width (rule 4.3.1)", async ({ page }) => {
  test.setTimeout(180_000);
  const missing: string[] = [];
  const sample: Array<[Profile | null, CheckedPage[]]> = [
    [null, [{ path: "/" }, { path: "/help" }]],
    ["Solicitante", [{ path: "/catalog" }, PROFILE_PAGES.Solicitante[1]!, { path: "/requests" }]],
    ["Atendente", [{ path: "/queue" }, PROFILE_PAGES.Atendente[1]!]],
    ["Gestor", [{ path: "/approvals/analytics" }, { path: "/approvals/calendar" }]],
    ["Administrador", [{ path: "/admin?section=services" }, { path: "/admin?section=audit" }]],
  ];
  const findings: Array<{ profile: string; page: string; scrollWidth: number; culprits: string[] }> = [];
  for (const [profile, pages] of sample) {
    if (profile) await enterAs(page, profile);
    await page.setViewportSize({ width: 320, height: 800 });
    for (const checked of pages) {
      if (!(await openChecked(page, checked))) {
        missing.push(`${profile} ${pageName(checked)}`);
        continue;
      }
      await page.waitForLoadState("networkidle");
      const overflow = await measureOverflow(page);
      if (overflow.scrollWidth > overflow.clientWidth) findings.push({ profile: profile ?? "Sem login", page: pageName(checked), ...overflow });
    }
    if (profile) await signOut(page);
    await page.setViewportSize({ width: WIDTHS.desktop, height: 800 });
  }
  expect(findings).toEqual([]);
  expect(missing).toEqual([]);
});
