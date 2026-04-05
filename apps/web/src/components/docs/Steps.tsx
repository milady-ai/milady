import type { ReactNode } from "react";

export interface StepsProps {
  children: ReactNode;
}

/**
 * <Steps> — numbered walkthrough MDX shortcode.
 *
 * Usage inside .mdx:
 *   <Steps>
 *     <li>Open Milady and click Settings.</li>
 *     <li>Paste your Discord bot token.</li>
 *     <li>Click Connect. Wait for the green dot.</li>
 *   </Steps>
 *
 * Styling lives in apps/web/src/styles.css under the .docs-steps class —
 * a counter-reset ordered list with circular numeric badges and a vertical
 * rule connecting consecutive steps.
 */
export function Steps({ children }: StepsProps) {
  return <ol className="docs-steps">{children}</ol>;
}
