import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { seedDemoData } from "../../scripts/demo-data";
import { enterAs, signOut } from "./responsive-pages";

// SPEC 2026-11-16-professores-e-tecnicos (SF-294; CA-PRT-01, 05 to 11 through the screens): the administrator registers
// a classroom and makes the demonstration requester a professor; she sees her catalog subsection and guide, reserves a
// space, sees a weekly series refused with the dates, and asks for an exam; the attendant confirms the reservation and
// allocates the exam with the suggestion. At the end she is a student again and the space is switched off.

const ANA = "ana.souza@exemplo.test";
const unique = `e2e-prof-${Date.now()}`;
const extraRoom = `${unique} Sala 104`;

/** A Tuesday about five weeks ahead, as "YYYY-MM-DD" (the browser fills the date fields with it). */
function futureTuesday(): string {
  const day = new Date(Date.now() + 35 * 86_400_000);
  while (day.getUTCDay() !== 2) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

const goToSection = async (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Seções administrativas" }).getByRole("link", { name, exact: true }).click();

async function cleanup() {
  const database = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL, log: [] });
  try {
    const ana = await database.user.findUnique({ where: { email: ANA }, select: { id: true } });
    if (ana) {
      const exams = await database.examRequest.findMany({ where: { professorId: ana.id }, select: { id: true } });
      const reservations = await database.spaceReservation.findMany({ where: { requesterId: ana.id }, select: { id: true } });
      await database.requestNotification.deleteMany({
        where: { OR: [{ examRequestId: { in: exams.map(({ id }) => id) } }, { reservationId: { in: reservations.map(({ id }) => id) } }] },
      });
      await database.spaceReservation.deleteMany({ where: { requesterId: ana.id } });
      await database.examRequest.deleteMany({ where: { professorId: ana.id } });
      await database.user.update({ where: { id: ana.id }, data: { requesterKind: "STUDENT" } });
    }
    await database.space.updateMany({ where: { name: extraRoom }, data: { isActive: false } });
  } finally {
    await database.$disconnect();
  }
}

