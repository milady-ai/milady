import type { ReactNode } from "react";

type CalloutKind = "tip" | "note" | "warning" | "danger";

const DEFAULT_TITLES: Record<CalloutKind, string> = {
  tip: "Tip",
  note: "Note",
  warning: "Heads up",
  danger: "Watch out",
};

export interface CalloutProps {
  kind?: CalloutKind;
  title?: string;
  children: ReactNode;
}

/**
 * <Callout> — MDX shortcode for inline info boxes.
 *
 * Usage inside .mdx:
 *   <Callout kind="tip">Quick win: use the keyboard shortcut…</Callout>
 *   <Callout kind="warning" title="Credentials">Never paste your key…</Callout>
 *
 * Styling lives in apps/web/src/styles.css under the .docs-callout class so
 * the four variants (tip / note / warning / danger) share the same layout
 * and only differ in border color + title color.
 */
export function Callout({ kind = "note", title, children }: CalloutProps) {
  return (
    <aside className={`docs-callout docs-callout--${kind}`} role="note">
      <span className="docs-callout-title">
        {title ?? DEFAULT_TITLES[kind]}
      </span>
      <div>{children}</div>
    </aside>
  );
}
