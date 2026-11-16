import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BEFORE_SENDING,
  ON_YOUR_OWN,
  STUDENT_GUIDE_PATH,
  STUDENT_GUIDE_STEPS,
  STUDENT_GUIDE_TITLE,
  guideLinksEnabled,
  guideNoticeFor,
  guideScreenLabels,
  guideSituations,
  type GuideViewer,
} from "@/modules/help";
import { REQUEST_STATUS_LABELS, SLA_SITUATION_LABELS } from "@/shared/requests";
import { CATALOG_SECTION_TITLES } from "@/shared/requester-kinds";
import { StudentGuideContent } from "@/app/_components/student-guide";

// SPEC 2026-11-16-guia-do-estudante (SF-282 and SF-283; CA-GUI-01, 02 and 04 by the rules).

const render = (viewer: GuideViewer) => renderToStaticMarkup(createElement(StudentGuideContent, { viewer }));
const hrefs = (html: string) => [...html.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1]);

/** Every source of the screens, except the guide itself, to find the names the guide cites. */
function sourcesOf(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return path.includes(join("modules", "help")) ? [] : sourcesOf(path);
    return /\.tsx?$/.test(name) ? [readFileSync(path, "utf-8")] : [];
  });
}

describe("the steps (section 2 item 2)", () => {
  it("go from the first access to the rating, in the order a request lives", () => {
    expect(STUDENT_GUIDE_STEPS.map(({ id }) => id)).toEqual([
      "entrar",
      "encontrar",
      "abrir",
      "acompanhar",
      "responder",
      "cancelar-reabrir",
      "avaliar",
    ]);
  });

  it("each step says what to do, where and a tip, written out", () => {
    for (const step of STUDENT_GUIDE_STEPS) {
      expect(step.title.length, step.id).toBeGreaterThan(5);
      expect(step.actions.length, step.id).toBeGreaterThanOrEqual(2);
      expect(step.screens.length, step.id).toBeGreaterThanOrEqual(1);
      expect(step.tip.length, step.id).toBeGreaterThan(40);
      for (const action of step.actions) expect(action.endsWith("."), action).toBe(true);
    }
  });

  it("the catalog step names the students' subsection as the catalog calls it", () => {
    const find = STUDENT_GUIDE_STEPS.find(({ id }) => id === "encontrar")!;
    expect(find.screens.map(({ label }) => label)).toContain(CATALOG_SECTION_TITLES.STUDENT);
  });

  it("no step names a ready-made service as if every organization had it (G1)", () => {
    const find = STUDENT_GUIDE_STEPS.find(({ id }) => id === "encontrar")!;
    expect(find.tip).toMatch(/por exemplo/);
    expect(find.tip).toMatch(/se ela os cadastrou/);
  });
});

describe("the names the guide cites (rule 1; CA-GUI-04)", () => {
  const sources = sourcesOf(join(process.cwd(), "src"));

  it.each(guideScreenLabels())("\"%s\" is written in a screen", (label) => {
    expect(sources.some((source) => source.includes(label))).toBe(true);
  });

  it("every link of the guide goes to a requester's screen or to the help", () => {
    const links = [...STUDENT_GUIDE_STEPS.flatMap(({ screens }) => screens), ...ON_YOUR_OWN].flatMap(({ href }) => (href ? [href] : []));
    for (const href of links) expect(href, href).toMatch(/^\/(catalog|requests|notifications|account|help)(\/|$)/);
  });

  it("the situations have the screens' own names (rule 2)", () => {
    const { status, deadline } = guideSituations();
    expect(status.map(({ label }) => label)).toEqual(Object.values(REQUEST_STATUS_LABELS));
    for (const { label } of deadline) expect(Object.values(SLA_SITUATION_LABELS)).toContain(label);
    expect(deadline.map(({ label }) => label)).toContain(SLA_SITUATION_LABELS.paused);
    for (const item of [...status, ...deadline]) expect(item.meaning.length, item.label).toBeGreaterThan(15);
  });
});

