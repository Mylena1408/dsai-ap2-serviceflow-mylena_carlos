// SPEC 2026-11-15-acessibilidade, 5.1 items 1, 3 and 4 (SF-265; decision L1): the contrast choice is kept in a cookie
// of the browser, read before the first paint by a small script in the page's head, so it holds before and after the
// sign-in and without any database. Without a choice, the system's preference (prefers-contrast: more) decides.

export type ContrastChoice = "high" | "normal";

export const CONTRAST_COOKIE = "sf-contrast";

/** One year, so the choice holds on the next visits. */
export const CONTRAST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const SYSTEM_HIGH_CONTRAST_QUERY = "(prefers-contrast: more)";

/** The choice kept in a Cookie header (or document.cookie); null without one or with an unknown value. */
export function contrastChoiceOf(cookies: string | null | undefined): ContrastChoice | null {
  for (const part of (cookies ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== CONTRAST_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    return value === "high" || value === "normal" ? value : null;
  }
  return null;
}

/** The theme shown: the person's choice; without one, the system's preference (5.1 item 4). */
export function effectiveContrast(choice: ContrastChoice | null, systemPrefersMore: boolean): ContrastChoice {
  return choice ?? (systemPrefersMore ? "high" : "normal");
}

/** The cookie that keeps a choice: the whole site, a year, sent only to this site's own pages. */
export function contrastCookie(choice: ContrastChoice, secure: boolean): string {
  return `${CONTRAST_COOKIE}=${choice}; Path=/; Max-Age=${CONTRAST_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * The script run in the page's head, before anything is painted (5.3 item 4): it reads the cookie or, without a
 * choice, the system's preference, and marks the page. It repeats contrastChoiceOf and effectiveContrast in plain
 * JavaScript; the unit tests run it against both and compare.
 */
export function contrastBootScript(): string {
  return [
    "(function(){try{",
    "var c=null,p=document.cookie.split(';');",
    "for(var i=0;i<p.length;i++){var k=p[i].indexOf('=');",
    `if(k>=0&&p[i].slice(0,k).trim()==='${CONTRAST_COOKIE}'){var v=p[i].slice(k+1).trim();c=(v==='high'||v==='normal')?v:null;break;}}`,
    `if(c===null)c=window.matchMedia&&window.matchMedia('${SYSTEM_HIGH_CONTRAST_QUERY}').matches?'high':'normal';`,
    "if(c==='high')document.documentElement.setAttribute('data-contrast','high');",
    "}catch(e){}})();",
  ].join("");
}
