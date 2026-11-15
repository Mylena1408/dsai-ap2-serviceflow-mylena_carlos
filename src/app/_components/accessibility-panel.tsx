"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { isAccessibilityShortcut, nextPanelState, type PanelEvent } from "@/modules/accessibility";

// SPEC 2026-11-15-acessibilidade, section 7 (SF-269; decision L7): the "Acessibilidade" button at the top of every
// screen opens a panel with the high contrast and the reading aloud. It says whether it is open, closes with Esc (the
// focus goes back to the button) and with a click outside, and Alt+Shift+A opens or closes it from anywhere. A closed
// panel keeps its controls mounted, so a reading goes on after the panel closes.

const FOCUSABLE = "button:not([disabled]), select:not([disabled]), a[href], input:not([disabled])";

export function AccessibilityPanel({ children }: Readonly<{ children: ReactNode }>) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<"panel" | "button" | null>(null);

  function apply(event: PanelEvent, focus: "panel" | "button" | null) {
    setOpen((current) => {
      const next = nextPanelState(current, event);
      focusAfter.current = next ? focus : focus && "button";
      return next;
    });
  }

  // The focus moves once the panel is shown or hidden: into it when opened by the shortcut, back to the button on Esc.
  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target === "panel") panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    else if (target === "button") buttonRef.current?.focus();
  }, [open]);

  // Alt+Shift+A from anywhere on the page.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!isAccessibilityShortcut(event)) return;
      event.preventDefault();
      apply("shortcut", "panel");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // A click outside closes it, leaving the focus where the person clicked.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) apply("outside", null);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    apply("escape", "button");
  }

  return (
    <div className="accessibility-menu" onKeyDown={onKeyDown} ref={menuRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-keyshortcuts="Alt+Shift+A"
        className="accessibility-toggle"
        onClick={() => apply("toggle", null)}
        ref={buttonRef}
        type="button"
      >
        Acessibilidade
      </button>
      <div aria-label="Opções de acessibilidade" className="accessibility-panel" hidden={!open} id={panelId} ref={panelRef} role="group">
        {children}
      </div>
    </div>
  );
}
