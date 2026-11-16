import Link from "next/link";
import {
  BEFORE_SENDING,
  NEEDS_ATTENDANCE,
  ON_YOUR_OWN,
  STUDENT_GUIDE_STEPS,
  guideLinksEnabled,
  guideNoticeFor,
  guideSituations,
  type GuideScreen,
  type GuideSituation,
  type GuideViewer,
} from "@/modules/help";

// The content of the student's quick guide (SPEC 2026-11-16-guia-do-estudante, 2 and 5; SF-282): the notice of the
// profile, the numbered steps, what to check before sending, the situations and what is done alone.

function ScreenName({ screen, links }: { screen: GuideScreen; links: boolean }) {
  if (links && screen.href) return <Link href={screen.href}>{screen.label}</Link>;
  return <strong>{screen.label}</strong>;
}

/** "A, B e C", each one a screen name (G2: a link only for the requester). */
export function ScreenList({ screens, links }: { screens: readonly GuideScreen[]; links: boolean }) {
  return (
    <>
      {screens.map((screen, index) => (
        <span key={screen.label}>
          {index === 0 ? "" : index === screens.length - 1 ? " e " : ", "}
          <ScreenName links={links} screen={screen} />
        </span>
      ))}
    </>
  );
}

function SituationList({ items }: { items: readonly GuideSituation[] }) {
  return (
    <dl className="guide-situations">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StudentGuideContent({ viewer }: { viewer: GuideViewer }) {
  const notice = guideNoticeFor(viewer);
  const links = guideLinksEnabled(viewer);
  const situations = guideSituations();
  return (
    <>
      <p className="feedback guide-notice" data-kind={notice.kind} role="note">
        {notice.text}
      </p>

      <section aria-labelledby="guide-steps" className="surface-card content-section">
        <h2 id="guide-steps">Passo a passo</h2>
        <ol className="guide-steps">
          {STUDENT_GUIDE_STEPS.map((step) => (
            <li id={`passo-${step.id}`} key={step.id}>
              <h3>{step.title}</h3>
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

      <section aria-labelledby="guide-before" className="surface-card content-section">
        <h2 id="guide-before">Antes de enviar</h2>
        <ul className="guide-checklist">
          {BEFORE_SENDING.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="guide-situations" className="surface-card content-section">
        <h2 id="guide-situations">O que cada situação quer dizer</h2>
        <h3>Situação da solicitação</h3>
        <SituationList items={situations.status} />
        <h3>Prazo</h3>
        <SituationList items={situations.deadline} />
      </section>

      <section aria-labelledby="guide-alone" className="surface-card content-section">
        <h2 id="guide-alone">Sozinho ou com atendimento</h2>
        <p>
          Sem abrir solicitação, você mesmo usa: <ScreenList links={links} screens={ON_YOUR_OWN} />.
        </p>
        <p>{NEEDS_ATTENDANCE}</p>
        {links ? (
          <p>
            <Link href="/catalog/map">Abrir o Mapa de serviços</Link>
          </p>
        ) : null}
      </section>
    </>
  );
}
