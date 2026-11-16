import type { RequesterKind } from "@/shared/requester-kinds";
// SPEC 2026-11-15-mapa-de-servicos, sections 3 and 4 (SF-273; decisions M1 to M3): the requester's map of the
// organization's services. Pure rules: how many processes a service takes to finish, its group (attendance or
// specialized attendance), the reasons in words, the links between sectors drawn on the map and what the person
// solves alone. Only published configuration comes in (rule 1); nothing is written (rule 7).

/** A published service, as the map needs it. */
export interface MapService {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly categoryName: string;
  readonly sectorName: string;
  readonly slaHours: number | null;
  readonly requiresApproval: boolean;
  /** The approval applies only for some answers of the form (SPEC 2026-11-06-aprofundamento-configurabilidade, 4.4). */
  readonly approvalConditional: boolean;
  /** The sectors of the approval levels, in order; empty means one level, the service's own sector. */
  readonly approvalSectorNames: readonly string[];
  /** The active stages of the attendance, in order; `conditional` when it only applies for some answers. */
  readonly stages: ReadonlyArray<{ readonly name: string; readonly conditional: boolean }>;
  /** The active documents the person sends when opening. */
  readonly documents: ReadonlyArray<{ readonly name: string; readonly required: boolean }>;
  /** The published articles of the knowledge base about the service. */
  readonly articles: ReadonlyArray<{ readonly id: string; readonly title: string }>;
}

/** A bundle the catalog shows: several services opened together, one request each. */
export interface MapBundle {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly services: ReadonlyArray<{ readonly id: string; readonly name: string; readonly sectorName: string }>;
}

/** One step of a service's way, from the request to its end. */
export interface MapStep {
  readonly kind: "approval" | "attendance";
  readonly label: string;
  readonly sectorName: string;
  /** Only for some answers of the form (rule 4). */
  readonly conditional: boolean;
}

export type MapGroup = "attendance" | "specialized";

export interface MapServiceEntry {
  readonly kind: "service";
  readonly service: MapService;
  readonly steps: readonly MapStep[];
  readonly processes: number;
  readonly group: MapGroup;
  readonly reasons: readonly string[];
}

export interface MapBundleEntry {
  readonly kind: "bundle";
  readonly bundle: MapBundle;
  readonly processes: number;
  readonly group: "specialized";
  readonly reasons: readonly string[];
}

/** A link between two sectors drawn on the map. */
export interface SectorLink {
  readonly from: string;
  readonly to: string;
  readonly kind: "approval" | "bundle";
  /** The services or bundles that make the link. */
  readonly through: readonly string[];
}

export interface ServiceMap {
  /** SPEC 2026-11-16-tipos-de-solicitante: the kind whose services the map shows (absent: all, as before). */
  readonly requesterKind?: RequesterKind;
  readonly sectors: ReadonlyArray<{ readonly name: string; readonly services: number }>;
  readonly links: readonly SectorLink[];
  readonly selfService: {
    readonly articles: ReadonlyArray<{ readonly id: string; readonly title: string; readonly serviceId: string; readonly serviceName: string }>;
    readonly accountActions: typeof ACCOUNT_ACTIONS;
  };
  readonly attendance: readonly MapServiceEntry[];
  readonly specialized: ReadonlyArray<MapServiceEntry | MapBundleEntry>;
}

/** What a requester does in their own account, without opening a request (section 3 item 3.1). */
export const ACCOUNT_ACTIONS = [
  { label: "Acompanhar as suas solicitações", href: "/requests" },
  { label: "Escolher como receber os avisos", href: "/notifications/preferences" },
  { label: "Alterar a sua senha", href: "/account/password" },
  { label: "Ver os seus dados", href: "/account/data" },
  { label: "Ler a ajuda e as perguntas frequentes", href: "/help" },
] as const;

function listInWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

/**
 * The way of a service (rule 2): each approval level, then the attendance, one step per active stage or a single
 * step without stages. Each step names the sector that does it.
 */
export function stepsOf(service: MapService): MapStep[] {
  const steps: MapStep[] = [];
  if (service.requiresApproval) {
    const levels = service.approvalSectorNames.length > 0 ? service.approvalSectorNames : [service.sectorName];
    levels.forEach((sectorName, index) => {
      steps.push({
        kind: "approval",
        label: levels.length > 1 ? `Aprovação, nível ${index + 1}` : "Aprovação",
        sectorName,
        conditional: service.approvalConditional,
      });
    });
  }
  if (service.stages.length === 0) {
    steps.push({ kind: "attendance", label: "Atendimento", sectorName: service.sectorName, conditional: false });
  } else {
    for (const stage of service.stages) {
      steps.push({ kind: "attendance", label: stage.name, sectorName: service.sectorName, conditional: stage.conditional });
    }
  }
  return steps;
}

