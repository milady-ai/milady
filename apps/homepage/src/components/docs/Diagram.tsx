import DOMPurify from "dompurify";
import { useEffect, useId, useRef, useState } from "react";

export interface DiagramProps {
  /** Mermaid chart source (flowchart, sequenceDiagram, etc.). Pass as children. */
  children: string;
  /** Optional caption shown below the diagram in muted text. */
  caption?: string;
  /**
   * Accessible label describing what the diagram conveys. Rendered SVG is
   * decorative; this text is read by screen readers.
   */
  alt?: string;
}

/**
 * <Diagram> — MDX shortcode for Mermaid diagrams.
 *
 * Usage inside .mdx:
 *   <Diagram caption="How a message reaches your agent" alt="Message flow sequence">{`
 *     sequenceDiagram
 *       participant U as You
 *       participant T as Telegram
 *       participant M as Milady
 *       U->>T: message
 *       T->>M: webhook
 *       M-->>U: reply
 *   `}</Diagram>
 *
 * Mermaid is dynamically imported the first time a <Diagram> mounts so the
 * library (~700KB) does not ship with the initial /docs bundle. Diagrams
 * render client-side into a unique <div> — SSR/prerender shows a stable
 * placeholder until hydration, which is fine for a Vite SPA.
 */
export function Diagram({ children, caption, alt }: DiagramProps) {
  const id = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
          themeVariables: {
            // Match Milady's dark surface palette so diagrams don't look
            // pasted in from a different site.
            background: "#0a0a0a",
            primaryColor: "#1a1a1a",
            primaryTextColor: "#e5e5e5",
            primaryBorderColor: "#404040",
            lineColor: "#737373",
            secondaryColor: "#171717",
            tertiaryColor: "#262626",
          },
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        });
        const { svg } = await mermaid.render(`mermaid-${id}`, children.trim());
        if (!cancelled && containerRef.current) {
          // Defense-in-depth: mermaid is configured with securityLevel:"strict"
          // but we DOMPurify the resulting SVG before innerHTML insertion so
          // we survive any future mermaid regression or dependency swap.
          const sanitized = DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
          });
          containerRef.current.innerHTML = sanitized;
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to render diagram",
          );
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [children, id]);

  return (
    <figure className="my-6">
      <div
        ref={containerRef}
        role="img"
        aria-label={alt ?? caption ?? "Diagram"}
        className="rounded-md border border-border bg-dark-secondary p-4 overflow-x-auto"
      >
        {error ? (
          <pre className="text-xs text-red-400">
            Diagram failed to render: {error}
          </pre>
        ) : (
          <div className="text-xs text-text-subtle">Loading diagram…</div>
        )}
      </div>
      {caption ? (
        <figcaption className="mt-2 text-xs text-text-muted italic">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
