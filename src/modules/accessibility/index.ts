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