/** The reasons a service takes more than one process, in words (section 3 item 3.3; rule 4). */
export function reasonsOf(service: MapService, steps: readonly MapStep[] = stepsOf(service)): string[] {
  const reasons: string[] = [];
  const approvals = steps.filter(({ kind }) => kind === "approval");
  if (approvals.length > 0) {
    const sectors = listInWords([...new Set(approvals.map(({ sectorName }) => sectorName))]);
    const levels = approvals.length > 1 ? `aprovação em ${approvals.length} níveis (gestores de ${sectors})` : `aprovação do gestor de ${sectors}`;
    reasons.push(
      service.approvalConditional
        ? `Pode exigir ${levels} antes do atendimento, conforme o que você responder.`
        : `Exige ${levels} antes do atendimento.`,
    );
  }
  if (service.stages.length > 1) {
    reasons.push(`O atendimento passa por ${service.stages.length} etapas: ${listInWords(service.stages.map(({ name }) => name))}.`);
  }
  for (const stage of service.stages.filter(({ conditional }) => conditional)) {
    reasons.push(`A etapa "${stage.name}" pode ser incluída, conforme o que você responder.`);
  }
  return reasons;
}

/** Rule 3: one process is attendance; two or more, specialized attendance. */
export function groupOf(processes: number): MapGroup {
  return processes > 1 ? "specialized" : "attendance";
}

export function serviceEntry(service: MapService): MapServiceEntry {
  const steps = stepsOf(service);
  const processes = steps.length;
  const group = groupOf(processes);
  return { kind: "service", service, steps, processes, group, reasons: group === "specialized" ? reasonsOf(service, steps) : [] };
}

/** Rule 3: a bundle is always specialized, as each of its services is a request of its own. */
export function bundleEntry(bundle: MapBundle): MapBundleEntry {
  const sectors = [...new Set(bundle.services.map(({ sectorName }) => sectorName))];
  const services = listInWords(bundle.services.map(({ name }) => name));
  const reason =
    sectors.length > 1
      ? `Pacote com ${bundle.services.length} serviços de ${sectors.length} setores (${listInWords(sectors)}): ${services}; cada um é uma solicitação.`
      : `Pacote com ${bundle.services.length} serviços: ${services}; cada um é uma solicitação.`;
  return { kind: "bundle", bundle, processes: bundle.services.length, group: "specialized", reasons: [reason] };
}

/**
 * The links drawn between sectors (section 3 item 2): a service of one sector approved by another, and a bundle that
 * joins services of different sectors. A sector linked to itself is not drawn.
 */
export function sectorLinks(services: readonly MapService[], bundles: readonly MapBundle[]): SectorLink[] {
  const links = new Map<string, { from: string; to: string; kind: SectorLink["kind"]; through: string[] }>();
  const add = (from: string, to: string, kind: SectorLink["kind"], through: string) => {
    if (from === to) return;
    const [first, second] = kind === "bundle" ? [from, to].sort((a, b) => a.localeCompare(b, "pt-BR")) : [from, to];
    const key = `${kind}|${first}|${second}`;
    const link = links.get(key) ?? { from: first!, to: second!, kind, through: [] };
    if (!link.through.includes(through)) link.through.push(through);
    links.set(key, link);
  };
  for (const service of services) {
    if (!service.requiresApproval) continue;
    for (const sectorName of service.approvalSectorNames) add(sectorName, service.sectorName, "approval", service.name);
  }
  for (const bundle of bundles) {
    const sectors = [...new Set(bundle.services.map(({ sectorName }) => sectorName))];
    for (let i = 0; i < sectors.length; i += 1) {
      for (let j = i + 1; j < sectors.length; j += 1) add(sectors[i]!, sectors[j]!, "bundle", bundle.name);
    }
  }
  return [...links.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.from.localeCompare(b.from, "pt-BR") || a.to.localeCompare(b.to, "pt-BR"),
  );
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR");

/** The whole map (sections 3 and 4). */
export function buildServiceMap(services: readonly MapService[], bundles: readonly MapBundle[]): ServiceMap {
  const sortedServices = [...services].sort(byName);
  const entries = sortedServices.map(serviceEntry);
  const sectorCounts = new Map<string, number>();
  for (const service of sortedServices) sectorCounts.set(service.sectorName, (sectorCounts.get(service.sectorName) ?? 0) + 1);
  // A sector that only approves, or only appears in a bundle, is drawn too (with no service of its own), so every
  // link has both ends on the map.
  const linkedOnly = [
    ...sortedServices.filter(({ requiresApproval }) => requiresApproval).flatMap(({ approvalSectorNames }) => approvalSectorNames),
    ...bundles.flatMap(({ services: bundleServices }) => bundleServices.map(({ sectorName }) => sectorName)),
  ];
  for (const sectorName of linkedOnly) if (!sectorCounts.has(sectorName)) sectorCounts.set(sectorName, 0);
  return {
    sectors: [...sectorCounts].map(([name, count]) => ({ name, services: count })).sort(byName),
    links: sectorLinks(sortedServices, bundles),
    selfService: {
      articles: sortedServices.flatMap((service) =>
        service.articles.map(({ id, title }) => ({ id, title, serviceId: service.id, serviceName: service.name })),
      ),
      accountActions: ACCOUNT_ACTIONS,
    },
    attendance: entries.filter(({ group }) => group === "attendance"),
    specialized: [...entries.filter(({ group }) => group === "specialized"), ...[...bundles].sort(byName).map(bundleEntry)],
  };
}
