import { Suspense, useMemo } from "react";
import { Link } from "react-router-dom";
import { docsByPath, tierSections } from "../../docs/registry";

/**
 * DocsLanding — the `/docs` route body.
 *
 * Three sections:
 *   1. Short hero copy (rendered from content/index.mdx)
 *   2. Four big tier cards (Beginner / Intermediate / Advanced / Developer)
 *   3. Nothing else for MVP — no search, no recent updates, no footer links
 *
 * The hero body lives in an .mdx file so the copy can be edited without
 * touching JSX. The tier cards are generated from the registry.
 */
export function DocsLanding() {
  const LandingContent = useMemo(() => {
    const entry = docsByPath.get("/docs");
    return entry?.component ?? null;
  }, []);

  return (
    <div className="max-w-[920px]">
      <div className="docs-prose">
        {LandingContent ? (
          <Suspense fallback={<div className="text-text-muted">Loading…</div>}>
            <LandingContent />
          </Suspense>
        ) : null}
      </div>

      <section
        aria-labelledby="docs-tier-cards-heading"
        className="mt-12 border-t border-border pt-10"
      >
        <h2
          id="docs-tier-cards-heading"
          className="font-mono text-[11px] uppercase tracking-wider text-text-subtle mb-4"
        >
          Start where you are
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tierSections.map((section) => {
            const writtenCount = section.entries.filter(
              (e) => e.component !== null,
            ).length;
            const totalCount = section.entries.length;
            return (
              <Link
                key={section.tier}
                to={`/docs/${section.tier}`}
                className="group block border border-border bg-dark-secondary p-5 hover:border-brand transition-colors"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-text-subtle">
                    {section.label}
                  </span>
                  <span className="font-mono text-[10px] text-text-subtle/60">
                    {writtenCount}/{totalCount} pages
                  </span>
                </div>
                <div className="text-lg font-black uppercase tracking-tight text-text-dark group-hover:text-brand transition-colors">
                  {section.label === "Developer"
                    ? "For developers →"
                    : section.label}
                </div>
                <p className="mt-2 text-sm text-text-muted leading-6">
                  {section.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
