import { expect, type Page } from "@playwright/test";
import { ENTRANCE } from "./entrance";

// SPEC 2026-11-15-acessibilidade, part A (SF-260): the pages checked at each width (decision L6) and the measure of
// the horizontal scroll of a page, shared by the survey and by the responsive E2E (SF-263).

export type Profile = "Solicitante" | "Atendente" | "Gestor" | "Administrador";

/** The widths of decision L6: phone, tablet and desktop. */
export const WIDTHS = { phone: 360, tablet: 768, desktop: 1280 } as const;

/** A page by its address, or a detail page reached from the first link of a list that matches the pattern. */
export type CheckedPage = { path: string } | { from: string; link: RegExp; name: string };

const ID = "[0-9a-f-]{36}";

export const PUBLIC_PAGES: CheckedPage[] = [{ path: "/" }, { path: "/login" }, { path: "/help" }];

const ACCOUNT_PAGES: CheckedPage[] = [
  { path: "/help" },
  { path: "/account/data" },
  { path: "/account/api-tokens" },
  { path: "/account/password" },
];

const ADMIN_SECTIONS = [
  "overview", "users", "user-import", "roles", "sectors", "tags", "categories", "services", "checklists", "bundles",
  "knowledge", "calendar", "absences", "attendant-absences", "recurring", "configuration", "announcements", "emails",
  "dashboard", "analytics", "time", "periodic-reports", "audit", "api-tokens", "webhooks",
] as const;

export const PROFILE_PAGES: Record<Profile, CheckedPage[]> = {
  Solicitante: [
    { path: "/catalog" },
    { from: "/catalog", link: new RegExp(`^/catalog/${ID}$`), name: "/catalog/{id}" },
    { path: "/requests" },
    { from: "/requests", link: new RegExp(`^/requests/${ID}$`), name: "/requests/{id}" },
    { path: "/requests/following" },
    { path: "/notifications" },
    { path: "/notifications/preferences" },
    ...ACCOUNT_PAGES,
  ],
  Atendente: [
    { path: "/queue" },
    { from: "/queue", link: new RegExp(`^/queue/${ID}$`), name: "/queue/{id}" },
    { path: "/queue/dashboard" },
    { path: "/queue/responses" },
    { path: "/queue/absences" },
    { path: "/queue/mentions" },
    { path: "/queue/notifications" },
    { path: "/queue/notifications/preferences" },
    ...ACCOUNT_PAGES,
  ],
  Gestor: [
    { path: "/approvals" },
    { from: "/approvals", link: new RegExp(`^/approvals/${ID}$`), name: "/approvals/{id}" },
    { path: "/approvals/dashboard" },
    { path: "/approvals/analytics" },
    { path: "/approvals/time" },
    { path: "/approvals/absences" },
    { path: "/approvals/team-absences" },
    { path: "/approvals/recurring" },
    { path: "/approvals/tags" },
    { path: "/approvals/checklists" },
    { path: "/approvals/calendar" },
    { path: "/approvals/notifications" },
    { path: "/approvals/notifications/preferences" },
    ...ACCOUNT_PAGES,
  ],
  Administrador: [...ADMIN_SECTIONS.map((section) => ({ path: `/admin?section=${section}` })), ...ACCOUNT_PAGES],
};

export function pageName(checked: CheckedPage): string {
  return "path" in checked ? checked.path : checked.name;
}

export async function enterAs(page: Page, profile: Profile): Promise<void> {
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // buttons only work after hydration
  await page.getByRole("button", { name: `Entrar como ${profile}` }).click();
  await expect(page).not.toHaveURL(ENTRANCE);
}

export async function signOut(page: Page): Promise<void> {
  await page.goto("/");
  await page.context().clearCookies();
}

/** Opens the page; a detail page opens from its list. Returns false when the list has no matching link. */
export async function openChecked(page: Page, checked: CheckedPage): Promise<boolean> {
  if ("path" in checked) {
    await page.goto(checked.path);
    return true;
  }
  await page.goto(checked.from);
  const hrefs = await page
    .locator("main a[href]")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  const href = hrefs.find((candidate) => checked.link.test(candidate));
  if (!href) return false;
  await page.goto(href);
  return true;
}

/** What makes a page scroll sideways: its width against the window's and the outermost elements past the edge. */
export type Overflow = { scrollWidth: number; clientWidth: number; culprits: string[] };

/**
 * Measures the horizontal scroll of the open page. An element counts as a culprit when it passes the right edge, is
 * not inside an area that scrolls or clips on its own (those do not scroll the page) and its parent does not pass the
 * edge too (so only the outermost one of each branch is listed).
 */
export function measureOverflow(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const clientWidth = root.clientWidth;
    const passes = (element: Element) => element.getBoundingClientRect().right > clientWidth + 1;
    const clipped = (element: Element) => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX !== "visible") return true;
      }
      return false;
    };
    const describe = (element: Element) => {
      const classes = [...element.classList].slice(0, 2).map((name) => `.${name}`).join("");
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      const width = Math.round(element.getBoundingClientRect().width);
      return `${element.tagName.toLowerCase()}${classes} (${width}px) "${text}"`;
    };
    const culprits: string[] = [];
    for (const element of document.body.querySelectorAll("*")) {
      if (culprits.length >= 5) break;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || style.position === "fixed") continue;
      if (!passes(element) || clipped(element)) continue;
      if (element.parentElement && element.parentElement !== document.body && passes(element.parentElement)) continue;
      culprits.push(describe(element));
    }
    return { scrollWidth: root.scrollWidth, clientWidth, culprits };
  });
}
