import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPEECH_RATE,
  READING_MESSAGES,
  SPEECH_RATES,
  SPEECH_RATE_COOKIE,
  SpeechPlayer,
  chooseVoice,
  speechRateCookie,
  speechRateLabel,
  speechRateOf,
  type ReadingMessage,
  type ReadingState,
  type UtteranceLike,
  type VoiceInfo,
} from "@/modules/accessibility";

// SPEC 2026-11-15-acessibilidade, 6.1 items 2 to 4 and 6.3 items 1 to 3 (SF-268; CA-VOZ-02 and CA-VOZ-03 by the rules).

describe("the speed (6.1 item 3)", () => {
  it("offers 0,75×, 1×, 1,25× and 1,5×, the normal one first chosen", () => {
    expect(SPEECH_RATES).toEqual([0.75, 1, 1.25, 1.5]);
    expect(SPEECH_RATES.map(speechRateLabel)).toEqual(["0,75×", "1×", "1,25×", "1,5×"]);
    expect(DEFAULT_SPEECH_RATE).toBe(1);
  });

  it("is kept in a cookie like the contrast, and an unknown value falls back to the normal speed", () => {
    expect(speechRateCookie(1.25, false)).toBe(`${SPEECH_RATE_COOKIE}=1.25; Path=/; Max-Age=31536000; SameSite=Lax`);
    expect(speechRateCookie(0.75, true)).toContain("; Secure");
    expect(speechRateOf(`sf-contrast=high; ${SPEECH_RATE_COOKIE}=1.5`)).toBe(1.5);
    expect(speechRateOf(`${SPEECH_RATE_COOKIE}=3`)).toBe(1);
    expect(speechRateOf(`${SPEECH_RATE_COOKIE}=abc`)).toBe(1);
    expect(speechRateOf(undefined)).toBe(1);
  });
});

const voice = (name: string, lang: string, localService = true, isDefault = false): VoiceInfo => ({
  name,
  lang,
  localService,
  default: isDefault,
});

describe("the voice (6.1 item 4)", () => {
  it("prefers Brazilian Portuguese, then another Portuguese, a voice of the device before a remote one", () => {
    const english = voice("English", "en-US", true, true);
    const portugal = voice("Portugal", "pt-PT");
    const brazilRemote = voice("Brasil na rede", "pt-BR", false);
    const brazilLocal = voice("Brasil", "pt_BR");
    expect(chooseVoice([english, portugal, brazilRemote, brazilLocal])).toBe(brazilLocal);
    expect(chooseVoice([english, portugal, brazilRemote])).toBe(brazilRemote);
    expect(chooseVoice([english, portugal])).toBe(portugal);
    expect(chooseVoice([english, voice("Genérica", "pt")])?.name).toBe("Genérica");
  });

  it("is none without a Portuguese voice", () => {
    expect(chooseVoice([voice("English", "en-US"), voice("Português?", "es-PT")])).toBeNull();
    expect(chooseVoice([])).toBeNull();
  });
});

// A fake of the browser's speech: it records what is said and lets the test end each piece.
class FakeEngine {
  spoken: UtteranceLike[] = [];
  calls: string[] = [];
  speak(utterance: UtteranceLike) {
    this.spoken.push(utterance);
    this.calls.push(`speak:${utterance.text}`);
  }
  cancel() {
    this.calls.push("cancel");
    // A cancelled utterance reports "interrupted", which the player must ignore.
    this.spoken.at(-1)?.onerror?.({ error: "interrupted" });
  }
  pause() {
    this.calls.push("pause");
  }
  resume() {
    this.calls.push("resume");
  }
  finishCurrent() {
    this.spoken.at(-1)?.onend?.();
  }
}

function setup() {
  const engine = new FakeEngine();
  const changes: Array<[ReadingState, ReadingMessage]> = [];
  const player = new SpeechPlayer({
    engine,
    createUtterance: (text) => ({ text, lang: "", rate: 0, voice: null, onend: null, onerror: null }),
    onChange: (state, message) => changes.push([state, message]),
  });
  return { engine, changes, player };
}

describe("the player (6.1 item 3; 6.3 items 2 and 3)", () => {
  it("speaks the pieces one after the other, in Portuguese, and says when it ends", () => {
    const { engine, changes, player } = setup();
    player.setVoice(voice("Brasil", "pt-BR"));
    player.play(["Um.", "Dois.", "Três."], "page");
    expect(engine.spoken.map(({ text }) => text)).toEqual(["Um."]);
    expect(engine.spoken[0]!.lang).toBe("pt-BR");
    expect(engine.spoken[0]!.voice?.name).toBe("Brasil");
    engine.finishCurrent();
    engine.finishCurrent();
    expect(engine.spoken.map(({ text }) => text)).toEqual(["Um.", "Dois.", "Três."]);
    engine.finishCurrent();
    expect(changes).toEqual([
      ["speaking", "page"],
      ["idle", "finished"],
    ]);
    expect(player.current).toBe("idle");
  });

  it("speaks in Brazilian Portuguese even without a chosen voice, at the chosen speed from the next piece", () => {
    const { engine, player } = setup();
    player.play(["Um.", "Dois."], "selection");
    expect(engine.spoken[0]!.lang).toBe("pt-BR");
    expect(engine.spoken[0]!.rate).toBe(1);
    player.setRate(1.5);
    engine.finishCurrent();
    expect(engine.spoken[1]!.rate).toBe(1.5);
  });

  it("pauses, continues and stops at once, and a stopped reading never goes on", () => {
    const { engine, changes, player } = setup();
    player.play(["Um.", "Dois."], "page");
    player.pause();
    player.pause();
    expect(player.current).toBe("paused");
    player.resume();
    expect(player.current).toBe("speaking");
    player.stop();
    expect(player.current).toBe("idle");
    // The piece that was being spoken ends late: nothing else is said.
    engine.finishCurrent();
    expect(engine.spoken).toHaveLength(1);
    expect(engine.calls).toEqual(["cancel", "speak:Um.", "pause", "resume", "cancel"]);
    expect(changes.map(([, message]) => message)).toEqual(["page", "paused", "resumed", "stopped"]);
  });

  it("a new reading replaces the one going on; a page change stops in silence", () => {
    const { engine, changes, player } = setup();
    player.play(["Página."], "page");
    player.play(["Trecho."], "selection");
    expect(engine.spoken.map(({ text }) => text)).toEqual(["Página.", "Trecho."]);
    player.stop(true);
    expect(changes.map(([, message]) => message)).toEqual(["page", "selection"]);
    player.stop();
    expect(changes).toHaveLength(2);
  });

  it("says there is nothing to read, and stops with a message when the browser fails", () => {
    const { engine, changes, player } = setup();
    player.play([], "page");
    expect(changes).toEqual([["idle", "nothingToRead"]]);
    player.play(["Um.", "Dois."], "page");
    engine.spoken.at(-1)!.onerror!({ error: "synthesis-failed" });
    expect(player.current).toBe("idle");
    expect(changes.at(-1)).toEqual(["idle", "failed"]);
    engine.finishCurrent();
    expect(engine.spoken).toHaveLength(1);
  });
});

describe("the messages (6.3 item 4; CA-VOZ-03)", () => {
  it("point to the system's screen reader when the browser cannot read", () => {
    expect(READING_MESSAGES.unsupported).toMatch(/não oferece leitura em voz alta.*leitor de tela/);
    expect(READING_MESSAGES.noPortugueseVoice).toMatch(/voz em português.*leitor de tela/);
  });
});
