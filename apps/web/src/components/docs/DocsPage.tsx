import { Suspense } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  type DocEntry,
  docsByPath,
  findAdjacent,
  tierSections,
} from "../../docs/registry";
import { DocsTOC } from "./DocsTOC";

/**
 * DocsPage — renders a single MDX page at `/docs/:tier/:slug` (or the
 * hand-authored developer lander at `/docs/developer`).
 *
 * Resolves the current pathname against the registry. If the entry has a
 * component, it's lazy-loaded inside <Suspense>. If the entry exists but
 * is marked "coming soon" (component === null) we render a friendly
 * placeholder instead of 404 — the sidebar already shows the unwritten
 * pages as disabled, but a direct URL hit shouldn't explode.
 */
export function DocsPage() {
  const location = useLocation();
  const entry = docsByPath.get(location.pathname);

  if (!entry) {
    return <NotFound />;
  }

  if (entry.component === null) {
    return <ComingSoon entry={entry} />;
  }

  const { prev, next } = findAdjacent(location.pathname);
  const Content = entry.component;

  return (
    <div className="flex gap-12">
      <article className="docs-prose flex-1 min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-subtle mb-2">
          {tierLabel(entry)}
        </div>

        <Suspense fallback={<div className="text-text-muted">Loading…</div>}>
          <Content />
        </Suspense>

        <PrevNext prev={prev} next={next} />
      </article>

      <DocsTOC pathKey={location.pathname} />
    </div>
  );
}

function tierLabel(entry: DocEntry): string {
  if (!entry.tier) return "Docs";
  const section = tierSections.find((s) => s.tier === entry.tier);
  return section?.label ?? entry.tier;
}

function PrevNext({
  prev,
  next,
}: {
  prev: DocEntry | null;
  next: DocEntry | null;
}) {
  if (!prev && !next) return null;
  return (
    <nav
      aria-label="Page navigation"
      className="not-prose mt-12 pt-8 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      {prev ? (
        <Link
          to={prev.path}
          className="group block border border-border bg-dark-secondary p-4 hover:border-brand transition-colors"
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-subtle mb-1">
            ← Previous
          </div>
          <div className="text-sm font-bold text-text-light group-hover:text-brand">
            {prev.title}
          </div>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          to={next.path}
          className="group block border border-border bg-dark-secondary p-4 hover:border-brand transition-colors text-right"
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-subtle mb-1">
            Next →
          </div>
          <div className="text-sm font-bold text-text-light group-hover:text-brand">
            {next.title}
          </div>
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
}

function NotFound() {
  return (
    <div className="max-w-[720px] docs-prose">
      <h1>Not found</h1>
      <p>
        That page isn't in the docs. Head back to <Link to="/docs">Docs</Link>.
      </p>
    </div>
  );
}

function ComingSoon({ entry }: { entry: DocEntry }) {
  return (
    <div className="max-w-[720px] docs-prose">
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-subtle mb-2">
        {tierLabel(entry)} · Coming soon
      </div>
      <h1>{entry.title}</h1>
      <p className="text-text-muted">{entry.description}</p>
      <p>
        This page is planned but not written yet. In the meantime, start from{" "}
        <Link to="/docs">the docs home</Link> or pick another page from the
        sidebar.
      </p>
    </div>
  );
}
