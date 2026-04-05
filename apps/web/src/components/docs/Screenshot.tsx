import { resolveHomepageAssetUrl } from "../../lib/asset-url";

export interface ScreenshotProps {
  /** Path inside `apps/web/public/` (e.g. `"docs/screenshots/first-run.png"`). */
  src: string;
  /** Required alt text. Describe what the screenshot shows, not "screenshot". */
  alt: string;
  /** Optional caption shown below the image in muted text. */
  caption?: string;
  /** Optional width hint for very small callouts (defaults to full width). */
  width?: number | string;
}

/**
 * <Screenshot> — MDX shortcode for bordered, captioned images.
 *
 * Usage inside .mdx:
 *   <Screenshot
 *     src="docs/screenshots/first-run.png"
 *     alt="Server picker on first launch, showing local and cloud options"
 *     caption="Pick a server on first launch. You can switch later."
 *   />
 *
 * Images live under apps/web/public/docs/screenshots/ and are resolved via
 * the existing homepage asset helper so they work under both `bun run dev`
 * (served from public/) and the built GitHub Pages deploy.
 */
export function Screenshot({ src, alt, caption, width }: ScreenshotProps) {
  return (
    <figure className="my-6">
      <img
        src={resolveHomepageAssetUrl(src)}
        alt={alt}
        style={width ? { maxWidth: width, width: "100%" } : undefined}
        className="rounded-md border border-border block"
      />
      {caption ? (
        <figcaption className="mt-2 text-xs text-text-muted italic">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
