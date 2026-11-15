"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import {
  SYSTEM_HIGH_CONTRAST_QUERY,
  contrastChoiceOf,
  contrastCookie,
  effectiveContrast,
  type ContrastChoice,
} from "@/modules/accessibility";

// SPEC 2026-11-15-acessibilidade, 5.1 items 1, 3 and 4 (SF-265): "Alto contraste" switches the theme at once, keeps
// the choice in a cookie and, without a choice, follows the system's preference, also when it changes.

function applyContrast(contrast: ContrastChoice) {
  if (contrast === "high") document.documentElement.setAttribute("data-contrast", "high");
  else document.documentElement.removeAttribute("data-contrast");
}

function systemPrefersMore(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(SYSTEM_HIGH_CONTRAST_QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-contrast"] });
  return () => observer.disconnect();
}

const isHigh = () => document.documentElement.getAttribute("data-contrast") === "high";

export function ContrastToggle() {
  const high = useSyncExternalStore(subscribe, isHigh, () => false);

  useLayoutEffect(() => {
    // The head's script already marked the page; in development React clears <html> on its second mount, so the
    // theme is applied again here, before the paint.
    applyContrast(effectiveContrast(contrastChoiceOf(document.cookie), systemPrefersMore()));
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(SYSTEM_HIGH_CONTRAST_QUERY);
    const followSystem = () => {
      if (contrastChoiceOf(document.cookie) === null) applyContrast(effectiveContrast(null, query.matches));
    };
    query.addEventListener("change", followSystem);
    return () => query.removeEventListener("change", followSystem);
  }, []);

  function toggle() {
    const next: ContrastChoice = isHigh() ? "normal" : "high";
    document.cookie = contrastCookie(next, window.location.protocol === "https:");
    applyContrast(next);
  }

  return (
    <button aria-pressed={high} className="contrast-toggle" onClick={toggle} type="button">
      Alto contraste
    </button>
  );
}
