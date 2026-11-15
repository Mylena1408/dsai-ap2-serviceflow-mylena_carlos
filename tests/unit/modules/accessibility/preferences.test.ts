import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CONTRAST_COOKIE,
  CONTRAST_COOKIE_MAX_AGE,
  contrastBootScript,
  contrastChoiceOf,
  contrastCookie,
  effectiveContrast,
  type ContrastChoice,
} from "@/modules/accessibility";
import { ContrastToggle } from "@/app/_components/contrast-toggle";

// SPEC 2026-11-15-acessibilidade, 5.1 items 1, 3 and 4 and 5.3 item 4 (SF-265; CA-CON-01 and CA-CON-03 by the rules).

describe("the kept choice (5.1 item 3; decision L1)", () => {
  it("is read from the cookies, among others, and only with a known value", () => {
    expect(contrastChoiceOf(`${CONTRAST_COOKIE}=high`)).toBe("high");
    expect(contrastChoiceOf(`authjs.session-token=abc; ${CONTRAST_COOKIE}=normal; other=1`)).toBe("normal");
    expect(contrastChoiceOf(`${CONTRAST_COOKIE}=dark`)).toBeNull();
    expect(contrastChoiceOf(`x${CONTRAST_COOKIE}=high`)).toBeNull();
    expect(contrastChoiceOf("")).toBeNull();
    expect(contrastChoiceOf(undefined)).toBeNull();
  });

  it("is kept for a year on the whole site, secure on https", () => {
    expect(CONTRAST_COOKIE_MAX_AGE).toBe(31_536_000);
    expect(contrastCookie("high", false)).toBe(`${CONTRAST_COOKIE}=high; Path=/; Max-Age=31536000; SameSite=Lax`);
    expect(contrastCookie("normal", true)).toBe(`${CONTRAST_COOKIE}=normal; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
  });
});

describe("the theme shown (5.1 item 4)", () => {
  it("is the person's choice; without one, the system's preference", () => {
    expect(effectiveContrast("high", false)).toBe("high");
    expect(effectiveContrast("normal", true)).toBe("normal");
    expect(effectiveContrast(null, true)).toBe("high");
    expect(effectiveContrast(null, false)).toBe("normal");
  });
});

/** Runs the head's script against a cookie and a system preference; returns the page's data-contrast. */
function runBootScript(cookie: string, systemPrefersMore: boolean | "no-matchMedia"): string | null {
  const attributes = new Map<string, string>();
  const document = {
    cookie,
    documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
  };
  const window =
    systemPrefersMore === "no-matchMedia"
      ? {}
      : { matchMedia: (query: string) => ({ matches: query === "(prefers-contrast: more)" && systemPrefersMore }) };
  new Function("document", "window", contrastBootScript())(document, window);
  return attributes.get("data-contrast") ?? null;
}

describe("the script in the page's head (5.3 item 4)", () => {
  const cookies = ["", `${CONTRAST_COOKIE}=high`, `${CONTRAST_COOKIE}=normal`, `a=1; ${CONTRAST_COOKIE}=high; b=2`, `${CONTRAST_COOKIE}=dark`];

  it.each(cookies.flatMap((cookie) => [true, false].map((system) => [cookie, system] as const)))(
    "with cookie %j and system preference %s, marks the page as the rules say",
    (cookie, system) => {
      const expected: ContrastChoice = effectiveContrast(contrastChoiceOf(cookie), system);
      expect(runBootScript(cookie, system)).toBe(expected === "high" ? "high" : null);
    },
  );

  it("never breaks the page: without matchMedia it keeps the normal theme, and errors are swallowed", () => {
    expect(runBootScript("", "no-matchMedia")).toBeNull();
    expect(runBootScript(`${CONTRAST_COOKIE}=high`, "no-matchMedia")).toBe("high");
    expect(() => new Function("document", "window", contrastBootScript())(null, null)).not.toThrow();
  });

  it("is short and holds nothing but the cookie's name and the media query", () => {
    const script = contrastBootScript();
    expect(script.length).toBeLessThan(600);
    expect(script).toContain(`'${CONTRAST_COOKIE}'`);
    expect(script).toContain("'(prefers-contrast: more)'");
    expect(script).not.toMatch(/fetch|XMLHttpRequest|localStorage|eval/);
  });
});

describe("the button (5.1 item 1)", () => {
  it("is a toggle button named \"Alto contraste\", off in the server's markup", () => {
    expect(renderToStaticMarkup(createElement(ContrastToggle))).toBe(
      '<button aria-pressed="false" class="contrast-toggle" type="button">Alto contraste</button>',
    );
  });
});
