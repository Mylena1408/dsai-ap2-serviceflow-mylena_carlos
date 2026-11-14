import { expect, test, type Page } from "@playwright/test";
import { ENTRANCE } from "./entrance";

// SPEC 2026-11-09-comunicacao-e-calendarios, part B (SF-245; CA-IMP-01 to 04 through the screens): the administrator
// downloads the model, sends a file and sees each line's outcome without anything written, applies it, downloads the
// error report (without names or e-mails), finds the import in the history and the new person inactive in "Usuários".
// Only requesters are imported, with this run's own e-mails: later tests never meet them as attendants.

const unique = `e2e-imp-${Date.now()}`;
const newName = `${unique} Ana Nova`;
const newEmail = `${unique}@exemplo.test`;

async function enterAsAdministrator(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // buttons only work after hydration
  await page.getByRole("button", { name: "Entrar como Administrador" }).click();
  await expect(page).not.toHaveURL(ENTRANCE);
}

test("user import: model, preview without writing, application, report, history and the inactive person", async ({ page }) => {
  test.setTimeout(240_000);
  await enterAsAdministrator(page);
  await page.goto("/admin?section=user-import");
  await expect(page.getByRole("heading", { name: "Importar usuários" })).toBeVisible();

  // The model (4.1 item 1).
  const model = await page.request.get("/api/user-imports/model.csv");
  expect(model.status()).toBe(200);
  expect(await model.text()).toContain("nome;email;perfil;setor");

  // A new requester, an e-mail already in use (a person of the demonstration) and an unknown role.
  const file = ["nome;email;perfil;setor", `${newName};${newEmail};solicitante;`, "Ana Repetida;ana.souza@exemplo.test;solicitante;", `${unique} Chefe;chefe-${newEmail};chefe;`].join("\n");
  await page.locator('input[name="file"]').setInputFiles({ name: "pessoas.csv", mimeType: "text/csv", buffer: Buffer.from(file, "utf-8") });
  await page.getByRole("button", { name: "Ver prévia" }).click();

  // The preview shows each line, and nothing is written yet (CA-IMP-02).
  await expect(page.getByText("1 pessoa a criar, 1 ignorada (e-mail já existe) e 1 linha com erro.")).toBeVisible();
  const lines = page.getByRole("table", { name: "Linhas do arquivo" });
  await expect(lines.getByRole("row").filter({ hasText: newEmail }).first()).toContainText("Criar");
  await expect(lines.getByRole("row").filter({ hasText: "ana.souza@exemplo.test" })).toContainText("Ignorar: e-mail já existe");
  await expect(lines.getByRole("row").filter({ hasText: "chefe" })).toContainText("Erro: perfil desconhecido");
  const before = await page.request.get(`/admin?section=users`);
  expect(await before.text()).not.toContain(newEmail);

  // Applied: the person is created inactive, and the report leaves names and e-mails out (CA-IMP-03).
  await page.getByRole("button", { name: "Aplicar a importação" }).click();
  const applied = page.getByRole("status").filter({ hasText: "Importação aplicada" });
  await expect(applied).toContainText("1 pessoa criada, 1 ignorada e 1 linha com erro.");
  await expect(applied).toContainText("estão inativas e sem senha");
  const reportHref = await applied.getByRole("link", { name: "Baixar o relatório desta importação (CSV)" }).getAttribute("href");
  const report = await page.request.get(reportHref!);
  expect(report.status()).toBe(200);
  const reportText = await report.text();
  expect(reportText).toContain("3;Ignorada;e-mail já existe;solicitante;");
  expect(reportText).toContain("4;Com erro;perfil desconhecido;chefe;");
  expect(reportText).not.toContain("ana.souza@exemplo.test");
  expect(reportText).not.toContain(unique);

  // The history lists the import with its author and counts.
  await page.reload();
  const history = page.getByRole("table", { name: "Importações anteriores" });
  const latest = history.getByRole("row").nth(1).getByRole("cell");
  // When, who, created, skipped, with error, report.
  await expect(latest.nth(1)).toHaveText("Marina Alves");
  await expect(latest.nth(2)).toHaveText("1");
  await expect(latest.nth(3)).toHaveText("1");
  await expect(latest.nth(4)).toHaveText("1");

  // In "Usuários" the person is there, inactive: the screen of today offers "Reativar" (decision K1; CA-IMP-04).
  await page.goto("/admin?section=users");
  const person = page.locator("li").filter({ hasText: newEmail });
  await expect(person).toBeVisible();
  await expect(person.getByRole("button", { name: "Reativar" })).toBeVisible();
});
