import type { ReadingMessage, ReadingState, SpeechRate, VoiceInfo } from "../domain/speech";

// SPEC 2026-11-15-acessibilidade, 6.1 item 3 and 6.3 items 2 and 3 (SF-268): plays the pieces of a reading one after
// the other on the browser's speech, with pause, continue, stop and speed. It only knows the small part of the Web
// Speech API below, so the unit tests drive it with a fake; the screen hands it window.speechSynthesis.

export interface UtteranceLike {
  text: string;
  lang: string;
  rate: number;
  voice: VoiceInfo | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

export interface SpeechEngineLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  pause(): void;
  resume(): void;
}

export interface SpeechPlayerOptions {
  engine: SpeechEngineLike;
  createUtterance(text: string): UtteranceLike;
  /** Called on every change of state, with the message to announce. */
  onChange(state: ReadingState, message: ReadingMessage): void;
}

/** Errors of an utterance that only mean it was stopped on purpose. */
const STOPPED_ON_PURPOSE = new Set(["interrupted", "canceled"]);

export class SpeechPlayer {
  private chunks: readonly string[] = [];
  private index = 0;
  private run = 0;
  private state: ReadingState = "idle";
  private rate: SpeechRate = 1;
  private voice: VoiceInfo | null = null;

  constructor(private readonly options: SpeechPlayerOptions) {}

  get current(): ReadingState {
    return this.state;
  }

  /** The speed of the next pieces (the one being spoken keeps its own). */
  setRate(rate: SpeechRate): void {
    this.rate = rate;
  }

  setVoice(voice: VoiceInfo | null): void {
    this.voice = voice;
  }

  /** Starts a new reading, replacing any other; `message` names what is read (page or selection). */
  play(chunks: readonly string[], message: ReadingMessage): void {
    this.options.engine.cancel();
    this.run += 1;
    this.chunks = chunks;
    this.index = 0;
    if (chunks.length === 0) {
      this.change("idle", "nothingToRead");
      return;
    }
    this.change("speaking", message);
    this.speakCurrent(this.run);
  }

  pause(): void {
    if (this.state !== "speaking") return;
    this.options.engine.pause();
    this.change("paused", "paused");
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.options.engine.resume();
    this.change("speaking", "resumed");
  }

  /** Stops at once; `silent` when the page changes (6.3 item 3) and nobody needs to hear it. */
  stop(silent = false): void {
    if (this.state === "idle") return;
    this.run += 1;
    this.options.engine.cancel();
    this.state = "idle";
    if (!silent) this.options.onChange("idle", "stopped");
  }

  private speakCurrent(run: number): void {
    const text = this.chunks[this.index];
    if (text === undefined) return;
    const utterance = this.options.createUtterance(text);
    utterance.lang = this.voice?.lang ?? "pt-BR";
    utterance.voice = this.voice;
    utterance.rate = this.rate;
    utterance.onend = () => {
      if (run !== this.run) return;
      this.index += 1;
      if (this.index >= this.chunks.length) {
        this.change("idle", "finished");
        return;
      }
      this.speakCurrent(run);
    };
    utterance.onerror = (event) => {
      if (run !== this.run || STOPPED_ON_PURPOSE.has(event.error ?? "")) return;
      this.run += 1;
      this.options.engine.cancel();
      this.change("idle", "failed");
    };
    this.options.engine.speak(utterance);
  }

  private change(state: ReadingState, message: ReadingMessage): void {
    this.state = state;
    this.options.onChange(state, message);
  }
}
