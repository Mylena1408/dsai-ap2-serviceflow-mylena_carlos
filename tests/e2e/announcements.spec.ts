import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { ENTRANCE } from "./entrance";

// SPEC 2026-11-09-comunicacao-e-calendarios, part A (SF-240; CA-AVI-01 to 04 through the screens): the administrator
// creates an information notice and a scheduled maintenance, and deletes one not started; the requester sees the
// strip, dismisses the information (the maintenance has no "Dispensar"), and opens the page "Avisos" from the menu;
// the administrator closes the notice, and the audit trail shows each change.

const unique = `e2e-avi-${Date.now()}`;
const notice = `${unique} Catálogo novo`;
const maintenance = `${unique} Atualização`;
const later = `${unique} Para depois`;

/** A date and time of the organization (São Paulo, UTC-3) some hours from now, as the field sends it. */
const local = (hours: number) => new Date(Date.now() + hours * 3_600_000 - 3 * 3_600_000).toISOString().slice(0, 16);

async function enterAs(page: Page, profile: "Administrador" | "Solicitante") {
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // buttons only work after hydration
  await page.getByRole("button", { name: `Entrar como ${profile}` }).click();
  await expect(page).not.toHaveURL(ENTRANCE);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(ENTRANCE);
}

async function createAnnouncement(
  page: Page,
  fields: { title: string; kind: "NOTICE" | "MAINTENANCE"; startsIn: number; endsIn: number; leadHours?: number },
) {
  // After a creation the same page comes back and the browser may keep the block open: open it only if closed.
  const block = page.locator("details").filter({ has: page.locator("summary", { hasText: "Novo aviso" }) });
  if (!(await block.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await block.locator("summary").click();
  }
  const form = page.getByRole("form", { name: "Novo aviso" });
  await form.locator('[name="title"]').fill(fields.title);
  await form.locator('[name="body"]').fill(`Texto de ${fields.title}.`);
  // The selects sit inside their labels: found by name.
  await form.locator('select[name="kind"]').selectOption(fields.kind);
  await form.locator('select[name="level"]').selectOption("INFO");
  await form.locator('select[name="audience"]').selectOption("ALL");
  await form.locator('[name="startsAt"]').fill(local(fields.startsIn));
  await form.locator('[name="endsAt"]').fill(local(fields.endsIn));
  if (fields.leadHours !== undefined) await form.locator('[name="leadHours"]').fill(String(fields.leadHours));
  await form.getByRole("button", { name: "Criar aviso" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Aviso criado." })).toBeVisible();
}

// The strip shows on every screen: later tests of the run never meet these announcements.
test.afterEach(async () => {
  const database = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL, log: [] });
  try {
    const mine = await database.announcement.findMany({ where: { title: { startsWith: unique } }, select: { id: true } });
    const ids = mine.map(({ id }) => id);
    await database.announcementDismissal.deleteMany({ where: { announcementId: { in: ids } } });
    await database.announcement.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await database.$disconnect();
  }
});

test("announcements: created by the administrator, shown in the strip, dismissed, listed and audited", async ({ page }) => {
  test.setTimeout(240_000);

  // Without announcements, the requester's menu has no "Avisos" (CA-AVI-01).
  await enterAs(page, "Solicitante");
  await expect(page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Avisos", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Avisos em vigor" })).toHaveCount(0);
  await signOut(page);

  // The administrator creates a notice going on, a maintenance in its lead and one for later, and deletes the
  // last one (CA-AVI-02).
  await enterAs(page, "Administrador");
  await page.goto("/admin?section=announcements");
  await createAnnouncement(page, { title: notice, kind: "NOTICE", startsIn: -1, endsIn: 24 });
  await createAnnouncement(page, { title: maintenance, kind: "MAINTENANCE", startsIn: 3, endsIn: 5, leadHours: 24 });
  await createAnnouncement(page, { title: later, kind: "NOTICE", startsIn: 48, endsIn: 72 });
  const list = page.getByRole("table", { name: "Avisos" });
  await expect(list.getByRole("row").filter({ hasText: later })).toContainText("Programado");
  await expect(page.getByRole("button", { name: `Encerrar o aviso ${later}` })).toHaveCount(0);
  await page.getByRole("button", { name: `Apagar o aviso ${later}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Aviso apagado." })).toBeVisible();
  await expect(list).not.toContainText(later);
  // A maintenance in its lead is still "Programado"; the notice is going on.
  await expect(list.getByRole("row").filter({ hasText: maintenance })).toContainText("na faixa desde");
  await expect(list.getByRole("row").filter({ hasText: notice })).toContainText("Em andamento");
  await signOut(page);

  // The requester sees both in the strip, the maintenance first and announced (CA-AVI-03 and 04).
  await enterAs(page, "Solicitante");
  const strip = page.getByRole("region", { name: "Avisos em vigor" });
  await expect(strip).toContainText(`Manutenção programada: ${maintenance}`);
  await expect(strip).toContainText(`Informação: ${notice}`);
  expect((await strip.innerText()).indexOf(maintenance)).toBeLessThan((await strip.innerText()).indexOf(notice));
  await expect(page.getByRole("button", { name: `Dispensar o aviso ${maintenance}` })).toHaveCount(0);

  // Dismissed, the notice leaves the strip and stays on the page "Avisos", reached from the menu.
  await page.getByRole("button", { name: `Dispensar o aviso ${notice}` }).click();
  await expect(strip).not.toContainText(notice);
  await expect(strip).toContainText(maintenance);
  await page.reload();
  await expect(page.getByRole("region", { name: "Avisos em vigor" })).not.toContainText(notice);
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Avisos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Avisos", level: 1 })).toBeVisible();
  await expect(page.getByRole("article", { name: notice })).toContainText("Em vigor");
  await expect(page.getByRole("article", { name: maintenance })).toContainText("Manutenção programada");
  await signOut(page);

  // The administrator closes the notice; it ends now and the audit trail shows each change.
  await enterAs(page, "Administrador");
  await page.goto("/admin?section=announcements");
  await page.getByRole("button", { name: `Encerrar o aviso ${notice}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Aviso encerrado." })).toBeVisible();
  await expect(page.getByRole("table", { name: "Avisos" }).getByRole("row").filter({ hasText: notice })).toContainText("Encerrado");
  await expect(page.getByRole("region", { name: "Avisos em vigor" })).not.toContainText(notice);
  await page.goto("/admin?section=audit");
  await expect(page.getByText(`Criou · Aviso · ${notice}`)).toBeVisible();
  await expect(page.getByText(`Alterou · Aviso · ${notice}`)).toBeVisible();
  await expect(page.getByText(`Removeu · Aviso · ${later}`)).toBeVisible();
});
