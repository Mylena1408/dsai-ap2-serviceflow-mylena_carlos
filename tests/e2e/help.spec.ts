import { expect, test, type Page } from "@playwright/test";
import { ENTRANCE } from "./entrance";

// SPEC 2026-11-15-ajuda-faq (SF-272; CA-AJD-01 to 03 through the screens): the page "Ajuda" without a session and for
// each profile, reached by its link, with the search.

type Profile = "Administrador" | "Solicitante" | "Atendente" | "Gestor";

async function enterAs(page: Page, profile: Profile) {
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // buttons only work after hydration
  await page.getByRole("button", { name: `Entrar como ${profile}` }).click();
  await expect(page).not.toHaveURL(ENTRANCE);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(ENTRANCE);
}

const topicHeadings = (page: Page) => page.getByRole("main").getByRole("heading", { level: 2 });

test("the help page shows each profile its topics, is reached from the menus and searches", async ({ page }) => {
  test.setTimeout(180_000);

  // Without a session: from the entrance, only the general topics (CA-AJD-01 and 03).
  await page.goto("/");
  await page.getByRole("link", { name: "Ajuda e perguntas frequentes" }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ajuda e perguntas frequentes");
  await expect(topicHeadings(page)).toHaveText(["Primeiros passos", "Conta e acesso"]);
  await expect(page.getByRole("button", { name: "Sair" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Voltar à entrada" })).toHaveAttribute("href", "/");

  // The search, by the answer and ignoring accents (CA-AJD-02).
  await page.getByRole("searchbox", { name: "Buscar na ajuda" }).fill("SENHA");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/\/help\?q=SENHA$/);
  await expect(page.getByText(/perguntas? encontradas? para "SENHA"/)).toBeVisible();
  await expect(page.locator("details[open]").first()).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar na ajuda" }).fill("palavra que nao existe");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText('Nenhuma pergunta encontrada para "palavra que nao existe".')).toBeVisible();
  await page.getByRole("link", { name: "Ver todas as perguntas" }).click();
  await expect(topicHeadings(page)).toHaveCount(2);

  // Each profile, from the link of its menu, sees its own topic first and no other profile's (CA-AJD-01 and 03).
  const expected: Array<[Profile, string, string]> = [
    ["Solicitante", "Para quem pede serviços", "/catalog"],
    ["Atendente", "Para quem atende", "/queue"],
    ["Gestor", "Para quem gerencia um setor", "/approvals"],
  ];
  for (const [profile, topic, home] of expected) {
    await enterAs(page, profile);
    await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Ajuda" }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(topicHeadings(page)).toHaveText([topic, "Primeiros passos", "Conta e acesso"]);
    await expect(page.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", home);
    await signOut(page);
  }

  await enterAs(page, "Administrador");
  await page.getByRole("link", { name: "Ajuda", exact: true }).click();
  await expect(topicHeadings(page)).toHaveText(["Para quem administra", "Primeiros passos", "Conta e acesso"]);
  // An attendant's question is not found by the administrator.
  await page.goto("/help?q=duplicada");
  await expect(page.getByText('Nenhuma pergunta encontrada para "duplicada".')).toBeVisible();
});
