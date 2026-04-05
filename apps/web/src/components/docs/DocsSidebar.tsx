import { Link, useLocation } from "react-router-dom";
import { type DocEntry, type DocTier, tierSections } from "../../docs/registry";

interface DocsSidebarProps {
  /** Called when a link is clicked — used by the mobile drawer to close itself. */
  onNavigate?: () => void;
}

/**
 * DocsSidebar — tier-grouped navigation for /docs.
 *
 * Renders the four tier sections (Beginner / Intermediate / Advanced /
 * Developer) as collapsible groups with their registered pages underneath.
 * The active page is highlighted, and "coming soon" pages (component ===
 * null in the registry) are dimmed and non-clickable.
 *
 * Used inside DocsLayout as a fixed-position sidebar on desktop and as a
 * slide-out drawer on mobile. The onNavigate callback lets the drawer
 * close itself on route change.
 */
export function DocsSidebar({ onNavigate }: DocsSidebarProps) {
  const location = useLocation();

  return (
    <nav aria-label="Documentation navigation" className="space-y-8">
      {/* Top-level "Docs home" link */}
      <div>
        <Link
          to="/docs"
          onClick={onNavigate}
          className={`block font-mono text-[11px] uppercase tracking-wider py-1 transition-colors ${
            location.pathname === "/docs"
              ? "text-brand"
              : "text-text-light hover:text-brand"
          }`}
        >
          ← Docs home
        </Link>
      </div>

      {tierSections.map((section) => (
        <TierSection
          key={section.tier}
          tier={section.tier}
          label={section.label}
          entries={section.entries}
          activePath={location.pathname}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

interface TierSectionProps {
  tier: DocTier;
  label: string;
  entries: DocEntry[];
  activePath: string;
  onNavigate?: () => void;
}

function TierSection({
  tier,
  label,
  entries,
  activePath,
  onNavigate,
}: TierSectionProps) {
  const tierIndexPath = `/docs/${tier}`;
  const isTierActive =
    activePath === tierIndexPath || activePath.startsWith(`${tierIndexPath}/`);

  return (
    <div>
      <Link
        to={tierIndexPath}
        onClick={onNavigate}
        className={`block font-mono text-[11px] uppercase tracking-wider mb-2 transition-colors ${
          isTierActive ? "text-brand" : "text-text-subtle hover:text-text-light"
        }`}
      >
        {label}
      </Link>
      <ul className="space-y-0.5 border-l border-border">
        {entries.map((entry) => (
          <SidebarItem
            key={entry.path}
            entry={entry}
            active={activePath === entry.path}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </div>
  );
}

function SidebarItem({
  entry,
  active,
  onNavigate,
}: {
  entry: DocEntry;
  active: boolean;
  onNavigate?: () => void;
}) {
  const written = entry.component !== null;

  if (!written) {
    return (
      <li
        className="pl-4 py-1.5 text-[12px] text-text-subtle/50 leading-snug cursor-not-allowed"
        title="Coming soon"
      >
        {entry.title}{" "}
        <span className="text-[9px] uppercase tracking-wider opacity-60">
          soon
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        to={entry.path}
        onClick={onNavigate}
        className={`block pl-4 py-1.5 text-[13px] leading-snug transition-colors border-l-2 -ml-[1px] ${
          active
            ? "text-brand border-brand"
            : "text-text-muted border-transparent hover:text-text-light hover:border-border"
        }`}
      >
        {entry.title}
      </Link>
    </li>
  );
}
