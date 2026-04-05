import type { MDXComponents } from "mdx/types";
import { Callout } from "./Callout";
import { Screenshot } from "./Screenshot";
import { Steps } from "./Steps";

/**
 * MDX component mapping for consumer docs.
 *
 * Two categories:
 *
 *   1. **HTML element overrides** (a, h1…h4, code, etc.) — these get picked
 *      up because the enclosing `.docs-prose` class in styles.css already
 *      styles those selectors. We don't override them in JSX unless we need
 *      extra behavior (e.g. external link detection on <a>).
 *
 *   2. **Custom MDX shortcodes** (Callout, Steps, Screenshot) — these are
 *      authored directly as JSX tags inside .mdx files and must be exposed
 *      via MDXProvider so they resolve without an explicit import.
 *
 * Pass this object to <MDXProvider components={mdxComponents}> inside
 * DocsLayout so every MDX page picks it up automatically.
 */

function ExternalAwareLink(
  props: React.AnchorHTMLAttributes<HTMLAnchorElement>,
) {
  const href = props.href ?? "";
  const isExternal = /^https?:\/\//.test(href);
  if (isExternal) {
    return (
      <a {...props} target="_blank" rel="noreferrer noopener">
        {props.children}
      </a>
    );
  }
  return <a {...props}>{props.children}</a>;
}

export const mdxComponents: MDXComponents = {
  a: ExternalAwareLink,
  // Shortcodes — authored as <Callout>, <Steps>, <Screenshot> in .mdx files.
  Callout,
  Steps,
  Screenshot,
};
