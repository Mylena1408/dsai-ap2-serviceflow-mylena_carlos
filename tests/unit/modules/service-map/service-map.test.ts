import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ACTIONS,
  buildServiceMap,
  bundleEntry,
  groupOf,
  sectorLinks,
  serviceEntry,
  stepsOf,
  type MapBundle,
  type MapService,
} from "@/modules/service-map";

// SPEC 2026-11-15-mapa-de-servicos, sections 3 and 4 (SF-273; CA-MAP-02 and CA-MAP-03 by the rules).

function service(overrides: Partial<MapService> = {}): MapService {
  return {
    id: overrides.name ?? "svc",
    name: "Troca de senha de rede",
    description: "Redefine a senha da rede.",
    categoryName: "Acesso",
    sectorName: "TI",
    slaHours: 8,
    requiresApproval: false,
    approvalConditional: false,
    approvalSectorNames: [],
    stages: [],
    documents: [],
    articles: [],
    ...overrides,
  };
}

describe("the processes of a service (rule 2)", () => {
  it("a service without approval nor stages is one attendance step, by its sector", () => {
    expect(stepsOf(service())).toEqual([{ kind: "attendance", label: "Atendimento", sectorName: "TI", conditional: false }]);
    const entry = serviceEntry(service());
    expect(entry.processes).toBe(1);
    expect(entry.group).toBe("attendance");
    expect(entry.reasons).toEqual([]);
  });

  it("one approval level by the service's own sector when no approval sector is set", () => {
    const steps = stepsOf(service({ requiresApproval: true }));
    expect(steps.map(({ kind, label, sectorName }) => `${kind} ${label} ${sectorName}`)).toEqual([
      "approval Aprovação TI",
      "attendance Atendimento TI",
    ]);
  });

  it("each approval level and each active stage is a process, in order", () => {
    const entry = serviceEntry(
      service({
        name: "Compra de equipamento",
        sectorName: "Compras",
        requiresApproval: true,
        approvalSectorNames: ["TI", "Financeiro"],
        stages: [
          { name: "Cotação", conditional: false },
          { name: "Pedido", conditional: false },
          { name: "Entrega", conditional: false },
        ],
      }),
    );
    expect(entry.steps.map(({ label, sectorName }) => `${label} (${sectorName})`)).toEqual([
      "Aprovação, nível 1 (TI)",
      "Aprovação, nível 2 (Financeiro)",
      "Cotação (Compras)",
      "Pedido (Compras)",
      "Entrega (Compras)",
    ]);
    expect(entry.processes).toBe(5);
    expect(entry.group).toBe("specialized");
    expect(entry.reasons).toEqual([
      "Exige aprovação em 2 níveis (gestores de TI e Financeiro) antes do atendimento.",
      "O atendimento passa por 3 etapas: Cotação, Pedido e Entrega.",
    ]);
  });

  it("a single stage is one process; documents do not count (rule 5)", () => {
    const entry = serviceEntry(
      service({ stages: [{ name: "Análise", conditional: false }], documents: [{ name: "RG", required: true }] }),
    );
    expect(entry.processes).toBe(1);
    expect(entry.group).toBe("attendance");
  });
});

describe("what may happen counts (rule 4)", () => {
  it("a conditional approval or stage counts, and the reason says it depends on the answers", () => {
    const approval = serviceEntry(service({ requiresApproval: true, approvalConditional: true }));
    expect(approval.group).toBe("specialized");
    expect(approval.steps[0]!.conditional).toBe(true);
    expect(approval.reasons).toEqual(["Pode exigir aprovação do gestor de TI antes do atendimento, conforme o que você responder."]);

    const stage = serviceEntry(
      service({ stages: [{ name: "Triagem", conditional: false }, { name: "Visita técnica", conditional: true }] }),
    );
    expect(stage.group).toBe("specialized");
    expect(stage.reasons).toEqual([
      "O atendimento passa por 2 etapas: Triagem e Visita técnica.",
      'A etapa "Visita técnica" pode ser incluída, conforme o que você responder.',
    ]);
  });
});

