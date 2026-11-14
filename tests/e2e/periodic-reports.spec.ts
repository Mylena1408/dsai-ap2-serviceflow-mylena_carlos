import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { ENTRANCE } from "./entrance";
import { seedDemoData } from "../../scripts/demo-data";

// SPEC 2026-11-09-comunicacao-e-calendarios, section 5, part C (SF-251; CA-REL-01 to 04 through the screens): with the
// reports off, the manager sees nothing new; the administrator turns the weekly report on; the manager chooses the
// email of "Relatórios"; the protected daily job route generates the reports and warns the manager, who opens the
// report from the notice; the administrator reads every report and turns the weekly one off, keeping them.

const WEEK_NOTICE = /Relatório disponível: Semana de \d{2}\/\d{2} a \d{2}\/\d{2}\/\d{4}/;

async function enterAs(page: Page, profile: "Administrador" | "Gestor") {
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // buttons only work after hydration
  await page.getByRole("button", { name: `Entrar como ${profile}` }).click();
  await expect(page).not.toHaveURL(ENTRANCE);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(ENTRANCE);
}

function database() {
  return new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL, log: [] });
}

/** No report, notice of a report or setting from another run: the test starts with the reports off. */
async function clearReports() {
  const client = database();
  try {
    await client.emailDelivery.deleteMany({ where: { notification: { reportId: { not: null } } } });
    await client.requestNotification.deleteMany({ where: { reportId: { not: null } } });
    await client.periodicReport.deleteMany();
    await client.periodicReportSetting.deleteMany();
    await client.notificationPreference.deleteMany({ where: { category: "REPORTS" } });
  } finally {
    await client.$disconnect();
  }
}

// Later tests that call the daily job find the reports off, even when this one stops halfway.
test.afterEach(clearReports);

test("the administrator turns the weekly report on, the job generates it and the manager opens it from the notice", async ({ page, playwright }) => {
  test.setTimeout(240_000);
  const seed = database();
  try {
    await seedDemoData(seed);
  } finally {
    await seed.$disconnect();
  }
  await clearReports();

  // Off: the manager's screens are as before (CA-REL-01).
  await enterAs(page, "Gestor");
  await expect(page.getByRole("link", { name: "Relatórios", exact: true })).toHaveCount(0);
  await page.goto("/approvals/notifications/preferences");
  await expect(page.getByRole("group", { name: "Receber por e-mail" }).getByRole("checkbox")).toHaveCount(6);
  await signOut(page);

  // The administrator turns the weekly report on (5.3 item 3).
  await enterAs(page, "Administrador");
  await page.goto("/admin?section=periodic-reports");
  const section = page.getByRole("region", { name: "Relatórios" });
  await expect(section).toContainText("Relatório semanal: desligado.");
  await expect(section).toContainText("Relatório mensal: desligado.");
  await expect(section).toContainText("Nenhum relatório gerado ainda.");
  await section.getByRole("button", { name: "Ligar relatório semanal" }).click();
  await expect(page.getByRole("status")).toHaveText("Relatório ligado. O próximo sai na próxima execução do job diário.");
  await expect(section).toContainText("Relatório semanal: ligado.");
  await signOut(page);

  // The manager now has "Relatórios" in the preferences and chooses the email (CA-REL-04).
  await enterAs(page, "Gestor");
  await page.goto("/approvals/notifications/preferences");
  await page.getByRole("checkbox", { name: "Relatórios periódicos do setor" }).check();
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(page.getByRole("status")).toHaveText("Preferências salvas.");
  await expect(page.getByRole("checkbox", { name: "Relatórios periódicos do setor" })).toBeChecked();
  await signOut(page);

  // The daily job runs as Vercel Cron calls it (CA-REL-02); a second call writes nothing more.
  const api = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3100" });
  const run = await api.get("/api/cron/daily", { headers: { authorization: `Bearer ${process.env.E2E_CRON_SECRET}` } });
  expect(run.status()).toBe(200);
  const first = (await run.json()).periodicReports;
  expect(first.status).toBe("ok");
  expect(first.result.generated).toBeGreaterThan(1);
  expect(first.result.notices).toBeGreaterThan(0);
  const again = await api.get("/api/cron/daily", { headers: { authorization: `Bearer ${process.env.E2E_CRON_SECRET}` } });
  expect((await again.json()).periodicReports.result).toMatchObject({ generated: 0, notices: 0 });
  await api.dispose();

  // The manager opens the report from the notice (CA-REL-03 and 04).
  await enterAs(page, "Gestor");
  await page.goto("/approvals/notifications");
  const notice = page.getByRole("link", { name: WEEK_NOTICE });
  await expect(notice).toHaveCount(1);
  await notice.click();
  await expect(page).toHaveURL(/\/approvals\/reports\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("table", { name: "Números do período" })).toContainText("Solicitações abertas");
  await expect(page.getByRole("link", { name: "Relatórios", exact: true })).toHaveCount(1);
  await page.goto("/approvals/reports");
  // Only their sector's report: one row, never the organization's.
  await expect(page.getByRole("table", { name: "Relatórios" }).locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("table", { name: "Relatórios" })).not.toContainText("Organização");
  await signOut(page);

  // The email waits for the manager who chose it, and for nobody else (CA-REL-04).
  const reader = database();
  try {
    const deliveries = await reader.emailDelivery.findMany({ where: { notification: { type: "report.ready" } }, select: { recipient: { select: { role: true } } } });
    expect(deliveries.map(({ recipient }) => recipient.role)).toEqual(["MANAGER"]);
  } finally {
    await reader.$disconnect();
  }

  // The administrator reads every report, turns the weekly one off and keeps them (5.3 item 3).
  await enterAs(page, "Administrador");
  await page.goto("/admin?section=periodic-reports");
  const table = section.getByRole("table", { name: "Relatórios" });
  await expect(table).toContainText("Organização");
  const rows = await table.locator("tbody tr").count();
  expect(rows).toBe(first.result.generated);
  await section.getByRole("button", { name: "Desligar relatório semanal" }).click();
  await expect(page.getByRole("status")).toHaveText("Relatório desligado. Os já gerados continuam na lista.");
  await expect(section.getByRole("table", { name: "Relatórios" }).locator("tbody tr")).toHaveCount(rows);
});
