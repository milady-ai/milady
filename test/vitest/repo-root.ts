import { resolveRepoRoot } from "../../scripts/lib/repo-root.mjs";

/** Repository root (parent of `test/`). */
export const repoRoot = resolveRepoRoot(import.meta.url, 2);
