import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authorization = vi.hoisted(() => ({ requireCurrentActor: vi.fn() }));
vi.mock("@/server/authorization", () => authorization);

import {
  LATEST_REPORTS,
  REPORT_LIST_SIZE,
  getPeriodicReport,
  hasPeriodicReports,
  latestPeriodicReports,
  listPeriodicReports,
  type PeriodicReportReader,
  type PeriodicReportSummary,
} from "@/modules/periodic-reports/application/read-reports";
import { buildReportMetrics } from "@/modules/periodic-reports";
import { LatestPeriodicReports, PeriodicReportListView, PeriodicReportView, generatedAtText, reportTitle, scopeText } from "@/app/_components/periodic-reports";
import { AuthorizationError, NotFoundError } from "@/server/errors";

// SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 3 (SF-249; CA-REL-03).

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const summary = (overrides: Partial<PeriodicReportSummary> = {}): PeriodicReportSummary => ({
  id: ID,
  kind: "WEEKLY",
  firstDay: "2026-11-09",
  lastDay: "2026-11-15",
  sectorId: S1,
  sectorName: "Central",
  generatedAt: new Date("2026-11-16T09:00:00.000Z"),
  ...overrides,
});

const METRICS = buildReportMetrics({
  opened: 12,
  completed: 8,
  cancelled: 1,
  completedWithDueDate: 6,
  completedOnTime: 5,
  medianResolutionMs: 3.25 * 3_600_000,
  ratingCount: 1,
  ratingSum: 4,
  minutesLogged: 135,
  tags: [{ name: "Rede", count: 3 }],
});

function reader(found: (PeriodicReportSummary & { metrics: unknown }) | null = { ...summary(), metrics: METRICS }) {
  return {
    list: vi.fn(async () => [summary()]),
    find: vi.fn(async () => found),
    sectors: vi.fn(async () => [
      { id: S1, name: "Central" },
      { id: S2, name: "Arquivo" },
    ]),
  } satisfies PeriodicReportReader;
}

const as = (role: string, sectorId: string | null) => authorization.requireCurrentActor.mockResolvedValue({ id: "u1", role, sectorId, isActive: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listPeriodicReports (5.1 item 3)", () => {
  it("gives the administrator every report, the organization's or one sector's, by the filter", async () => {
    as("ADMIN", null);
    const source = reader();
    expect(await listPeriodicReports({}, source)).toMatchObject({ audience: "organization", scope: "all" });
    expect(source.list).toHaveBeenLastCalledWith({ sectorId: undefined }, REPORT_LIST_SIZE);
    await listPeriodicReports({ scope: "organization" }, source);
    expect(source.list).toHaveBeenLastCalledWith({ sectorId: null }, REPORT_LIST_SIZE);
    await listPeriodicReports({ scope: S2 }, source);
    expect(source.list).toHaveBeenLastCalledWith({ sectorId: S2 }, REPORT_LIST_SIZE);
    // An unknown sector shows every report.
    expect(await listPeriodicReports({ scope: "99999999-9999-4999-8999-999999999999" }, source)).toMatchObject({ scope: "all" });
  });

  it("gives a manager only their sector, ignoring a filter", async () => {
    as("MANAGER", S1);
    const source = reader();
    expect(await listPeriodicReports({ scope: S2 }, source)).toMatchObject({ audience: "sector", sectors: [] });
    expect(source.list).toHaveBeenCalledWith({ sectorId: S1 }, REPORT_LIST_SIZE);
    expect(source.sectors).not.toHaveBeenCalled();
  });

  it.each([["ATTENDANT", S1], ["REQUESTER", null], ["MANAGER", null]])("refuses %s (sector %s)", async (role, sectorId) => {
    as(role, sectorId);
    const source = reader();
    await expect(listPeriodicReports({}, source)).rejects.toThrow(AuthorizationError);
    expect(source.list).not.toHaveBeenCalled();
  });
});

