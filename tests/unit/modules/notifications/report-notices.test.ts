import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/server/errors";
import type { EmailDeliveryState, NotificationCategory } from "@/modules/notifications/domain/email";
import type { EmailDeliveryStore, EmailMessage, NotificationPreferenceStore, PendingEmailDelivery } from "@/modules/notifications/application/ports";

const authorization = vi.hoisted(() => ({ requireCurrentActor: vi.fn() }));
vi.mock("@/server/authorization", () => authorization);
vi.mock("@/app/_components/notification-actions", () => ({ saveEmailPreferencesAction: vi.fn() }));

import { noticeReportManagers, type ReportNoticeWriter } from "@/modules/notifications/application/report-notices";
import { getEmailPreferences, updateEmailPreferences } from "@/modules/notifications/application/preference-use-cases";
import { processEmailDeliveries } from "@/modules/notifications/application/email-delivery";
import { buildReportEmail } from "@/modules/notifications/domain/email-content";
import { notificationCategory, offeredCategories, wantsEmail } from "@/modules/notifications/domain/email";
import { notificationMessage, NOTIFICATION_CATEGORY_LABELS } from "@/shared/notifications";
import { periodicReportLabel } from "@/shared/periods";
import { EmailPreferencesPage } from "@/app/_components/email-preferences";

// SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 4 and 5.3 item 4 (decision K3; SF-250; CA-REL-04): the notice and
// the email of a new sector report, only to that sector's managers, by the category "Relatórios".

const REPORT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECTOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const generatedAt = new Date("2026-11-16T09:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the type and its text", () => {
  it("'report.ready' belongs to 'Relatórios' and names the period", () => {
    expect(notificationCategory("report.ready")).toBe("REPORTS");
    expect(NOTIFICATION_CATEGORY_LABELS.REPORTS).toBe("Relatórios periódicos do setor");
    expect(notificationMessage({ type: "report.ready", serviceName: "Semana de 09/11 a 15/11/2026" })).toBe(
      "Relatório disponível: Semana de 09/11 a 15/11/2026",
    );
    expect(wantsEmail("report.ready", new Set(["APPROVALS"]))).toBe(false);
    expect(wantsEmail("report.ready", new Set(["REPORTS"]))).toBe(true);
  });

  it("the period label lives in the shared layer, for the report page and the notice", () => {
    expect(periodicReportLabel("WEEKLY", { firstDay: "2026-12-28", lastDay: "2027-01-03" })).toBe("Semana de 28/12 a 03/01/2027");
    expect(periodicReportLabel("MONTHLY", { firstDay: "2026-03-01", lastDay: "2026-03-31" })).toBe("Março de 2026");
  });
});

function writer(managerIds: string[], categories: Record<string, NotificationCategory[]> = {}) {
  return {
    sectorManagerIds: vi.fn(async () => managerIds),
    emailCategories: vi.fn(async () => new Map(Object.entries(categories).map(([id, list]) => [id, new Set(list)]))),
    insert: vi.fn<ReportNoticeWriter["insert"]>(async (notices) => notices.length),
  } satisfies ReportNoticeWriter;
}

describe("noticeReportManagers (5.1 item 4)", () => {
  it("warns each active manager of the sector, with an email only for who chose 'Relatórios' (CA-REL-04)", async () => {
    const target = writer(["gabi", "fred"], { gabi: ["REPORTS"], fred: ["APPROVALS", "SLA"] });
    expect(await noticeReportManagers({ id: REPORT, sectorId: SECTOR, generatedAt }, target)).toBe(2);
    expect(target.sectorManagerIds).toHaveBeenCalledWith(SECTOR);
    expect(target.insert).toHaveBeenCalledWith([
      { reportId: REPORT, recipientId: "gabi", createdAt: generatedAt, sendEmail: true },
      { reportId: REPORT, recipientId: "fred", createdAt: generatedAt, sendEmail: false },
    ]);
  });

  it("warns nobody for the organization's report, nor for a sector without managers", async () => {
    const organization = writer(["gabi"]);
    expect(await noticeReportManagers({ id: REPORT, sectorId: null, generatedAt }, organization)).toBe(0);
    expect(organization.sectorManagerIds).not.toHaveBeenCalled();
    expect(organization.insert).not.toHaveBeenCalled();

    const empty = writer([]);
    expect(await noticeReportManagers({ id: REPORT, sectorId: SECTOR, generatedAt }, empty)).toBe(0);
    expect(empty.emailCategories).not.toHaveBeenCalled();
    expect(empty.insert).not.toHaveBeenCalled();
  });

  it("counts only the notices that were new (a second write adds none)", async () => {
    const target = { ...writer(["gabi"]), insert: vi.fn(async () => 0) };
    expect(await noticeReportManagers({ id: REPORT, sectorId: SECTOR, generatedAt }, target)).toBe(0);
  });
});

