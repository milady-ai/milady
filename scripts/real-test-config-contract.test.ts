import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const configPath = path.join(
  import.meta.dirname,
  "..",
  "test",
  "vitest",
  "real.config.ts",
);

describe("real test config contract", () => {
  it("keeps the PR real suite focused on non-e2e coverage", () => {
    const source = fs.readFileSync(configPath, "utf8");

    expect(source).toContain(
      'const isCiReal = process.env.MILADY_CI_REAL === "1";',
    );
    expect(source).toContain('"app-vincent"');
    expect(source).toContain(
      '"eliza/packages/benchmarks/app-eval/evaluate.real.test.ts"',
    );
    expect(source).toContain(
      '"eliza/packages/agent/src/providers/media-provider.real.test.ts"',
    );
    expect(source).toContain(
      '"eliza/apps/app-lifeops/test/lifeops-life-chat.real.test.ts"',
    );
    expect(source).toContain(
      '"eliza/plugins/plugin-shell/typescript/__tests__/shell.real.test.ts"',
    );
    expect(source).toContain('find: "@elizaos/plugin-sql"');
    expect(source).not.toContain("**/*.live.e2e.test.ts");
    expect(source).not.toContain("**/*.real.e2e.test.ts");
  });
});
