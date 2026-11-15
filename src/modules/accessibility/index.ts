// Accessibility preferences of the screens (SPEC 2026-11-15-acessibilidade): kept in the browser, no database.
export {
  CONTRAST_COOKIE,
  CONTRAST_COOKIE_MAX_AGE,
  SYSTEM_HIGH_CONTRAST_QUERY,
  contrastBootScript,
  contrastChoiceOf,
  contrastCookie,
  effectiveContrast,
  type ContrastChoice,
} from "./domain/preferences";
// Reading aloud (SPEC 2026-11-15-acessibilidade, part C; SF-267): what is read and how it is cut.
export {
  MAX_CHUNK_LENGTH,
  describeField,
  normalizeSpaces,
  readingChunks,
  readingLines,
  selectionChunks,
  splitLongText,
  type FieldState,
  type ReadingEnvironment,
  type ReadingNode,
} from "./domain/reading";
// The speech of the reading (SF-268): speeds, kept speed, voice, messages, the player and the real page's reading.
export {
  DEFAULT_SPEECH_RATE,
  READING_MESSAGES,
  SPEECH_RATES,
  SPEECH_RATE_COOKIE,
  chooseVoice,
  isSpeechRate,
  speechRateCookie,
  speechRateLabel,
  speechRateOf,
  type ReadingMessage,
  type ReadingState,
  type SpeechRate,
  type VoiceInfo,
} from "./domain/speech";
export { SpeechPlayer, type SpeechEngineLike, type SpeechPlayerOptions, type UtteranceLike } from "./application/speech-player";
export { domReadingEnvironment } from "./infrastructure/dom-reading";
// The "Acessibilidade" button and its panel (SF-269): the shortcut, the panel's state and the main content's id.
export { MAIN_CONTENT_ID, isAccessibilityShortcut, nextPanelState, type PanelEvent, type ShortcutKey } from "./domain/panel";
