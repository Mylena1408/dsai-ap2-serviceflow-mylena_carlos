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
// The student's quick guide (SPEC 2026-11-16-guia-do-estudante; SF-282).
export {
  BEFORE_SENDING,
  NEEDS_ATTENDANCE,
  ON_YOUR_OWN,
  STUDENT_GUIDE_PATH,
  STUDENT_GUIDE_STEPS,
  STUDENT_GUIDE_TITLE,
  guideLinksEnabled,
  guideNoticeFor,
  guideScreenLabels,
  guideSituations,
  type GuideNotice,
  type GuideScreen,
  type GuideSituation,
  type GuideStep,
  type GuideViewer,
} from "./domain/student-guide";
// The quick guide of professors and technicians (SPEC 2026-11-16-professores-e-tecnicos, part B; SF-293).
export {
  STAFF_GUIDE_PATH,
  STAFF_GUIDE_STEPS,
  STAFF_GUIDE_TITLE,
  staffGuideNoticeFor,
  staffGuideScreenLabels,
  type StaffGuideStep,
} from "./domain/staff-guide";
