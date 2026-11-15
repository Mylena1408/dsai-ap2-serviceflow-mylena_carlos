import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CollapsibleNav, nextMenuState } from "@/app/_components/collapsible-nav";

// SPEC 2026-11-15-acessibilidade, 4.1 item 1 (SF-261; CA-RSP-02 by the rules).

describe("the state of the collapsible menu", () => {
  it("the button toggles it; Esc and following a link close it", () => {
    expect(nextMenuState(false, "toggle")).toBe(true);
    expect(nextMenuState(true, "toggle")).toBe(false);
    expect(nextMenuState(true, "escape")).toBe(false);
    expect(nextMenuState(false, "escape")).toBe(false);
    expect(nextMenuState(true, "link")).toBe(false);
  });
});

describe("the markup of the collapsible menu", () => {
  const html = renderToStaticMarkup(
    // The props type asks for children, which createElement takes as its third argument.
    createElement(
      CollapsibleNav,
      { label: "Navegação principal", className: "admin-navigation" } as Parameters<typeof CollapsibleNav>[0],
      createElement("a", { href: "/catalog" }, "Catálogo"),
    ),
  );

  it("names the button, says it is closed and points to the list it controls", () => {
    const button = /<button[^>]*>/.exec(html)![0];
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('type="button"');
    const controls = /aria-controls="([^"]+)"/.exec(button)![1];
    expect(html).toContain(`id="${controls}"`);
    expect(html).toContain('<span aria-hidden="true" class="menu-toggle-icon"></span>Menu</button>');
  });

  it("keeps the navigation's name and links, visible until the page is hydrated", () => {
    const nav = /<nav[^>]*>/.exec(html)![0];
    expect(nav).toContain('aria-label="Navegação principal"');
    expect(nav).toContain('class="admin-navigation"');
    expect(nav).toContain('data-open="false"');
    // Without data-enhanced the CSS does not hide the closed list, so the links work without JavaScript.
    expect(nav).not.toContain("data-enhanced");
    expect(html).toContain('<a href="/catalog">Catálogo</a></nav>');
  });
});
