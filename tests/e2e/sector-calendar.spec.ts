import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { ENTRANCE } from "./entrance";
import { seedDemoData } from "../../scripts/demo-data";
import { DEMO_ACCOUNTS } from "../../src/modules/auth/domain/demo-accounts";

// SPEC 2026-11-09-comunicacao-e-calendarios, section 6, part D (SF-256; CA-CAL-01 to 03 through the screens): the
// manager gives their sector its own hours and a holiday; the administrator sees them and takes the hours back; a
// request opened in business hours keeps the sector's calendar; the audit trail records every change.

const unique = `e2e-calendario-${Date.now()}`;
const serviceName = `${unique} Reparo em horas úteis`;
// 6 h, not 8: sla-pause-calendar.spec.ts looks for the only "Prazo-base: 8 h (horas úteis)" of the sector, and this
// service stays after the test.

async function enterAs(page: Page, profile: "Administrador" | "Gestor" | "Solicitante") {
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

/** No sector calendar from another run: every sector follows the organization's, as the other tests expect. */
async function clearSectorCalendars() {
  const client = database();
  try {
    await client.sectorHoliday.deleteMany();
    await client.sectorCalendar.deleteMany();
  } finally {
    await client.$disconnect();
  }
}

test.afterEach(clearSectorCalendars);

test("the manager and the administrator configure a sector's calendar, and a new request keeps it", async ({ page }) => {
  test.setTimeout(240_000);
  const setup = database();
  let sectorId = "";
  let sectorName = "";
  try {
    await seedDemoData(setup);
    // The demo manager ("Entrar como Gestor"), not the first manager of the database: other tests create managers.
    const manager = await setup.user.findUniqueOrThrow({ where: { email: DEMO_ACCOUNTS.MANAGER.email }, select: { sector: true } });
    sectorId = manager.sector!.id;
    sectorName = manager.sector!.name;
    const category = await setup.category.findFirstOrThrow({ where: { isActive: true } });
    await setup.service.create({
      data: { name: serviceName, description: "Serviço com prazo em horas úteis.", categoryId: category.id, sectorId, slaHours: 6, slaBusinessHours: true },
    });
  } finally {
    await setup.$disconnect();
  }
  await clearSectorCalendars();

  // The manager: their sector follows the organization's hours; they give it its own and a holiday (CA-CAL-02).
  await enterAs(page, "Gestor");
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Calendário" }).click();
  await expect(page).toHaveURL(/\/approvals\/calendar$/);
  const panel = page.getByRole("region", { name: "Calendário do setor" });
  await expect(panel).toContainText("Segue o expediente da organização");
  await expect(panel.getByRole("button", { name: "Voltar ao expediente da organização" })).toHaveCount(0);

  const hours = panel.getByRole("form", { name: "Expediente do setor" });
  await hours.getByRole("checkbox", { name: "Sábado" }).check();
  await hours.getByLabel("Início do expediente").fill("07:00");
  await hours.getByLabel("Fim do expediente").fill("19:00");
  await hours.getByRole("button", { name: "Salvar expediente do setor" }).click();
  await expect(page.getByRole("status")).toHaveText("Expediente do setor salvo. Vale para as solicitações abertas daqui em diante.");
  await expect(panel).toContainText("Expediente próprio:");
  await expect(panel).toContainText("Sábado; das 07:00 às 19:00");

  const holiday = panel.getByRole("form", { name: "Novo feriado do setor" });
  await holiday.getByLabel("Data").fill("2026-12-24");
  await holiday.getByLabel("Nome").fill("Véspera de Natal do setor");
  await holiday.getByRole("checkbox", { name: "Repete todo ano" }).check();
  await holiday.getByRole("button", { name: "Cadastrar feriado do setor" }).click();
  await expect(page.getByRole("status")).toHaveText("Feriado do setor cadastrado.");
  await expect(panel.getByRole("list", { name: "Feriados do setor" })).toContainText("24/12 (todo ano)");

  // The same day twice is refused with a message.
  await holiday.getByLabel("Data").fill("2026-12-24");
  await holiday.getByLabel("Nome").fill("Outro");
  await holiday.getByRole("button", { name: "Cadastrar feriado do setor" }).click();
  await expect(panel.getByRole("alert")).toHaveText("O setor já tem um feriado nessa data.");
  await signOut(page);

  // A request opened now in business hours keeps the sector's calendar (CA-CAL-03).
  await enterAs(page, "Solicitante");
  await page.goto("/catalog");
  await page.getByRole("link", { name: serviceName }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Descreva o que você precisa").fill(`${unique} tomada sem energia`);
  await page.getByRole("button", { name: "Enviar solicitação" }).click();
  await expect(page.getByRole("status")).toHaveText("Sua solicitação foi aberta.");
  const requestId = page.url().match(/[0-9a-f-]{36}/)![0];
  await signOut(page);

  // The administrator opens the sector in "Calendário", sees what the manager did and takes the hours back.
  await enterAs(page, "Administrador");
  await page.goto("/admin?section=calendar");
  const admin = page.getByRole("region", { name: "Calendário do setor" });
  await expect(admin).toContainText("Escolha um setor para ver e mudar o calendário dele.");
  await admin.getByRole("form", { name: "Escolher o setor" }).locator('[name="calendarSector"]').selectOption({ label: sectorName });
  await admin.getByRole("button", { name: "Abrir" }).click();
  await expect(admin).toContainText(`Expediente de ${sectorName}`);
  await expect(admin).toContainText("Sábado; das 07:00 às 19:00");
  await expect(admin.getByRole("list", { name: "Feriados do setor" })).toContainText("Véspera de Natal do setor");
  await admin.getByRole("button", { name: "Voltar ao expediente da organização" }).click();
  await expect(page.getByRole("status")).toHaveText("O setor voltou a seguir o expediente da organização.");
  await expect(admin).toContainText("Segue o expediente da organização");
  await admin.getByRole("button", { name: "Remover Véspera de Natal do setor" }).click();
  await expect(page.getByRole("status")).toHaveText("Feriado do setor removido.");
  await expect(admin).toContainText("Nenhum feriado próprio do setor.");

  const reader = database();
  try {
    // The request opened while the sector had its own calendar keeps it, even after it was taken back (decision K4).
    const request = await reader.request.findUniqueOrThrow({ where: { id: requestId }, select: { slaBusinessHours: true, slaCalendarSectorId: true, dueAt: true } });
    expect(request).toMatchObject({ slaBusinessHours: true, slaCalendarSectorId: sectorId });
    expect(request.dueAt).not.toBeNull();
    // Every change is in the audit trail, by the manager and by the administrator.
    const entries = await reader.auditEntry.findMany({
      where: { entityType: { in: ["SECTOR_CALENDAR", "SECTOR_HOLIDAY"] } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { entityType: true, action: true, actorRole: true },
    });
    expect(entries.map(({ entityType, action, actorRole }) => `${entityType} ${action} ${actorRole}`)).toEqual([
      "SECTOR_CALENDAR CREATED MANAGER",
      "SECTOR_HOLIDAY CREATED MANAGER",
      "SECTOR_CALENDAR DELETED ADMIN",
      "SECTOR_HOLIDAY DELETED ADMIN",
    ]);
  } finally {
    await reader.$disconnect();
  }
});