describe("the category in the preferences (CA-REL-01 and CA-REL-04)", () => {
  it("is offered only to a manager, once a kind is on or they already chose it", () => {
    const base = ["STATUS", "ASSIGNMENT", "COMMENTS", "SLA", "STAGES", "APPROVALS"];
    expect(offeredCategories("MANAGER", { kindEnabled: false, chosen: false })).toEqual(base);
    expect(offeredCategories("MANAGER", { kindEnabled: true, chosen: false })).toEqual([...base, "REPORTS"]);
    expect(offeredCategories("MANAGER", { kindEnabled: false, chosen: true })).toEqual([...base, "REPORTS"]);
    for (const role of ["REQUESTER", "ATTENDANT", "ADMIN"]) {
      expect(offeredCategories(role, { kindEnabled: true, chosen: true })).toEqual(base);
    }
  });

  function memoryStore(kindEnabled: boolean) {
    const rows = new Map<string, Map<NotificationCategory, boolean>>();
    const store = {
      reportKindEnabled: vi.fn(async () => kindEnabled),
      async enabledCategories(userId: string) {
        return new Set([...(rows.get(userId) ?? new Map())].filter(([, on]) => on).map(([category]) => category as NotificationCategory));
      },
      async save(userId: string, choices: Partial<Record<NotificationCategory, boolean>>) {
        const current = rows.get(userId) ?? new Map<NotificationCategory, boolean>();
        for (const [category, on] of Object.entries(choices)) current.set(category as NotificationCategory, on!);
        rows.set(userId, current);
      },
    } satisfies NotificationPreferenceStore;
    return { store, rows };
  }

  const actAs = (id: string, role: string) =>
    authorization.requireCurrentActor.mockResolvedValue({ id, role, isActive: true, sectorId: SECTOR, name: id, email: `${id}@example.test` });

  it("a manager turns 'Relatórios' on while a kind is on, and still sees it to turn it off after the kind is off", async () => {
    const on = memoryStore(true);
    actAs("gabi", "MANAGER");
    expect(await getEmailPreferences(on.store)).toMatchObject({ REPORTS: false });
    await updateEmailPreferences({ categories: ["REPORTS", "APPROVALS"] }, on.store);
    expect(await getEmailPreferences(on.store)).toMatchObject({ REPORTS: true, APPROVALS: true, SLA: false });

    const off = memoryStore(false);
    off.rows.set("gabi", new Map(on.rows.get("gabi")));
    expect(await getEmailPreferences(off.store)).toMatchObject({ REPORTS: true });
    await updateEmailPreferences({ categories: ["APPROVALS"] }, off.store);
    expect(await getEmailPreferences(off.store)).not.toHaveProperty("REPORTS");
    expect(off.rows.get("gabi")?.get("REPORTS")).toBe(false);
  });

  it("without a kind on, the manager's page is as before and 'Relatórios' is refused", async () => {
    const { store, rows } = memoryStore(false);
    actAs("gabi", "MANAGER");
    expect(Object.keys(await getEmailPreferences(store))).toEqual(["STATUS", "ASSIGNMENT", "COMMENTS", "SLA", "STAGES", "APPROVALS"]);
    await expect(updateEmailPreferences({ categories: ["REPORTS"] }, store)).rejects.toBeInstanceOf(ValidationError);
    expect(rows.size).toBe(0);
  });

  it("an attendant never has it, never reads the setting, and cannot send it", async () => {
    const { store, rows } = memoryStore(true);
    actAs("ana", "ATTENDANT");
    expect(await getEmailPreferences(store)).not.toHaveProperty("REPORTS");
    expect(store.reportKindEnabled).not.toHaveBeenCalled();
    await expect(updateEmailPreferences({ categories: ["REPORTS"] }, store)).rejects.toBeInstanceOf(ValidationError);
    await updateEmailPreferences({ categories: ["SLA"] }, store);
    expect([...(rows.get("ana")?.keys() ?? [])]).not.toContain("REPORTS");
  });

  it("the page lists only the categories given, with the report's note only when 'Relatórios' is there", () => {
    const base = { STATUS: false, ASSIGNMENT: false, COMMENTS: false, SLA: false, STAGES: false, APPROVALS: false };
    const without = renderToStaticMarkup(createElement(EmailPreferencesPage, { preferences: base, notificationsHref: "/approvals/notifications" }));
    expect(without).not.toContain('value="REPORTS"');
    expect(without).not.toContain("números principais");
    const withReports = renderToStaticMarkup(
      createElement(EmailPreferencesPage, { preferences: { ...base, REPORTS: true }, notificationsHref: "/approvals/notifications" }),
    );
    expect(withReports).toContain('<input type="checkbox" name="category" checked="" value="REPORTS"/>Relatórios periódicos do setor');
    expect(withReports).toContain("números principais");
  });
});

