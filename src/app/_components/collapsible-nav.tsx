"use client";

import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

// SPEC 2026-11-15-acessibilidade, 4.1 item 1 (SF-261): below 760 px the navigation stays behind a "Menu" button that
// opens and closes it; above that, the CSS hides the button and the links show as before. Until the page is hydrated
// the links stay visible (data-enhanced is missing), so the menu works without JavaScript.

export type MenuEvent = "toggle" | "escape" | "link";

/** Whether the menu is open after an event: the button toggles it; Esc and following a link close it. */
export function nextMenuState(open: boolean, event: MenuEvent): boolean {
  return event === "toggle" ? !open : false;
}

function subscribeToNothing(): () => void {
  return () => {};
}

export function CollapsibleNav({
  label,
  className,
  children,
}: Readonly<{ label: string; className?: string; children: ReactNode }>) {
  const navId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // False in the server's markup and during hydration, true afterwards.
  const enhanced = useSyncExternalStore(subscribeToNothing, () => true, () => false);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    setOpen(nextMenuState(open, "escape"));
    buttonRef.current?.focus();
  }

  function onNavClick(event: MouseEvent) {
    if ((event.target as Element).closest("a")) setOpen(nextMenuState(open, "link"));
  }

  return (
    <>
      <button
        aria-controls={navId}
        aria-expanded={open}
        className="menu-toggle"
        onClick={() => setOpen(nextMenuState(open, "toggle"))}
        onKeyDown={onKeyDown}
        ref={buttonRef}
        type="button"
      >
        <span aria-hidden="true" className="menu-toggle-icon" />
        Menu
      </button>
      <nav
        aria-label={label}
        className={className}
        data-enhanced={enhanced ? "" : undefined}
        data-open={open ? "true" : "false"}
        id={navId}
        onClick={onNavClick}
        onKeyDown={onKeyDown}
      >
        {children}
      </nav>
    </>
  );
}