describe("the notice of each profile (section 2 item 6; CA-GUI-02)", () => {
  it("without a session, how to enter", () => {
    expect(guideNoticeFor({ role: null })).toMatchObject({ kind: "anonymous" });
    expect(guideNoticeFor({ role: null }).text).toMatch(/ainda não entrou/);
  });

  it("a student is told the guide is for them; with no kind read, a requester is a student (T4)", () => {
    expect(guideNoticeFor({ role: "REQUESTER", requesterKind: "STUDENT" })).toMatchObject({ kind: "student" });
    expect(guideNoticeFor({ role: "REQUESTER", requesterKind: "STUDENT" }).text).toMatch(/cadastrado como aluno/);
    expect(guideNoticeFor({ role: "REQUESTER", requesterKind: null }).kind).toBe("student");
    expect(guideNoticeFor({ role: "REQUESTER" }).kind).toBe("student");
  });

  it("the general public is told its catalog is another one", () => {
    const notice = guideNoticeFor({ role: "REQUESTER", requesterKind: "PUBLIC" });
    expect(notice.kind).toBe("public");
    expect(notice.text).toMatch(/cadastrado como público geral/);
    expect(notice.text).toMatch(/serviços para o público geral/);
  });

  it.each(["ATTENDANT", "MANAGER", "ADMIN"] as const)("%s is told the guide describes the requester's area", (role) => {
    expect(guideNoticeFor({ role })).toMatchObject({ kind: "other" });
  });

  it("only a requester gets links (G2)", () => {
    expect(guideLinksEnabled({ role: "REQUESTER", requesterKind: "PUBLIC" })).toBe(true);
    for (const role of [null, "ATTENDANT", "MANAGER", "ADMIN"] as const) expect(guideLinksEnabled({ role })).toBe(false);
  });
});

describe("the page (sections 2 and 5; CA-GUI-01)", () => {
  it("shows the notice, the numbered steps, the checklist, the situations and what is done alone, in that order", () => {
    const html = render({ role: "REQUESTER", requesterKind: "STUDENT" });
    expect(html).toContain('role="note"');
    expect(html).toContain('<ol class="guide-steps">');
    const headings = [...html.matchAll(/<h2 id="[^"]+">([^<]+)<\/h2>/g)].map((match) => match[1]);
    expect(headings).toEqual(["Passo a passo", "Antes de enviar", "O que cada situação quer dizer", "Sozinho ou com atendimento"]);
    for (const step of STUDENT_GUIDE_STEPS) expect(html).toContain(`<li id="passo-${step.id}"><h3>`);
    for (const item of BEFORE_SENDING) expect(html).toContain(item.replaceAll('"', "&quot;"));
    expect(html.indexOf("Entre no ServiceFlow")).toBeLessThan(html.indexOf("Avalie o atendimento"));
  });

  it("for a requester, the screens are links; for the others and without a session, plain names", () => {
    const requester = hrefs(render({ role: "REQUESTER", requesterKind: "STUDENT" }));
    expect(requester).toEqual(expect.arrayContaining(["/catalog", "/catalog/map", "/requests", "/notifications", "/account/data"]));
    for (const viewer of [{ role: null }, { role: "ATTENDANT" }, { role: "ADMIN" }] as GuideViewer[]) {
      const html = render(viewer);
      expect(hrefs(html), String(viewer.role)).toEqual([]);
      expect(html).toContain("<strong>Minhas solicitações</strong>");
    }
  });

  it("joins the names of a step as people write them", () => {
    const html = render({ role: null });
    expect(html).toContain(
      "Onde: <span><strong>Minhas solicitações</strong></span><span>, <strong>Notificações</strong></span><span> e <strong>Preferências de e-mail</strong></span>.",
    );
  });

  it("the guide has a fixed address and title", () => {
    expect(STUDENT_GUIDE_PATH).toBe("/help/aluno");
    expect(STUDENT_GUIDE_TITLE).toBe("Guia rápido do estudante");
  });
});
