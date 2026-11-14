import { describe, expect, it, vi } from "vitest";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainRequest, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 4 and 5.3 item 4 (decision K3; SF-250; CA-REL-04): the notice and
// the email of a new sector report, against the real database.

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { generatePeriodicReports, latestCompletePeriod } from "@/modules/periodic-reports";
import { getEmailPreferences, listNotifications, noticeReportManagers, openNotification, runEmailDeliveries } from "@/modules/notifications";
import { buildPersonalDataExport } from "@/modules/audit/domain/personal-data";
import { createPrismaPersonalDataReader } from "@/modules/audit/infrastructure/prisma-personal-data-reader";
import { periodicReportLabel } from "@/shared/periods";
import { zonedDayOf } from "@/shared/time";

type Person = { id: string; role: "ADMIN" | "MANAGER" | "ATTENDANT" | "REQUESTER"; sectorId: string | null };
const as = (person: Person) => session.getCurrentUser.mockResolvedValue({ ...person, name: "Pessoa", isActive: true, email: `${person.id}@example.test` });

async function weeklyOn() {
  const admin = await createDomainUser({ role: "ADMIN" });
  await prisma.periodicReportSetting.create({ data: { kind: "WEEKLY", isEnabled: true, updatedAt: new Date(), updatedById: admin.id } });
  return admin;
}

async function chooseReports(userId: string) {
  await prisma.notificationPreference.create({ data: { userId, category: "REPORTS", emailEnabled: true, updatedAt: new Date() } });
}

describe("the notice of a new report (SF-250)", () => {
  it("warns only the active managers of each sector, with an email for who chose 'Relatórios' (CA-REL-04)", async () => {
    const ti = await createDomainSector();
    const rh = await createDomainSector();
    const gabi = await createDomainUser({ role: "MANAGER", sectorId: ti.id });
    const fred = await createDomainUser({ role: "MANAGER", sectorId: ti.id });
    const inactive = await createDomainUser({ role: "MANAGER", sectorId: ti.id, isActive: false });
    const ana = await createDomainUser({ role: "ATTENDANT", sectorId: ti.id });
    const rhManager = await createDomainUser({ role: "MANAGER", sectorId: rh.id });
    const admin = await weeklyOn();
    await chooseReports(gabi.id);
    await chooseReports(ana.id); // a row the attendant could not have chosen on the page: still no notice

    const summary = await generatePeriodicReports({ onWritten: noticeReportManagers }, prisma);
    expect(summary.notices).toBe(3);

    const notices = await prisma.requestNotification.findMany({ where: { type: "report.ready" }, include: { email: true, report: true } });
    expect(notices.map(({ recipientId }) => recipientId).sort()).toEqual([gabi.id, fred.id, rhManager.id].sort());
    expect(notices.every(({ requestId, eventId }) => requestId === null && eventId === null)).toBe(true);
    for (const notice of notices) {
      expect(notice.report!.sectorId).toBe(notice.recipientId === rhManager.id ? rh.id : ti.id);
      expect(notice.createdAt).toEqual(notice.report!.generatedAt);
    }
    expect(notices.filter(({ email }) => email !== null).map(({ recipientId }) => recipientId)).toEqual([gabi.id]);
    for (const nobody of [inactive.id, ana.id, admin.id]) expect(notices.some(({ recipientId }) => recipientId === nobody)).toBe(false);

    // Running again writes no report and no notice.
    expect(await generatePeriodicReports({ onWritten: noticeReportManagers }, prisma)).toMatchObject({ generated: 0, notices: 0 });
    expect(await prisma.requestNotification.count({ where: { type: "report.ready" } })).toBe(3);
  });

  it("the manager reads the notice with the period, opens it on the report, and the email has the numbers and the link", async () => {
    const ti = await createDomainSector();
    const category = await createDomainCategory();
    const service = await createDomainService({ categoryId: category.id, sectorId: ti.id });
    const rita = await createDomainUser({ role: "REQUESTER" });
    await createDomainRequest({ requesterId: rita.id, serviceId: service.id, sectorId: ti.id });
    const gabi = await createDomainUser({ role: "MANAGER", sectorId: ti.id });
    await weeklyOn();
    await chooseReports(gabi.id);
    await generatePeriodicReports({ onWritten: noticeReportManagers }, prisma);

    const week = latestCompletePeriod("WEEKLY", zonedDayOf(new Date()));
    const label = periodicReportLabel("WEEKLY", week);
    const report = await prisma.periodicReport.findFirstOrThrow({ where: { sectorId: ti.id } });

    as({ id: gabi.id, role: "MANAGER", sectorId: ti.id });
    const [notice] = await listNotifications();
    expect(notice).toMatchObject({ type: "report.ready", requestId: null, reportId: report.id, serviceName: label, readAt: null });
    expect(await getEmailPreferences()).toMatchObject({ REPORTS: true });
    expect(await openNotification(notice!.id)).toEqual({ kind: "report", id: report.id });
    expect((await prisma.requestNotification.findUniqueOrThrow({ where: { id: notice!.id } })).readAt).not.toBeNull();

    const sent: Array<{ to: string; subject: string; text: string }> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const env = { EMAIL_API_KEY: "test-key", EMAIL_FROM: "ServiceFlow <noreply@example.test>", APP_BASE_URL: "https://serviceflow.example" };
    expect(await runEmailDeliveries({}, prisma, env, fetchImpl)).toMatchObject({ sent: 1, skipped: 0 });
    expect(JSON.stringify(sent)).toContain(`Relatório disponível: ${label}`);
    expect(JSON.stringify(sent)).toContain(`https://serviceflow.example/approvals/reports/${report.id}`);
    expect(JSON.stringify(sent)).toContain("Solicitações abertas:");
    expect(JSON.stringify(sent)).not.toContain(service.name);

    // "Meus dados" names the report's notice by its period.
    const source = await createPrismaPersonalDataReader(prisma).load(gabi.id);
    expect(buildPersonalDataExport(source!, new Date()).notificacoesRecentes[0]).toMatchObject({ texto: `Relatório disponível: ${label}`, lida: true });
  });

  it("the database keeps a notice pointing to exactly one of a request or a report, and one per report and person", async () => {
    const ti = await createDomainSector();
    const category = await createDomainCategory();
    const service = await createDomainService({ categoryId: category.id, sectorId: ti.id });
    const rita = await createDomainUser({ role: "REQUESTER" });
    const request = await createDomainRequest({ requesterId: rita.id, serviceId: service.id, sectorId: ti.id });
    const gabi = await createDomainUser({ role: "MANAGER", sectorId: ti.id });
    await weeklyOn();
    await generatePeriodicReports({}, prisma);
    const report = await prisma.periodicReport.findFirstOrThrow({ where: { sectorId: ti.id } });
    const base = { recipientId: gabi.id, type: "report.ready", createdAt: new Date() };

    await expect(prisma.requestNotification.create({ data: base })).rejects.toThrow(/RequestNotification_target_check/);
    await expect(prisma.requestNotification.create({ data: { ...base, requestId: request.id, reportId: report.id } })).rejects.toThrow(
      /RequestNotification_target_check/,
    );
    await prisma.requestNotification.create({ data: { ...base, reportId: report.id } });
    await expect(prisma.requestNotification.create({ data: { ...base, reportId: report.id } })).rejects.toMatchObject({ code: "P2002" });
  });
});
