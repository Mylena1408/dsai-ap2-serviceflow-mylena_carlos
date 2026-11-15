import { expect, test, type Page } from "@playwright/test";
import { enterAs } from "./responsive-pages";
import { openAccessibility } from "./accessibility-panel-helpers";

// SPEC 2026-11-15-acessibilidade, part C (SF-270; CA-VOZ-01 to 03): the reading aloud on real pages, with the
// browser's speech replaced by a fake that records what would be said (the test machine has no voice).

type FakeOptions = { mode: "speech" | "no-speech" | "no-portuguese"; autoFinish: boolean };
type Said = { text: string; lang: string; rate: number; voice: string | null };
type SpeechLog = { said: Said[]; calls: string[] };

async function fakeSpeech(page: Page, options: FakeOptions) {
  await page.addInitScript((settings: FakeOptions) => {
    if (settings.mode === "no-speech") {
      Object.defineProperty(window, "speechSynthesis", { value: undefined });
      return;
    }
    type Utterance = { text: string; lang: string; rate: number; voice: { name: string } | null; onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null };
    const log: SpeechLog & { current: Utterance | null; finish: () => void } = {
      said: [],
      calls: [],
      current: null,
      finish() {
        const utterance = log.current;
        log.current = null;
        utterance?.onend?.();
      },
    };
    (window as unknown as { speechLog: typeof log }).speechLog = log;
    class FakeUtterance {
      lang = "";
      rate = 1;
      voice: { name: string } | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(public text: string) {}
    }
    const voices =
      settings.mode === "no-portuguese"
        ? [{ name: "Samantha", lang: "en-US", localService: true, default: true }]
        : [
            { name: "Samantha", lang: "en-US", localService: true, default: true },
            { name: "Luciana", lang: "pt-BR", localService: true, default: false },
          ];
    const synthesis = {
      speak(utterance: Utterance) {
        log.said.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate, voice: utterance.voice?.name ?? null });
        log.calls.push("speak");
        log.current = utterance;
        if (settings.autoFinish) setTimeout(() => log.finish(), 0);
      },
      cancel() {
        log.calls.push("cancel");
        const utterance = log.current;
        log.current = null;
        utterance?.onerror?.({ error: "interrupted" });
      },
      pause() {
        log.calls.push("pause");
      },
      resume() {
        log.calls.push("resume");
      },
      getVoices: () => voices,
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: synthesis });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance });
  }, options);
}

const speechLog = (page: Page) => page.evaluate(() => (window as unknown as { speechLog: SpeechLog }).speechLog);
const saidTexts = async (page: Page) => (await speechLog(page)).said.map(({ text }) => text);
const status = (page: Page) => page.locator(".speech-status");
const control = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("the page is read in order, without the menu nor what is hidden, with fields and table rows (CA-VOZ-01)", async ({ page }) => {
  test.setTimeout(120_000);
  await fakeSpeech(page, { mode: "speech", autoFinish: true });
  await page.goto("/help");
  await openAccessibility(page);
  await control(page, "Ouvir esta página").click();
  await expect(status(page)).toHaveText("Leitura concluída.");

  const said = await saidTexts(page);
  const log = await speechLog(page);
  // In Brazilian Portuguese, with the device's Portuguese voice, at the normal speed.
  expect(new Set(log.said.map(({ lang, voice, rate }) => `${lang} ${voice} ${rate}`))).toEqual(new Set(["pt-BR Luciana 1"]));
  // In the order of the page: the title, the search field with its value, then the topics and their questions.
  // The small label above the title comes first, as on the screen.
  expect(said.slice(0, 2)).toEqual(["Ajuda", "Ajuda e perguntas frequentes"]);
  const index = (text: string) => said.indexOf(text);
  expect(index("Buscar na ajuda: vazio")).toBeGreaterThan(0);
  expect(index("Primeiros passos")).toBeGreaterThan(index("Buscar na ajuda: vazio"));
  expect(index("O que é o ServiceFlow?")).toBeGreaterThan(index("Primeiros passos"));
  expect(index("Conta e acesso")).toBeGreaterThan(index("O que é o ServiceFlow?"));
  // The answers are inside closed questions (details): hidden, so not read; the buttons and the bar are not read.
  const joined = said.join(" | ");
  expect(joined).not.toContain("Ouvir esta página");
  expect(joined).not.toContain("Alto contraste");
  expect(joined).not.toMatch(/\bBuscar\b \|/);
  const answer = await page.locator("details.help-question").first().locator("p").first().textContent();
  expect(joined).not.toContain((answer ?? "").trim().slice(0, 30));
  // Nothing is longer than the pieces the voice is given.
  for (const text of said) expect(text.length).toBeLessThanOrEqual(220);

  // A table is read row by row with its column names, once it is shown; the area's menu is never read.
  await enterAs(page, "Gestor");
  await page.goto("/approvals/analytics");
  const numbers = page.locator("details.chart-table").first();
  await numbers.locator("summary").click();
  await openAccessibility(page);
  await control(page, "Ouvir esta página").click();
  await expect(status(page)).toHaveText("Leitura concluída.");
  const analytics = await saidTexts(page);
  const rows = analytics.filter((text) => /^Intervalo: .+; Abertas: \d+; Concluídas: \d+$/.test(text));
  expect(rows.length).toBeGreaterThan(0);
  expect(analytics.join(" | ")).not.toContain("Afastamentos da equipe");
});

