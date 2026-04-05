import { Link, useParams } from "react-router-dom";
import { type DocTier, tierSections } from "../../docs/registry";

const VALID_TIERS: DocTier[] = [
  "beginner",
  "intermediate",
  "advanced",
  "developer",
];

function isValidTier(value: string | undefined): value is DocTier {
  return typeof value === "string" && VALID_TIERS.includes(value as DocTier);
}

/**
 * TierLanding — `/docs/:tier` route body.
 *
 * Lists every page in the current tier as a card-style link. "Coming soon"
 * pages (component === null) are rendered as dimmed non-clickable items
 * so readers can see the planned information architecture without getting
 * stuck on a broken link.
 *
 * The developer tier's index doesn't render this component — it has its
 * own MDX-authored page (`/docs/developer`) that lives in the registry
 * with a real component, so the router matches that entry first.
 */
export function TierLanding() {
  const params = useParams<{ tier: string }>();
  const tierParam = params.tier;

  if (!isValidTier(tierParam)) {
    return (
      <div className="max-w-[720px] docs-prose">
        <h1>Tier not found</h1>
        <p>
          That tier doesn't exist. Head back to <Link to="/docs">Docs</Link>.
        </p>
      </div>
    );
  }

  const section = tierSections.find((s) => s.tier === tierParam);
  if (!section) {
    return null;
  }

  return (
    <div className="max-w-[920px]">
      <div className="docs-prose mb-8">
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-subtle mb-2">
          Tier
        </div>
        <h1 className="capitalize">{section.label}</h1>
        <p className="text-text-muted">{section.description}</p>
      </div>

      <ul className="space-y-3">
        {section.entries.map((entry) => {
          const written = entry.component !== null;
          if (!written) {
            return (
              <li
                key={entry.path}
                className="block border border-border bg-dark-secondary/50 p-4 opacity-40 cursor-not-allowed"
                title="Coming soon"
              >
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-base font-bold text-text-light">
                    {entry.title}
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-text-subtle">
                    Coming soon
                  </span>
                </div>
                <p className="text-sm text-text-muted leading-6">
                  {entry.description}
                </p>
              </li>
            );
          }
          return (
            <li key={entry.path}>
              <Link
                to={entry.path}
                className="group block border border-border bg-dark-secondary p-4 hover:border-brand transition-colors"
              >
                <div className="text-base font-bold text-text-dark group-hover:text-brand transition-colors mb-1">
                  {entry.title}
                </div>
                <p className="text-sm text-text-muted leading-6">
                  {entry.description}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