test("professors and technicians: kind, guide, spaces, a reservation, a weekly series and an exam allocated", async ({ page }) => {
  test.setTimeout(300_000);
  const database = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL, log: [] });
  try {
    await seedDemoData(database);
  } finally {
    await database.$disconnect();
  }
  const day = futureTuesday();

  try {
    // The administrator: a classroom and Ana as a professor (CA-PRT-01 and 06).
    await enterAs(page, "Administrador");
    await goToSection(page, "Espaços");
    const form = page.getByRole("form", { name: "Novo espaço" });
    await form.getByLabel("Nome").fill(extraRoom);
    await form.getByLabel("Capacidade").fill("20");
    await form.getByRole("button", { name: "Cadastrar espaço" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Espaço cadastrado." })).toBeVisible();
    await expect(page.locator(".space-entities").getByText(extraRoom, { exact: true })).toBeVisible();

    await goToSection(page, "Usuários");
    await page.locator("ul.entity-list > li").filter({ hasText: ANA }).getByRole("button", { name: "Editar", exact: true }).first().click();
    await page.locator("form.entity-editor-form").locator('select[name="requesterKind"]').selectOption("PROFESSOR");
    await page.locator("form.entity-editor-form").getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator("ul.entity-list > li").filter({ hasText: ANA })).toContainText("Solicitante · Professor");
    await signOut(page);

    // Ana, professor: her subsection and guide (CA-PRT-02 and 05).
    await enterAs(page, "Solicitante");
    await page.goto("/catalog");
    const subsection = page.getByRole("region", { name: "Serviços para professores" });
    await expect(subsection).toBeVisible();
    await subsection.getByRole("link", { name: "Guia rápido de professores e técnicos" }).click();
    await expect(page.getByRole("main").getByRole("note")).toContainText("cadastrado como professor");
    await expect(page.locator("#passo-prova")).toContainText("Para professores");

    // A reservation of "Sala 101" (CA-PRT-07 and 08).
    await page.goto("/spaces?kind=CLASSROOM");
    await page.getByRole("link", { name: "Sala 101", exact: true }).click();
    const reserve = page.getByRole("region", { name: "Reservar" });
    await reserve.getByLabel("Descrição").fill(`${unique} Cálculo I`);
    await reserve.getByLabel("Número de pessoas").fill("30");
    await reserve.getByLabel("Data", { exact: true }).fill(day);
    await reserve.getByLabel("Início").fill("08:00");
    await reserve.getByLabel("Fim").fill("10:00");
    await reserve.getByRole("button", { name: "Reservar" }).click();
    await expect(page.getByRole("main").getByRole("status")).toHaveText("Reserva enviada ao setor; ela aguarda confirmação.");
    await expect(page.getByRole("region", { name: /Semana de/ })).toContainText(`${unique} Cálculo I`);

    // A weekly series over the same time: nothing is saved, the busy date is listed (P8).
    const again = page.getByRole("region", { name: "Reservar" });
    await again.getByLabel("Descrição").fill(`${unique} Série`);
    await again.getByLabel("Data", { exact: true }).fill(day);
    await again.getByLabel("Início").fill("09:00");
    await again.getByLabel("Fim").fill("10:00");
    await again.getByLabel("Repetir toda semana até (opcional)").fill(new Date(Date.parse(day) + 14 * 86_400_000).toISOString().slice(0, 10));
    await again.getByRole("button", { name: "Reservar" }).click();
    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toContainText("Nada foi reservado");
    await expect(alert).toContainText("o espaço já está reservado nesse horário");
    await page.goto("/spaces/reservations");
    await expect(page.locator("ul.reservation-list > li")).toHaveCount(1);
    await expect(page.locator("ul.reservation-list > li").first()).toContainText("Pendente");

    // An exam for 55 students (CA-PRT-11).
    await page.goto("/spaces/exams");
    const exam = page.getByRole("region", { name: "Pedir alocação de prova" });
    await exam.getByLabel("Disciplina").fill(`${unique} Física`);
    await exam.getByLabel("Turma").fill("B");
    await exam.getByLabel("Data", { exact: true }).fill(day);
    await exam.getByLabel("Início").fill("14:00");
    await exam.getByLabel("Fim").fill("16:00");
    await exam.getByLabel("Número de alunos").fill("55");
    await exam.getByRole("button", { name: "Pedir alocação" }).click();
    await expect(page.getByRole("main").getByRole("status")).toHaveText("Pedido de alocação enviado ao setor.");
    await signOut(page);

    // The attendant confirms the reservation and allocates the exam with the suggestion (CA-PRT-10 and 11).
    await enterAs(page, "Atendente");
    await page.goto("/queue/reservations");
    const pending = page.getByRole("region", { name: "Reservas para confirmar" }).locator("li").filter({ hasText: `${unique} Cálculo I` });
    await pending.getByRole("button", { name: "Confirmar reserva" }).click();
    await expect(page.getByRole("main").getByRole("status")).toHaveText("Reserva confirmada.");
    const examItem = page.getByRole("region", { name: "Provas" }).locator("li").filter({ hasText: `${unique} Física` });
    await expect(examItem.getByRole("group", { name: /Espaços livres/ })).toContainText("sugestão:");
    await expect(examItem.getByLabel(/Sala 101/)).toBeChecked();
    await expect(examItem.getByLabel(new RegExp(extraRoom))).toBeChecked();
    await examItem.getByRole("button", { name: "Alocar prova" }).click();
    await expect(page.getByRole("main").getByRole("status")).toHaveText("Prova alocada.");
    await signOut(page);

    // Ana sees the exam allocated in the two rooms and her reservation confirmed.
    await enterAs(page, "Solicitante");
    await page.goto("/spaces/exams");
    const mine = page.locator("li").filter({ hasText: `${unique} Física` });
    await expect(mine).toContainText("Alocada");
    await expect(mine).toContainText("Sala 101");
    await expect(mine).toContainText(extraRoom);
    await page.goto("/spaces/reservations");
    await expect(page.locator("ul.reservation-list > li").filter({ hasText: `${unique} Cálculo I` })).toContainText("Confirmada");
  } finally {
    await cleanup();
  }
});