test("the selected text is read; pause, continue and stop answer at once; the speed is kept (CA-VOZ-02)", async ({ page }) => {
  test.setTimeout(120_000);
  await fakeSpeech(page, { mode: "speech", autoFinish: false });
  await page.goto("/help");
  await openAccessibility(page);

  // Without a selection, it says so.
  await control(page, "Ouvir o trecho selecionado").click();
  await expect(status(page)).toHaveText("Selecione um trecho da página para ouvir.");

  // The selected text, as the browser gives it (with the letters as shown on the screen).
  const paragraph = page.locator("main .page-header p:not(.eyebrow)").first();
  const selected = await paragraph.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString().replace(/\s+/g, " ").trim();
  });
  expect(selected.length).toBeGreaterThan(10);
  await control(page, "Ouvir o trecho selecionado").click();
  await expect(status(page)).toHaveText("Lendo o trecho selecionado.");
  expect(await saidTexts(page)).toEqual([selected]);

  // Pause and continue.
  await control(page, "Pausar leitura").click();
  await expect(status(page)).toHaveText("Leitura pausada.");
  await expect(control(page, "Continuar leitura")).toBeVisible();
  await control(page, "Continuar leitura").click();
  await expect(status(page)).toHaveText("Leitura retomada.");
  // Stop: the voice is cancelled and nothing else is said, even when the piece ends late.
  await control(page, "Parar leitura").click();
  await expect(status(page)).toHaveText("Leitura parada.");
  await page.evaluate(() => (window as unknown as { speechLog: { finish: () => void } }).speechLog.finish());
  const afterStop = await speechLog(page);
  // A new reading first cancels anything going on; then the pause, the continue and the stop.
  expect(afterStop.calls.filter((call) => call !== "speak")).toEqual(["cancel", "pause", "resume", "cancel"]);
  expect(afterStop.said).toHaveLength(1);
  await expect(control(page, "Parar leitura")).toBeDisabled();

  // The speed: the next reading uses it, and it is kept for the next visit.
  await page.getByRole("combobox", { name: "Velocidade" }).selectOption({ label: "1,5×" });
  await control(page, "Ouvir esta página").click();
  expect((await speechLog(page)).said.at(-1)?.rate).toBe(1.5);
  const cookie = (await page.context().cookies()).find(({ name }) => name === "sf-speech-rate");
  expect(cookie?.value).toBe("1.5");
  await page.reload();
  await openAccessibility(page);
  await expect(page.getByRole("combobox", { name: "Velocidade" })).toHaveValue("1.5");

  // Changing page stops the reading (6.3 item 3).
  await control(page, "Ouvir esta página").click();
  const before = (await speechLog(page)).calls.length;
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: /Voltar/ }).click();
  await expect(page).not.toHaveURL(/\/help/);
  // A full navigation ends the page; a client one cancels the voice. Either way, nothing is said afterwards.
  const after = await speechLog(page).catch(() => null);
  if (after) expect(after.calls.slice(before)).not.toContain("speak");
});

test("without speech in the browser, or without a Portuguese voice, the panel says so and nothing breaks (CA-VOZ-03)", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await fakeSpeech(page, { mode: "no-speech", autoFinish: true });
  await page.goto("/help");
  await openAccessibility(page);
  await expect(page.getByText("Este navegador não oferece leitura em voz alta. Use o leitor de tela do seu sistema.")).toBeVisible();
  await expect(control(page, "Ouvir esta página")).toHaveCount(0);
  // The rest of the panel still works.
  await page.getByRole("button", { name: "Alto contraste" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
  expect(errors).toEqual([]);
});

test("a browser with voices but none in Portuguese points to the screen reader; a reading sends nothing out (CA-VOZ-03)", async ({ page }) => {
  test.setTimeout(120_000);
  await fakeSpeech(page, { mode: "no-portuguese", autoFinish: true });
  await page.goto("/help");
  await openAccessibility(page);
  await expect(page.getByText("Este navegador não tem uma voz em português. Use o leitor de tela do seu sistema.")).toBeVisible();

  // With a Portuguese voice, a whole reading makes no request at all: the text never leaves the device.
  const other = await page.context().newPage();
  await fakeSpeech(other, { mode: "speech", autoFinish: true });
  await other.goto("/help");
  await openAccessibility(other);
  const requests: string[] = [];
  other.on("request", (request) => requests.push(request.url()));
  await control(other, "Ouvir esta página").click();
  await expect(status(other)).toHaveText("Leitura concluída.");
  expect(requests).toEqual([]);
  await other.close();
});
