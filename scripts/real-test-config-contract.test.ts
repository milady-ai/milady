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
const packageJsonPath = path.join(import.meta.dirname, "..", "package.json");

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

  it("runs the action invocation E2E suite with the live-e2e config", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const actionE2eScript = packageJson.scripts?.["test:action-e2e"];

    expect(actionE2eScript).toContain("test/vitest/live-e2e.config.ts");
    expect(actionE2eScript).toContain(
      "eliza/packages/app-core/test/live-agent/action-invocation.live.e2e.test.ts",
    );
  });
});
