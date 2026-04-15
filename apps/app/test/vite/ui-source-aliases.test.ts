import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config";

type ViteAlias = {
  find: RegExp | string;
  replacement: string;
};

function resolveAlias(specifier: string): string | null {
  const aliases = (viteConfig.resolve?.alias ?? []) as ViteAlias[];

  for (const alias of aliases) {
    if (alias.find instanceof RegExp) {
      if (alias.find.test(specifier)) {
        return specifier.replace(alias.find, alias.replacement);
      }
      continue;
    }

    if (alias.find === specifier) {
      return alias.replacement;
    }
  }

  return null;
}

describe("workspace ui source aliases", () => {
  it("maps generic @elizaos/ui component subpaths to local source files", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "../../../..");

    expect(resolveAlias("@elizaos/ui/components/shell/Header")).toBe(
      path.join(repoRoot, "eliza/packages/ui/src/components/shell/Header.tsx"),
    );
  });
});
