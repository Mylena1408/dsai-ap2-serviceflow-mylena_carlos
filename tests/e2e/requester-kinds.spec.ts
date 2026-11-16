import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { seedDemoData } from "../../scripts/demo-data";
import { enterAs } from "./responsive-pages";

// SPEC 2026-11-16-tipos-de-solicitante (SF-281; CA-TIP-01 to 04 through the screens): the administrator marks the
// demonstration requester as general public and creates a service only for students; the requester sees the general
// public's subsection without that service; the attendant sees and filters who asked; the manager sees the numbers by
// kind. The demonstration requester is a student again at the end, and the services are switched off.

const unique = `e2e-tipos-${Date.now()}`;
const onlyStudents = `${unique} Declaração de matrícula`;
const forEveryone = `${unique} Informação geral`;
const ANA = "ana.souza@exemplo.test";

const goToSection = async (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Seções administrativas" }).getByRole("link", { name, exact: true }).click();
const recordOf = (page: Page, text: string) => page.locator("ul.entity-list > li").filter({ hasText: text });

test("student and general public: registration, catalog, map, queue and numbers", async ({ page }) => {
  test.setTimeout(240_000);
  const database = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL, log: [] });
  let everyoneId = "";
  try {
    await seedDemoData(database);
    const central = await database.sector.findFirstOrThrow({ where: { name: "Central de Serviços" } });
    const category = await database.category.findFirstOrThrow({ where: { name: "TI" } });
    everyoneId = (await database.service.create({
      data: { name: forEveryone, description: "Serviço para todos.", categoryId: category.id, sectorId: central.id },
    })).id;
  } finally {
    await database.$disconnect();
  }

  try {
    // The administrator: a service only for students, and Ana as general public (CA-TIP-01).
    await enterAs(page, "Administrador");
    await goToSection(page, "Serviços");
    const serviceForm = page.getByRole("region", { name: "Serviços" }).locator("form").first();
    await serviceForm.locator('[name="name"]').fill(onlyStudents);
    await serviceForm.locator('[name="description"]').fill("Só para alunos.");
    await serviceForm.locator('[name="categoryId"]').selectOption({ label: "TI" });
    await serviceForm.locator('[name="sectorId"]').selectOption({ label: "Central de Serviços" });
    await serviceForm.locator('select[name="audience"]').selectOption("STUDENTS");
    await serviceForm.getByRole("button", { name: "Criar serviço" }).click();
    await expect(serviceForm.getByRole("status")).toHaveText("Registro criado.");
    await expect(recordOf(page, onlyStudents)).toContainText("Público: Alunos");

    await goToSection(page, "Usuários");
    await recordOf(page, ANA).getByRole("button", { name: "Editar", exact: true }).first().click();
    const editor = page.locator("form.entity-editor-form");
    await editor.locator('select[name="requesterKind"]').selectOption("PUBLIC");
    await editor.getByRole("button", { name: "Salvar" }).click();
    await expect(recordOf(page, ANA)).toContainText("Solicitante · Público geral");
    await page.context().clearCookies();

    // Ana, general public: her subsection, without the students' service, not even by its address (CA-TIP-02).
    await enterAs(page, "Solicitante");
    await page.goto("/catalog");
    await expect(page.getByRole("heading", { name: "Serviços para o público geral" })).toBeVisible();
    await expect(page.getByRole("link", { name: forEveryone })).toBeVisible();
    await expect(page.getByRole("link", { name: onlyStudents })).toHaveCount(0);
    await page.goto("/catalog/map");
    await expect(page.getByText("Serviços para o público geral.", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: onlyStudents, level: 4 })).toHaveCount(0);

    // She opens the service for everyone.
    await page.goto("/catalog");
    await page.getByRole("link", { name: forEveryone }).click();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Descreva o que você precisa").fill(`${unique} pedido do público geral`);
    await page.getByRole("button", { name: "Enviar solicitação" }).click();
    await expect(page.getByRole("status")).toHaveText("Sua solicitação foi aberta.");
    await page.context().clearCookies();

    // The attendant sees who asked and filters the queue by kind (CA-TIP-03).
    await enterAs(page, "Atendente");
    await page.goto("/queue?kind=PUBLIC");
    const item = page.locator("ul.content-list > li").filter({ hasText: forEveryone });
    await expect(item).toContainText("Solicitante: Público geral");
    await expect(page.getByRole("combobox", { name: "Tipo de solicitante" })).toHaveValue("PUBLIC");
    await page.goto("/queue?kind=STUDENT");
    await expect(page.locator("ul.content-list > li").filter({ hasText: forEveryone })).toHaveCount(0);
    await page.context().clearCookies();

    // The manager sees the numbers by kind (CA-TIP-04).
    await enterAs(page, "Gestor");
    await page.goto("/approvals/dashboard");
    await expect(page.getByRole("region", { name: "Por tipo de solicitante" }).or(page.getByText("Por tipo de solicitante")).first()).toBeVisible();
    await page.goto("/approvals/analytics");
    const kinds = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Tempo médio de resolução" }) });
    await expect(kinds.getByRole("row", { name: /Público geral/ })).toBeVisible();
  } finally {
    const cleanup = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL, log: [] });
    try {
      await cleanup.user.update({ where: { email: ANA }, data: { requesterKind: "STUDENT" } });
      await cleanup.service.updateMany({ where: { name: { in: [onlyStudents, forEveryone] } }, data: { isActive: false } });
    } finally {
      await cleanup.$disconnect();
    }
  }
  expect(everyoneId).not.toBe("");
});
