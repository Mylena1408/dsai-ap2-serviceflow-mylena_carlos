// SPEC 2026-11-15-acessibilidade, 6.1 items 3 and 4 (SF-268; decision L2): the speeds, the kept speed, the choice of
// the voice and the words the controls announce. The browser's own speech (Web Speech API) does the talking: no
// service outside the device and no new dependency (6.3 item 1).

export const SPEECH_RATES = [0.75, 1, 1.25, 1.5] as const;
export type SpeechRate = (typeof SPEECH_RATES)[number];
export const DEFAULT_SPEECH_RATE: SpeechRate = 1;

/** The speed is kept like the contrast (6.1 item 3; decision L1): a cookie of the browser, for a year. */
export const SPEECH_RATE_COOKIE = "sf-speech-rate";
const SPEECH_RATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isSpeechRate(value: number): value is SpeechRate {
  return (SPEECH_RATES as readonly number[]).includes(value);
}

/** The kept speed, from the cookies; the normal speed without one or with an unknown value. */
export function speechRateOf(cookies: string | null | undefined): SpeechRate {
  for (const part of (cookies ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== SPEECH_RATE_COOKIE) continue;
    const value = Number(part.slice(separator + 1).trim());
    return isSpeechRate(value) ? value : DEFAULT_SPEECH_RATE;
  }
  return DEFAULT_SPEECH_RATE;
}

export function speechRateCookie(rate: SpeechRate, secure: boolean): string {
  return `${SPEECH_RATE_COOKIE}=${rate}; Path=/; Max-Age=${SPEECH_RATE_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** "0,75×", "1×", "1,25×", "1,5×". */
export function speechRateLabel(rate: SpeechRate): string {
  return `${String(rate).replace(".", ",")}×`;
}

/** The part of a voice of the browser the choice needs. */
export interface VoiceInfo {
  readonly name: string;
  readonly lang: string;
  readonly localService: boolean;
  readonly default: boolean;
}

function languageOf(voice: VoiceInfo): string {
  return voice.lang.replace("_", "-").toLowerCase();
}

/**
 * The voice of the reading (6.1 item 4): Brazilian Portuguese if the device has one, otherwise another Portuguese
 * voice; among them, a voice of the device itself before a remote one (it works without the network) and the
 * system's default before the others. Null when there is no Portuguese voice.
 */
export function chooseVoice<Voice extends VoiceInfo>(voices: readonly Voice[]): Voice | null {
  const rank = (voice: Voice) =>
    (languageOf(voice) === "pt-br" ? 0 : 4) + (voice.localService ? 0 : 2) + (voice.default ? 0 : 1);
  const portuguese = voices.filter((voice) => languageOf(voice) === "pt" || languageOf(voice).startsWith("pt-"));
  return [...portuguese].sort((first, second) => rank(first) - rank(second))[0] ?? null;
}

export type ReadingState = "idle" | "speaking" | "paused";

/** What the controls announce (6.3 item 4), politely, as the state changes. */
export const READING_MESSAGES = {
  page: "Lendo a página.",
  selection: "Lendo o trecho selecionado.",
  paused: "Leitura pausada.",
  resumed: "Leitura retomada.",
  stopped: "Leitura parada.",
  finished: "Leitura concluída.",
  nothingSelected: "Selecione um trecho da página para ouvir.",
  nothingToRead: "Não há texto para ler nesta página.",
  failed: "A leitura foi interrompida pelo navegador.",
  unsupported: "Este navegador não oferece leitura em voz alta. Use o leitor de tela do seu sistema.",
  noPortugueseVoice: "Este navegador não tem uma voz em português. Use o leitor de tela do seu sistema.",
} as const;

export type ReadingMessage = keyof typeof READING_MESSAGES;