describe("getPeriodicReport", () => {
  it("opens a report of the reader's scope with its numbers", async () => {
    as("MANAGER", S1);
    expect(await getPeriodicReport(ID, reader())).toMatchObject({ id: ID, metrics: { opened: 12, onTimePercentage: 83 } });
  });

  it("answers 'not found' for another sector's, the organization's to a manager, a missing one and an invalid id", async () => {
    as("MANAGER", S2);
    await expect(getPeriodicReport(ID, reader())).rejects.toThrow(NotFoundError);
    as("MANAGER", S1);
    await expect(getPeriodicReport(ID, reader({ ...summary({ sectorId: null, sectorName: null }), metrics: METRICS }))).rejects.toThrow(NotFoundError);
    await expect(getPeriodicReport(ID, reader(null))).rejects.toThrow(NotFoundError);
    const source = reader();
    await expect(getPeriodicReport("x", source)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(source.find).not.toHaveBeenCalled();
  });

  it("the administrator opens the organization's", async () => {
    as("ADMIN", null);
    expect(await getPeriodicReport(ID, reader({ ...summary({ sectorId: null, sectorName: null }), metrics: METRICS }))).toMatchObject({ sectorId: null });
  });
});

describe("hasPeriodicReports (the manager's link)", () => {
  it("is true only for a manager with a report of their sector", async () => {
    as("MANAGER", S1);
    expect(await hasPeriodicReports(reader())).toBe(true);
    expect(await hasPeriodicReports({ ...reader(), list: vi.fn(async () => []) })).toBe(false);
    as("ADMIN", null);
    expect(await hasPeriodicReports(reader())).toBe(false);
  });
});

describe("the screens", () => {
  it("name the period, the scope and the moment of the generation", () => {
    expect(reportTitle(summary())).toBe("Semana de 09/11 a 15/11/2026");
    expect(scopeText(summary({ sectorId: null, sectorName: null }))).toBe("Organização");
    expect(generatedAtText(new Date("2026-11-16T09:00:00.000Z"))).toBe("16/11/2026 06:00");
  });

  it("list the reports with a link each, and offer the scope filter only to the administrator", () => {
    const list = { audience: "organization" as const, reports: [summary()], scope: "all", sectors: [{ id: S1, name: "Central" }] };
    const html = renderToStaticMarkup(createElement(PeriodicReportListView, { list, detailHref: (id: string) => `/x/${id}`, filter: { action: "/admin", hidden: { section: "periodic-reports" } } }));
    expect(html).toContain(`<a href="/x/${ID}">Semana de 09/11 a 15/11/2026</a>`);
    expect(html).toContain("<td>Semanal</td><td>Central</td><td>16/11/2026 06:00</td>");
    expect(html).toContain('aria-label="Filtro dos relatórios"');
    const manager = renderToStaticMarkup(createElement(PeriodicReportListView, { list: { ...list, audience: "sector" as const }, detailHref: (id: string) => `/x/${id}` }));
    expect(manager).not.toContain("Filtro dos relatórios");
    expect(renderToStaticMarkup(createElement(PeriodicReportListView, { list: { ...list, reports: [] }, detailHref: (id: string) => id }))).toContain("Nenhum relatório gerado ainda.");
  });

  it("show a report's numbers, with a dash where there is no data", () => {
    const html = renderToStaticMarkup(createElement(PeriodicReportView, { report: { ...summary(), metrics: METRICS } }));
    expect(html).toContain("<th scope=\"row\">Concluídas no prazo</th><td>5 de 6 (83%)</td>");
    expect(html).toContain("<th scope=\"row\">Tempo mediano de atendimento</th><td>3,3 h</td>");
    expect(html).toContain("<th scope=\"row\">Avaliação média</th><td>4 (1 avaliação)</td>");
    expect(html).toContain("<th scope=\"row\">Horas lançadas</th><td>2h 15min</td>");
    expect(html).toContain("<td>Rede</td><td>3</td>");
    const empty = buildReportMetrics({ opened: 0, completed: 0, cancelled: 0, completedWithDueDate: 0, completedOnTime: 0, medianResolutionMs: null, ratingCount: 0, ratingSum: 0, minutesLogged: 0, tags: [] });
    const blank = renderToStaticMarkup(createElement(PeriodicReportView, { report: { ...summary(), metrics: empty } }));
    expect(blank).toContain("<th scope=\"row\">Concluídas no prazo</th><td>—</td>");
    expect(blank).toContain("<th scope=\"row\">Avaliação média</th><td>—</td>");
    expect(blank).not.toContain("Etiquetas mais usadas");
  });
});

// SPEC 2026-11-09-comunicacao-e-calendarios, 7 item 3 (SF-259; CA-COM-02 in "Análises").
describe("latestPeriodicReports (the block of \"Análises\")", () => {
  it("a manager reads their sector's latest, whatever is asked; the administrator, the sector chosen or the organization's", async () => {
    as("MANAGER", S1);
    const source = reader();
    expect(await latestPeriodicReports({ sectorId: S2 }, source)).toEqual([summary()]);
    expect(source.list).toHaveBeenLastCalledWith({ sectorId: S1 }, LATEST_REPORTS);
    as("ADMIN", null);
    await latestPeriodicReports({ sectorId: S2 }, source);
    expect(source.list).toHaveBeenLastCalledWith({ sectorId: S2 }, LATEST_REPORTS);
    await latestPeriodicReports({}, source);
    expect(source.list).toHaveBeenLastCalledWith({ sectorId: null }, LATEST_REPORTS);
  });

  it("anyone else reads none, without asking the database", async () => {
    for (const [role, sectorId] of [["ATTENDANT", S1], ["REQUESTER", null], ["MANAGER", null]] as const) {
      as(role, sectorId);
      const source = reader();
      expect(await latestPeriodicReports({ sectorId: S1 }, source)).toEqual([]);
      expect(source.list).not.toHaveBeenCalled();
    }
  });

  it("the block lists the reports with their links and the way to all of them; without reports it is not shown", () => {
    const html = renderToStaticMarkup(
      createElement(LatestPeriodicReports, { reports: [summary()], detailHref: (id: string) => `/x/${id}`, allHref: "/x" }),
    );
    expect(html).toContain('aria-labelledby="analytics-periodic-reports"');
    expect(html).toContain(`<a href="/x/${ID}">Semana de 09/11 a 15/11/2026</a>`);
    expect(html).toContain("Semanal · Central · gerado em 16/11/2026 06:00");
    expect(html).toContain('<a href="/x">Ver todos os relatórios</a>');
    expect(renderToStaticMarkup(createElement(LatestPeriodicReports, { reports: [], detailHref: (id: string) => id, allHref: "/x" }))).toBe("");
  });
});
