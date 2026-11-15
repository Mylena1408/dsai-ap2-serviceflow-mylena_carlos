import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableScroll } from "@/app/_components/table-scroll";
import { ArrivalHeatmap } from "@/app/_components/charts";

// SPEC 2026-11-15-acessibilidade, 4.1 item 2 (SF-262; CA-RSP-03 by the rules).

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("the table's own scroll area", () => {
  it("is a named region reachable by Tab around the table", () => {
    const html = renderToStaticMarkup(
      createElement(
        TableScroll,
        { label: "Lançamentos" } as Parameters<typeof TableScroll>[0],
        createElement("table", { className: "data-table" }),
      ),
    );
    expect(html).toBe(
      '<div aria-label="Lançamentos" class="table-scroll" role="region" tabindex="0"><table class="data-table"></table></div>',
    );
  });

  it("wraps the arrivals grid, named by its title", () => {
    const html = renderToStaticMarkup(
      createElement(ArrivalHeatmap, { grid: { total: 1, largest: 1, cells: Array.from({ length: 7 }, () => Array(24).fill(0)) } }),
    );
    expect(html).toContain('<div aria-label="Quando as solicitações chegam" class="table-scroll" role="region" tabindex="0"><table class="heatmap">');
  });

  it("every data table of the screens is inside one", () => {
    // Each `<table className="data-table">` of the source sits right below a TableScroll.
    for (const file of sourceFiles(join(process.cwd(), "src", "app"))) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (line.trim() !== '<table className="data-table">') return;
        expect(lines[index - 1]!.trim().startsWith("<TableScroll label="), `${file}:${index + 1}`).toBe(true);
      });
    }
  });
});
