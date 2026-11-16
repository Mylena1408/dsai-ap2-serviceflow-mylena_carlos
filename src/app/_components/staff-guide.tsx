import { STAFF_GUIDE_STEPS, guideLinksEnabled, staffGuideNoticeFor, type GuideViewer } from "@/modules/help";
import { ScreenList } from "./student-guide";

// The content of the quick guide of professors and technicians (SPEC 2026-11-16-professores-e-tecnicos, part B):
// the notice of the profile and kind, and the numbered steps; the exam's step says it is for professors.

export function StaffGuideContent({ viewer }: { viewer: GuideViewer }) {
  const notice = staffGuideNoticeFor(viewer);
  const links = guideLinksEnabled(viewer);
  return (
    <>
      <p className="feedback guide-notice" data-kind={notice.kind} role="note">
        {notice.text}
      </p>
      <section aria-labelledby="staff-guide-steps" className="surface-card content-section">
        <h2 id="staff-guide-steps">Passo a passo</h2>
        <ol className="guide-steps">
          {STAFF_GUIDE_STEPS.map((step) => (
            <li id={`passo-${step.id}`} key={step.id}>
              <h3>
                {step.title}
                {step.onlyProfessors ? <span className="status-pill guide-audience"> Para professores</span> : null}
              </h3>
              <ul>
                {step.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
              <p className="metadata">
                Onde: <ScreenList links={links} screens={step.screens} />.
              </p>
              <p className="guide-tip">
                <span className="eyebrow">Dica</span> {step.tip}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
