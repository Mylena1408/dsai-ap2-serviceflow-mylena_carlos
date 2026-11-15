import Link from "next/link";
import { MAX_HELP_QUERY_LENGTH, type HelpResult } from "@/modules/help";

// The content of the page "Ajuda" (SPEC 2026-11-15-ajuda-faq, 2 and 4; SF-271): the search, how many questions were
// found and each topic with its questions, one `details` each, open when they answer a search.

export function helpCountText(result: Pick<HelpResult, "found" | "query">): string {
  if (!result.query) return `${result.found} perguntas.`;
  if (result.found === 0) return `Nenhuma pergunta encontrada para "${result.query}".`;
  return result.found === 1 ? `1 pergunta encontrada para "${result.query}".` : `${result.found} perguntas encontradas para "${result.query}".`;
}

export function HelpContent({ result }: { result: HelpResult }) {
  const searching = result.query !== "";
  return (
    <>
      <form action="/help" aria-label="Buscar na ajuda" className="inline-form" method="get" role="search">
        <label>
          Buscar na ajuda
          <input defaultValue={result.query} maxLength={MAX_HELP_QUERY_LENGTH} name="q" type="search" />
        </label>
        <button type="submit">Buscar</button>
      </form>
      <p aria-live="polite" className="metadata">
        {helpCountText(result)}
        {searching ? (
          <>
            {" "}
            <Link href="/help">Ver todas as perguntas</Link>
          </>
        ) : null}
      </p>
      {result.topics.map((topic) => (
        <section aria-labelledby={`help-${topic.id}`} className="surface-card content-section" key={topic.id}>
          <h2 id={`help-${topic.id}`}>{topic.title}</h2>
          <p className="section-description">{topic.description}</p>
          {topic.questions.map((item) => (
            <details className="help-question" key={item.id} open={searching}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </section>
      ))}
    </>
  );
}
