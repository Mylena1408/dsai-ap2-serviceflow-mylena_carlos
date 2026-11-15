import { writeFileSync, mkdirSync } from "node:fs";
import { test } from "@playwright/test";
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

// SPEC 2026-11-15-acessibilidade, part A (SF-260): the survey of the widths. It only lists the pages that scroll
// sideways at 360 px and 768 px, without failing, so it runs only when asked (RESPONSIVE_SURVEY=1); the responsive
// E2E (SF-263) turns the same measure into an assertion.

test.skip(!process.env.RESPONSIVE_SURVEY, "survey runs only with RESPONSIVE_SURVEY=1");

type Finding = { profile: string; page: string; width: number; scrollWidth: number; culprits: string[] };

test("survey of the horizontal scroll at the phone and tablet widths", async ({ page }) => {
  test.setTimeout(900_000);
  const findings: Finding[] = [];
  const missing: string[] = [];

  async function survey(profile: string, pages: CheckedPage[]) {
    for (const width of [WIDTHS.phone, WIDTHS.tablet]) {
      await page.setViewportSize({ width, height: 800 });
      for (const checked of pages) {
        if (!(await openChecked(page, checked))) {
          if (width === WIDTHS.phone) missing.push(`${profile} ${pageName(checked)}`);
          continue;
        }
        await page.waitForLoadState("networkidle");
        const overflow = await measureOverflow(page);
        if (overflow.scrollWidth > overflow.clientWidth) {
          findings.push({ profile, page: pageName(checked), width, ...overflow });
        }
      }
    }
  }

  await survey("Sem login", PUBLIC_PAGES);
  for (const profile of Object.keys(PROFILE_PAGES) as Profile[]) {
    await page.setViewportSize({ width: WIDTHS.desktop, height: 800 });
    await enterAs(page, profile);
    await survey(profile, PROFILE_PAGES[profile]);
    await signOut(page);
  }

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/responsive-survey.json", JSON.stringify({ findings, missing }, null, 2));
  for (const finding of findings) {
    console.log(`${finding.width}px ${finding.profile} ${finding.page}: ${finding.scrollWidth}px`);
    for (const culprit of finding.culprits) console.log(`    ${culprit}`);
  }
  console.log(`${findings.length} findings; pages without a detail link: ${missing.join(", ") || "none"}`);
});
