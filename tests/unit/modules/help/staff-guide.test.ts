import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  STAFF_GUIDE_PATH,
  STAFF_GUIDE_STEPS,
  STAFF_GUIDE_TITLE,
  guideNoticeFor,
  staffGuideNoticeFor,
  staffGuideScreenLabels,
  type GuideViewer,
} from "@/modules/help";
import { StaffGuideContent } from "@/app/_components/staff-guide";

// SPEC 2026-11-16-professores-e-tecnicos, part B (SF-293; CA-PRT-05 by the rules).

function sourcesOf(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return path.includes(join("modules", "help")) ? [] : sourcesOf(path);
    return /\.tsx?$/.test(name) ? [readFileSync(path, "utf-8")] : [];
  });
}

const render = (viewer: GuideViewer) => renderToStaticMarkup(createElement(StaffGuideContent, { viewer }));

describe("the steps (part B item 1)", () => {
  it("go from entering to the services, the reservations and the exams, with the exam for professors", () => {
    expect(STAFF_GUIDE_STEPS.map(({ id }) => id)).toEqual(["entrar", "servicos", "reservar", "semanal", "acompanhar", "prova"]);
    expect(STAFF_GUIDE_STEPS.filter((step) => step.onlyProfessors).map(({ id }) => id)).toEqual(["prova"]);
    for (const step of STAFF_GUIDE_STEPS) {
      expect(step.actions.length, step.id).toBeGreaterThanOrEqual(2);
      expect(step.tip.length, step.id).toBeGreaterThan(40);
    }
    expect(STAFF_GUIDE_PATH).toBe("/help/servidores");
    expect(STAFF_GUIDE_TITLE).toBe("Guia rápido de professores e técnicos");
  });

  it.each(staffGuideScreenLabels())("\"%s\" is written in a screen (rule 1)", (label) => {
    const sources = sourcesOf(join(process.cwd(), "src"));
    expect(sources.some((source) => source.includes(label))).toBe(true);
  });
});

describe("the notice of each profile and kind (part B item 2)", () => {
  it("tells a professor and a technician the guide is theirs, and the others what it is", () => {
    expect(staffGuideNoticeFor({ role: "REQUESTER", requesterKind: "PROFESSOR" })).toMatchObject({ kind: "staff" });
    expect(staffGuideNoticeFor({ role: "REQUESTER", requesterKind: "PROFESSOR" }).text).toMatch(/cadastrado como professor/);
    expect(staffGuideNoticeFor({ role: "REQUESTER", requesterKind: "TECHNICIAN" }).text).toMatch(/técnico-administrativo/);
    expect(staffGuideNoticeFor({ role: "REQUESTER", requesterKind: "STUDENT" }).kind).toBe("student");
    expect(staffGuideNoticeFor({ role: null }).kind).toBe("anonymous");
    expect(staffGuideNoticeFor({ role: "MANAGER" }).kind).toBe("other");
  });

  it("the student's guide no longer calls a professor a student", () => {
    const notice = guideNoticeFor({ role: "REQUESTER", requesterKind: "PROFESSOR" });
    expect(notice.kind).toBe("staff");
    expect(notice.text).toMatch(/cadastrado como professor/);
    expect(notice.text).not.toMatch(/aluno/);
  });

  it("links the screens only for a requester, and marks the exam's step", () => {
    const requester = render({ role: "REQUESTER", requesterKind: "PROFESSOR" });
    expect(requester).toContain('href="/spaces"');
    expect(requester).toContain('href="/spaces/exams"');
    expect(requester).toContain("Para professores");
    expect(render({ role: null })).not.toContain("<a ");
  });
});
