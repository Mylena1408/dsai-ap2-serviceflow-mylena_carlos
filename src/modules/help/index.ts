// The help page and its frequent questions (SPEC 2026-11-15-ajuda-faq; SF-271): content in code, no database.
export {
  HELP_TOPICS,
  MAX_HELP_QUERY_LENGTH,
  helpQueryOf,
  normalizeHelpText,
  searchHelp,
  topicsFor,
  type HelpQuestion,
  type HelpResult,
  type HelpRole,
  type HelpTopic,
} from "./domain/help";
