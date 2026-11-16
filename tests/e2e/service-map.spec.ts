import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { seedDemoData } from "../../scripts/demo-data";
import { enterAs } from "./responsive-pages";

// SPEC 2026-11-15-mapa-de-servicos (SF-275; CA-MAP-01 to 04 through the screens): the requester reaches the map by
// the menu and by the catalog, sees what they solve alone, what needs attendance and what needs specialized
// attendance, with the reasons, each service's way and the links between sectors. The configuration is prepared in
// the test database (the map only reads it) and switched off at the end, so the next tests see the usual catalog.

const unique = `e2e-mapa-${Date.now()}`;
const finance = `${unique} Financeiro`;
const purchase = `${unique} Compra de notebook`;
const simple = `${unique} Troca de toner`;
const badge = `${unique} Crachá`;
const bundleName = `${unique} Chegada de colaborador`;
const article = `${unique} Como trocar o toner sozinho`;

test("the requester finds the map, the three groups, the way of each service and the links between sectors", async ({ page }) => {
  test.setTimeout(180_000);
  const database = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL, log: [] });
  const created: { sectorId?: string; serviceIds: string[]; bundleId?: string } = { serviceIds: [] };
  try {
    await seedDemoData(database);
    const central = await database.sector.findFirstOrThrow({ where: { name: "Central de Serviços" } });
    const category = await database.category.findFirstOrThrow({ where: { name: "TI" } });
    const admin = await database.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
    const sector = await database.sector.create({ data: { name: finance } });
    created.sectorId = sector.id;
    const service = (name: string, sectorId: string, extra: object = {}) =>
      database.service.create({ data: { name, description: `Serviço de teste ${name}.`, categoryId: category.id, sectorId, ...extra } });
    const purchaseService = await service(purchase, central.id, { requiresApproval: true, approvalSectorIds: [sector.id], slaHours: 40 });
    const simpleService = await service(simple, central.id);
    const badgeService = await service(badge, sector.id);
    created.serviceIds.push(purchaseService.id, simpleService.id, badgeService.id);
    await database.serviceStage.createMany({
      data: [
        { serviceId: purchaseService.id, name: "Cotação", position: 1 },
        { serviceId: purchaseService.id, name: "Entrega", position: 2 },
      ],
    });
    await database.serviceDocumentRequirement.create({
      data: { serviceId: purchaseService.id, name: "Orçamento", isRequired: true, acceptedFormats: ["PDF"], position: 1 },
    });
    await database.knowledgeArticle.create({
      data: { serviceId: simpleService.id, title: article, body: "Abra a tampa e troque o cartucho.", isPublished: true, createdById: admin.id, updatedById: admin.id, createdAt: new Date(), updatedAt: new Date() },
    });
    const bundle = await database.serviceBundle.create({ data: { name: bundleName, serviceIds: [simpleService.id, badgeService.id] } });
    created.bundleId = bundle.id;
  } finally {
    await database.$disconnect();
  }

  try {
    // From the menu (CA-MAP-01).
    await enterAs(page, "Solicitante");
    await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Mapa de serviços" }).click();
    await expect(page).toHaveURL(/\/catalog\/map$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mapa de serviços");

    // The drawing, with the links also in text (CA-MAP-04).
    await expect(page.getByRole("img", { name: /Setores que atendem e como se ligam/ })).toBeVisible();
    const links = page.getByRole("list", { name: "Ligações entre os setores" });
    await expect(links).toContainText(`${finance} aprova pedidos de Central de Serviços (${purchase}).`);
    await expect(links).toContainText(`O pacote ${bundleName} junta serviços de Central de Serviços e ${finance}.`);

    // What the person solves alone: the published article and the account actions (CA-MAP-03).
    const self = page.getByRole("region", { name: "Você resolve sozinho" });
    await expect(self.getByRole("link", { name: article })).toHaveAttribute("href", /\/catalog\/[0-9a-f-]{36}$/);
    await expect(self.getByRole("link", { name: "Alterar a sua senha" })).toHaveAttribute("href", "/account/password");

    // One process: attendance; more: specialized, with the reasons and the way (CA-MAP-02 and 04).
    const attendance = page.getByRole("region", { name: "Precisa de atendimento" });
    await expect(attendance.getByRole("heading", { name: simple, level: 4 })).toBeVisible();
    await expect(attendance.getByRole("heading", { name: purchase, level: 4 })).toHaveCount(0);
    const specialized = page.getByRole("region", { name: "Atendimento especializado ou acompanhamento" });
    const card = specialized.getByRole("listitem").filter({ has: page.getByRole("heading", { name: purchase, level: 4 }) });
    await expect(card).toContainText("3 processos");
    await expect(card).toContainText(`Exige aprovação do gestor de ${finance} antes do atendimento.`);
    await expect(card).toContainText("O atendimento passa por 2 etapas: Cotação e Entrega.");
    await expect(card).toContainText("Tenha em mãos: Orçamento.");
    await expect(card.getByRole("list", { name: `Caminho de ${purchase}` }).getByRole("listitem")).toHaveText([
      "Você pede",
      `Aprovação${finance}`,
      "CotaçãoCentral de Serviços",
      "EntregaCentral de Serviços",
      "Concluída",
    ]);
    const bundleCard = specialized.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `Pacote: ${bundleName}` }) });
    await expect(bundleCard).toContainText(`Pacote com 2 serviços de 2 setores (Central de Serviços e ${finance})`);

    // The link of a service leads to its page in the catalog, to ask for it.
    await card.getByRole("link", { name: `Ver e pedir ${purchase}` }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(purchase);

    // From the catalog too (section 3 item 5).
    await page.goto("/catalog");
    await page.getByRole("navigation", { name: "Navegação do solicitante" }).getByRole("link", { name: "Mapa de serviços" }).click();
    await expect(page).toHaveURL(/\/catalog\/map$/);

    // Another profile does not open it (CA-MAP-01).
    await page.context().clearCookies();
    await enterAs(page, "Atendente");
    await page.goto("/catalog/map");
    await expect(page).not.toHaveURL(/\/catalog\/map$/);
  } finally {
    const cleanup = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL, log: [] });
    try {
      if (created.bundleId) await cleanup.serviceBundle.update({ where: { id: created.bundleId }, data: { isActive: false } });
      await cleanup.service.updateMany({ where: { id: { in: created.serviceIds } }, data: { isActive: false } });
      if (created.sectorId) await cleanup.sector.update({ where: { id: created.sectorId }, data: { isActive: false } });
    } finally {
      await cleanup.$disconnect();
    }
  }
});