describe("the report's email (5.3 item 4)", () => {
  const numbers = { id: REPORT, opened: 12, completed: 8, cancelled: 1, onTimePercentage: 83 };

  it("has the period, the main numbers and the link to the manager's report page", () => {
    const email = buildReportEmail({ period: "Outubro de 2026", report: numbers }, "https://serviceflow.example/");
    expect(email.subject).toBe("[ServiceFlow] Relatório disponível: Outubro de 2026");
    expect(email.text.split("\n")).toEqual([
      "Relatório disponível: Outubro de 2026",
      "",
      "Solicitações abertas: 12",
      "Concluídas: 8",
      "Canceladas: 1",
      "Concluídas no prazo: 83%",
      "",
      `Abrir o relatório: https://serviceflow.example/approvals/reports/${REPORT}`,
      "",
      "Para escolher o que você recebe por e-mail: https://serviceflow.example/approvals/notifications/preferences",
    ]);
    expect(buildReportEmail({ period: "Outubro de 2026", report: { ...numbers, onTimePercentage: null } }, "https://x").text).toContain(
      "Concluídas no prazo: —",
    );
  });

  const now = new Date("2026-11-16T10:00:00.000Z");

  function pending(id: string, recipient: PendingEmailDelivery["recipient"]): PendingEmailDelivery {
    return {
      id,
      status: "PENDING",
      attempts: 0,
      availableAt: now,
      sentAt: null,
      lastErrorCode: null,
      recipient,
      notification: { type: "report.ready", requestId: null, serviceName: "Semana de 09/11 a 15/11/2026", report: { ...numbers, sectorId: SECTOR } },
    };
  }

  it("goes only to who still reads the report when it is sent: a manager of that sector", async () => {
    const deliveries = [
      pending("gabi", { email: "gabi@example.test", isActive: true, role: "MANAGER", sectorId: SECTOR }),
      pending("moved", { email: "moved@example.test", isActive: true, role: "MANAGER", sectorId: OTHER }),
      pending("demoted", { email: "demoted@example.test", isActive: true, role: "ATTENDANT", sectorId: SECTOR }),
    ];
    const saved = new Map<string, EmailDeliveryState>();
    const store: EmailDeliveryStore = {
      claimPending: async () => ({ deliveries, now }),
      save: async (id, state) => void saved.set(id, state),
    };
    const sent: EmailMessage[] = [];
    const summary = await processEmailDeliveries(store, { transport: { send: async (message) => void sent.push(message) }, baseUrl: "https://x" });
    expect(summary).toEqual({ sent: 1, retried: 0, failed: 0, skipped: 2 });
    expect(sent.map(({ to }) => to)).toEqual(["gabi@example.test"]);
    expect(sent[0]!.text).toContain(`https://x/approvals/reports/${REPORT}`);
    expect(saved.get("moved")).toMatchObject({ status: "SKIPPED", lastErrorCode: "report_not_readable" });
    expect(saved.get("demoted")).toMatchObject({ status: "SKIPPED", lastErrorCode: "report_not_readable" });
  });
});
