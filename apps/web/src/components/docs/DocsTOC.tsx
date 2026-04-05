import { useEffect, useState } from "react";

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * DocsTOC — right-hand table of contents for each page.
 *
 * Reads the current page's h2/h3 elements (tagged with IDs by rehype-slug)
 * on mount and renders a sticky list of anchor links. Re-queries when the
 * route changes so navigating between pages doesn't show stale headings.
 *
 * Falls back to null if there are fewer than 2 headings — single-section
 * pages don't need a TOC.
 */
export function DocsTOC({ pathKey }: { pathKey: string }) {
  const [items, setItems] = useState<TocItem[]>([]);

  // `pathKey` is a trigger-only dependency — the effect body queries the DOM
  // for the freshly rendered page's headings and doesn't read `pathKey`
  // directly. The re-run is necessary whenever the parent route changes so
  // stale TOC entries from a previous page don't leak through.
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger-only dep; see comment above
  useEffect(() => {
    // Defer to the next tick so the freshly rendered MDX content is in the DOM
    const frame = requestAnimationFrame(() => {
      const main = document.querySelector<HTMLElement>("[data-docs-content]");
      if (!main) {
        setItems([]);
        return;
      }
      const headings =
        main.querySelectorAll<HTMLHeadingElement>("h2[id], h3[id]");
      const next: TocItem[] = [];
      headings.forEach((h) => {
        const id = h.id;
        if (!id) return;
        const text = h.textContent?.trim() ?? "";
        const level = h.tagName === "H2" ? 2 : 3;
        next.push({ id, text, level });
      });
      setItems(next);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathKey]);

  if (items.length < 2) return null;

  return (
    <nav
      aria-label="On this page"
      className="hidden xl:block sticky top-[76px] self-start max-w-[200px]"
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-subtle mb-3">
        On this page
      </div>
      <ul className="space-y-1.5 text-xs">
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? "pl-3" : ""}>
            <a
              href={`#${item.id}`}
              className="text-text-muted hover:text-brand transition-colors leading-snug block"
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
