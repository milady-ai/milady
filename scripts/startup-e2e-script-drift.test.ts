import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const E2E_CONFIG_PATH = path.join(ROOT, "vitest.e2e.config.ts");
const STARTUP_E2E_CONFIG_PATH = path.join(ROOT, "vitest.startup-e2e.config.ts");
const TEST_PARALLEL_PATH = path.join(
  ROOT,
  "test",
  "scripts",
  "test-parallel.mjs",
);

describe("startup E2E script contract", () => {
  it("runs the explicit startup specs under the dedicated startup E2E config without passWithNoTests", () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const script = pkg.scripts?.["test:startup:e2e"];

    expect(script).toBeDefined();
    expect(script).toContain(
      "bunx vitest run --config vitest.startup-e2e.config.ts",
    );
    expect(script).not.toContain("--passWithNoTests");
    expect(script).toContain(
      "packages/app-core/test/app/startup-chat.e2e.test.ts",
    );
    expect(script).toContain(
      "packages/app-core/test/app/startup-onboarding.e2e.test.ts",
    );
    expect(script).toContain(
      "packages/app-core/test/app/startup-backend-missing.e2e.test.ts",
    );
    expect(script).toContain(
      "packages/app-core/test/app/startup-token-401.e2e.test.ts",
    );
  });

  it("keeps the shared e2e config from re-running the startup specs", () => {
    const config = fs.readFileSync(E2E_CONFIG_PATH, "utf8");

    expect(config).toContain(
      '"packages/app-core/test/app/startup-chat.e2e.test.ts"',
    );
    expect(config).toContain(
      '"packages/app-core/test/app/startup-onboarding.e2e.test.ts"',
    );
    expect(config).toContain(
      '"packages/app-core/test/app/startup-backend-missing.e2e.test.ts"',
    );
    expect(config).toContain(
      '"packages/app-core/test/app/startup-token-401.e2e.test.ts"',
    );
  });

  it("runs startup e2e as a dedicated step in the full test wrapper", () => {
    const runner = fs.readFileSync(TEST_PARALLEL_PATH, "utf8");

    expect(runner).toContain('name: "startup-e2e"');
    expect(runner).toContain('args: ["run", "test:startup:e2e"]');
  });

  it("invokes the runtime helper through node so root scripts stay Windows-safe", () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const scriptsUsingRuntimeHelper = Object.entries(pkg.scripts ?? {}).filter(
      ([, script]) => script.includes("scripts/rt.mjs"),
    );

    expect(scriptsUsingRuntimeHelper.length).toBeGreaterThan(0);

    for (const [, script] of scriptsUsingRuntimeHelper) {
      expect(script).toContain("node scripts/rt.mjs");
      expect(script).not.toContain("&& scripts/rt.sh");
      expect(script).not.toMatch(/^scripts\/rt\.sh\b/);
    }
  });

  it("uses an isolated startup E2E config to prevent cross-file mock bleed", () => {
    const config = fs.readFileSync(STARTUP_E2E_CONFIG_PATH, "utf8");

    expect(config).toContain("isolate: true");
    expect(config).toContain("fileParallelism: false");
    expect(config).toContain('pool: "forks"');
    expect(config).not.toContain("poolOptions:");
    expect(config).toContain("maxWorkers: 1");
    expect(config).toContain('execArgv: ["--max-old-space-size=4096"]');
  });

  it("uses Vitest 4 top-level worker options in the shared E2E config", () => {
    const config = fs.readFileSync(E2E_CONFIG_PATH, "utf8");

    expect(config).toContain("isolate: true");
    expect(config).toContain("fileParallelism: false");
    expect(config).toContain('pool: "forks"');
    expect(config).not.toContain("poolOptions:");
    expect(config).toContain("maxWorkers: 1");
    expect(config).toContain('execArgv: ["--max-old-space-size=4096"]');
  });
});
