// Ambient types for .mdx imports in apps/web/.
// @types/mdx provides a module declaration for *.mdx that exports the MDX
// component as default, but declaring it here locally makes it obvious to
// readers where the TS support comes from without a separate tsconfig
// reference.

declare module "*.mdx" {
  import type { MDXProps } from "mdx/types";
  import type { ComponentType } from "react";

  export const frontmatter: Record<string, unknown> | undefined;
  const MDXComponent: ComponentType<MDXProps>;
  export default MDXComponent;
}
