import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildServiceMap, type MapService } from "@/modules/service-map";
import { ServiceMapView, drawingHeight, linkLine, linkSentence, sectorPositions } from "@/app/_components/service-map";

// SPEC 2026-11-15-mapa-de-servicos, section 3 and rule 8 (SF-274; CA-MAP-04 by the markup).

function service(overrides: Partial<MapService>): MapService {
  return {
    id: "s",
    name: "Serviço",
    description: "Descrição do serviço.",
    categoryName: "Geral",
    sectorName: "TI",
    slaHours: null,
    requiresApproval: false,
    approvalConditional: false,
    approvalSectorNames: [],
    stages: [],
    documents: [],
    articles: [],
    ...overrides,
  };
}

const map = buildServiceMap(
  [
    service({ id: "a", name: "Troca de senha", slaHours: 4, articles: [{ id: "k", title: "Troque a senha sozinho" }] }),
    service({
      id: "b",
      name: "Compra",
      sectorName: "Compras",
      requiresApproval: true,
      approvalSectorNames: ["Financeiro"],
      documents: [{ name: "Orçamento", required: true }, { name: "Foto", required: false }],
    }),
  ],
  [{ id: "p", name: "Admissão", description: null, services: [{ id: "a", name: "Troca de senha", sectorName: "TI" }, { id: "c", name: "Crachá", sectorName: "RH" }] }],
);
const html = renderToStaticMarkup(createElement(ServiceMapView, { map }));

describe("the drawing (section 3 item 2; rule 8)", () => {
  it("is an image with a name and a description, and the same links in text", () => {
    expect(html).toContain('role="img"');
    expect(html).toContain('<title id="map-drawing-title">Setores que atendem e como se ligam</title>');
    expect(html).toContain("Financeiro aprova pedidos de Compras (Compra).");
    expect(html).toContain("O pacote Admissão junta serviços de RH e TI.");
    expect(html).toContain('<ul aria-label="Ligações entre os setores" class="map-links">');
    // One box per sector, an arrow for the approval, a dashed line for the bundle.
    expect(html.match(/<g class="map-sector">/g)).toHaveLength(4);
    expect(html).toContain('class="map-link map-link-approval"');
    expect(html).toContain('class="map-link map-link-bundle"');
  });

  it("places the sectors inside the drawing, the first at the top", () => {
    const positions = sectorPositions(["A", "B", "C", "D"]);
    expect(positions.get("A")).toEqual({ x: 320, y: 23 + 10 + 0 });
    for (const { x, y } of positions.values()) {
      expect(x - 75).toBeGreaterThanOrEqual(0);
      expect(x + 75).toBeLessThanOrEqual(640);
      expect(y - 23).toBeGreaterThanOrEqual(0);
      expect(y + 23).toBeLessThanOrEqual(340);
    }
    // One or two sectors fit in a short row, without empty space around them.
    expect(drawingHeight(1)).toBe(100);
    expect(drawingHeight(3)).toBe(340);
    expect(sectorPositions(["Só"]).get("Só")).toEqual({ x: 320, y: 50 });
    expect([...sectorPositions(["A", "B"]).values()]).toEqual([{ x: 160, y: 50 }, { x: 480, y: 50 }]);
    expect(linkSentence({ from: "X", to: "Y", kind: "approval", through: ["A", "B"] })).toBe("X aprova pedidos de Y (A, B).");
  });

  it("draws each link from the edge of one box to the edge of the other, side by side when two join the same sectors", () => {
    // Boxes 150 × 46 side by side: the line leaves 75 + 4 px from each center, so the arrow's head stays visible.
    expect(linkLine({ x: 160, y: 50 }, { x: 480, y: 50 })).toEqual({ x1: 239, y1: 50, x2: 401, y2: 50 });
    expect(linkLine({ x: 160, y: 50 }, { x: 480, y: 50 }, 7)).toEqual({ x1: 239, y1: 57, x2: 401, y2: 57 });
    // One above the other: it leaves through the top and bottom edges (23 + 4 px).
    expect(linkLine({ x: 320, y: 40 }, { x: 320, y: 300 })).toEqual({ x1: 320, y1: 67, x2: 320, y2: 273 });
    const twoLinks = renderToStaticMarkup(
      createElement(ServiceMapView, {
        map: buildServiceMap(
          [service({ id: "q", name: "Compra", sectorName: "Compras", requiresApproval: true, approvalSectorNames: ["Financeiro"] })],
          [{ id: "z", name: "Kit", description: null, services: [{ id: "q", name: "Compra", sectorName: "Compras" }, { id: "w", name: "Verba", sectorName: "Financeiro" }] }],
        ),
      }),
    );
    const lines = twoLinks.match(/<line [^>]*>/g)!;
    expect(lines).toHaveLength(2);
    expect(new Set(lines.map((line) => /y1="([^"]+)"/.exec(line)![1])).size).toBe(2);
  });
});

describe("the three groups and the way of each service (section 3 items 3 and 4)", () => {
  it("lists the account actions and the articles first, linked to the service", () => {
    expect(html).toContain('<h2 id="map-self">Você resolve sozinho</h2>');
    expect(html).toContain('<a href="/account/password">Alterar a sua senha</a>');
    expect(html).toContain('<a href="/catalog/a">Troque a senha sozinho</a>');
  });

  it("puts each service in its group, with its way, documents, deadline and link", () => {
    const attendance = html.slice(html.indexOf('id="map-attendance"'), html.indexOf('id="map-specialized"'));
    const specialized = html.slice(html.indexOf('id="map-specialized"'));
    expect(attendance).toContain("<h4>Troca de senha</h4>");
    expect(attendance).toContain("Prazo-base: 4 h");
    expect(attendance).toContain("1 processo");
    expect(specialized).toContain("<h4>Compra</h4>");
    expect(specialized).toContain("2 processos");
    expect(specialized).toContain("Exige aprovação do gestor de Financeiro antes do atendimento.");
    expect(specialized).toContain('<ol aria-label="Caminho de Compra" class="map-path"><li class="map-step map-step-you">Você pede</li>');
    expect(specialized).toContain('<span class="map-step-label">Aprovação</span><span class="map-step-sector">Financeiro</span>');
    expect(specialized).toContain("Tenha em mãos: Orçamento, Foto (opcional).");
    expect(specialized).toContain('<a href="/catalog/b">Ver e pedir Compra</a>');
    expect(specialized).toContain("<h4>Pacote: Admissão</h4>");
    expect(specialized).toContain('<a href="/catalog/bundles/p">Ver e pedir o pacote Admissão</a>');
  });

  it("an empty catalog says so, and still shows the account actions", () => {
    const empty = renderToStaticMarkup(createElement(ServiceMapView, { map: buildServiceMap([], []) }));
    expect(empty).toContain("Nenhum serviço está disponível no momento.");
    expect(empty).not.toContain('role="img"');
    expect(empty).toContain('<a href="/requests">Acompanhar as suas solicitações</a>');
  });
});