describe("bundles (rule 3)", () => {
  const bundle: MapBundle = {
    id: "b1",
    name: "Admissão",
    description: null,
    services: [
      { id: "s1", name: "Conta de acesso", sectorName: "TI" },
      { id: "s2", name: "Crachá", sectorName: "RH" },
      { id: "s3", name: "Notebook", sectorName: "TI" },
    ],
  };

  it("are always specialized, one process per service, saying the sectors involved", () => {
    const entry = bundleEntry(bundle);
    expect(entry.group).toBe("specialized");
    expect(entry.processes).toBe(3);
    expect(entry.reasons).toEqual([
      "Pacote com 3 serviços de 2 setores (TI e RH): Conta de acesso, Crachá e Notebook; cada um é uma solicitação.",
    ]);
    expect(bundleEntry({ ...bundle, services: bundle.services.filter(({ sectorName }) => sectorName === "TI") }).reasons).toEqual([
      "Pacote com 2 serviços: Conta de acesso e Notebook; cada um é uma solicitação.",
    ]);
  });

  it("groupOf: one process is attendance, more is specialized", () => {
    expect(groupOf(1)).toBe("attendance");
    expect(groupOf(2)).toBe("specialized");
  });
});

describe("the links between sectors (section 3 item 2)", () => {
  it("draws an approval by another sector and a bundle across sectors, never a sector to itself, without repeats", () => {
    const links = sectorLinks(
      [
        service({ name: "Compra", sectorName: "Compras", requiresApproval: true, approvalSectorNames: ["Financeiro", "Compras"] }),
        service({ name: "Viagem", sectorName: "Compras", requiresApproval: true, approvalSectorNames: ["Financeiro"] }),
        service({ name: "Sem aprovação ligada", sectorName: "TI", requiresApproval: false, approvalSectorNames: ["RH"] }),
      ],
      [
        { id: "b", name: "Admissão", description: null, services: [{ id: "1", name: "Conta", sectorName: "TI" }, { id: "2", name: "Crachá", sectorName: "RH" }] },
        { id: "c", name: "Mudança", description: null, services: [{ id: "3", name: "Rede", sectorName: "TI" }, { id: "4", name: "Ramal", sectorName: "TI" }] },
      ],
    );
    expect(links).toEqual([
      { from: "Financeiro", to: "Compras", kind: "approval", through: ["Compra", "Viagem"] },
      { from: "RH", to: "TI", kind: "bundle", through: ["Admissão"] },
    ]);
  });
});

describe("the whole map (section 3)", () => {
  it("puts each service in its group, lists the sectors, and the articles and account actions the person solves alone", () => {
    const map = buildServiceMap(
      [
        service({ id: "a", name: "Troca de senha de rede", articles: [{ id: "k1", title: "Como trocar a senha sozinho" }] }),
        service({ id: "b", name: "Compra de equipamento", sectorName: "Compras", requiresApproval: true, approvalSectorNames: ["Financeiro"] }),
      ],
      [{ id: "x", name: "Admissão", description: "Tudo para quem chega.", services: [{ id: "a", name: "Troca de senha de rede", sectorName: "TI" }, { id: "y", name: "Crachá", sectorName: "RH" }] }],
    );
    // Financeiro only approves and RH only appears in the bundle: both are drawn, so every link has its two ends.
    expect(map.sectors).toEqual([
      { name: "Compras", services: 1 },
      { name: "Financeiro", services: 0 },
      { name: "RH", services: 0 },
      { name: "TI", services: 1 },
    ]);
    for (const link of map.links) {
      expect(map.sectors.map(({ name }) => name)).toEqual(expect.arrayContaining([link.from, link.to]));
    }
    expect(map.attendance.map(({ service: { name } }) => name)).toEqual(["Troca de senha de rede"]);
    expect(map.specialized.map((entry) => (entry.kind === "service" ? entry.service.name : entry.bundle.name))).toEqual([
      "Compra de equipamento",
      "Admissão",
    ]);
    // Rule 6: a service with articles is also in its attendance group; the article is the first try.
    expect(map.selfService.articles).toEqual([
      { id: "k1", title: "Como trocar a senha sozinho", serviceId: "a", serviceName: "Troca de senha de rede" },
    ]);
    expect(map.selfService.accountActions.map(({ href }) => href)).toEqual([
      "/requests",
      "/notifications/preferences",
      "/account/password",
      "/account/data",
      "/help",
    ]);
    expect(ACCOUNT_ACTIONS).toHaveLength(5);
    expect(map.links.map(({ from, to, kind }) => `${kind}: ${from} → ${to}`)).toEqual([
      "approval: Financeiro → Compras",
      "bundle: RH → TI",
    ]);
  });

  it("an empty catalog is an empty map, with the account actions still there", () => {
    const map = buildServiceMap([], []);
    expect(map.sectors).toEqual([]);
    expect(map.attendance).toEqual([]);
    expect(map.specialized).toEqual([]);
    expect(map.selfService.accountActions).toHaveLength(5);
  });
});
