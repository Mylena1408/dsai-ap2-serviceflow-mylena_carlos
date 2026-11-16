import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { enterAs, signOut } from "./responsive-pages";

// SPEC 2026-11-16-guia-do-estudante (SF-283; CA-GUI-01 to 03 through the screens): the guide without a session, for
// the student, for the general public (the demonstration requester switched in the database and back at the end) and
// for another profile; the links of the help page and of the catalog, and the way back.

const ANA = "ana.souza@exemplo.test";
const GUIDE = "Guia rápido do estudante";

const notice = (page: Page) => page.getByRole("main").getByRole("note");
const steps = (page: Page) => page.locator("ol.guide-steps > li");

async function setKind(kind: "STUDENT" | "PUBLIC") {
  const database = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL, log: [] });
  try {
    await database.user.update({ where: { email: ANA }, data: { requesterKind: kind } });
  } finally {
    await database.$disconnect();
  }
}

test("the student's guide: without a session, as a student, as general public and as another profile", async ({ page }) => {
  test.setTimeout(180_000);
  try {
    // Without a session: from the help page, the steps in order, no links to the requester's screens (CA-GUI-01 to 03).
    await page.goto("/help");
    await page.getByRole("link", { name: GUIDE }).click();
    await expect(page).toHaveURL(/\/help\/aluno$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(GUIDE);
    await expect(notice(page)).toContainText("Você ainda não entrou");
    await expect(steps(page)).toHaveCount(7);
    await expect(steps(page).first().getByRole("heading", { level: 3 })).toHaveText("Entre no ServiceFlow");
    await expect(steps(page).last().getByRole("heading", { level: 3 })).toHaveText("Avalie o atendimento");
    for (const name of ["Passo a passo", "Antes de enviar", "O que cada situação quer dizer", "Sozinho ou com atendimento"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
    await page.getByRole("link", { name: "Voltar à Ajuda" }).click();
    await expect(page).toHaveURL(/\/help$/);

    // The student: the link of the catalog's subsection, the notice and the screens as links (CA-GUI-02 and 03).
    await enterAs(page, "Solicitante");
    await page.goto("/catalog");
    await page.getByRole("region", { name: "Serviços para alunos" }).getByRole("link", { name: GUIDE }).click();
    await expect(page).toHaveURL(/\/help\/aluno$/);
    await expect(notice(page)).toContainText("cadastrado como aluno");
    await page.locator("#passo-encontrar").getByRole("link", { name: "Mapa de serviços" }).click();
    await expect(page).toHaveURL(/\/catalog\/map$/);

    // The general public: the steps hold, the catalog is another one, and its subsection has no guide link.
    await setKind("PUBLIC");
    await page.goto("/help/aluno");
    await expect(notice(page)).toContainText("cadastrado como público geral");
    await expect(page.locator("#passo-acompanhar").getByRole("link", { name: "Minhas solicitações" })).toBeVisible();
    await page.goto("/catalog");
    await expect(page.getByRole("region", { name: "Serviços para o público geral" })).toBeVisible();
    await expect(page.getByRole("link", { name: GUIDE })).toHaveCount(0);
    await signOut(page);

    // Another profile: the guide describes the requester's area, without links.
    await enterAs(page, "Atendente");
    await page.goto("/help/aluno");
    await expect(notice(page)).toContainText("descreve a área do solicitante");
    await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
  } finally {
    await setKind("STUDENT");
  }
});
