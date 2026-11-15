import type { ReactNode } from "react";

// SPEC 2026-11-15-acessibilidade, 4.1 item 2 (SF-262): a data table scrolls sideways inside its own area, so a wide
// table never pushes the page. The area is a named region reachable by Tab (WCAG 2.1.1), so a keyboard user can
// scroll it with the arrow keys; its name is the table's caption or the heading it sits under.
export function TableScroll({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div aria-label={label} className="table-scroll" role="region" tabIndex={0}>
      {children}
    </div>
  );
}
