import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const LIVE_E2E_CONFIG_PATH = path.join(ROOT, "vitest.live-e2e.config.ts");

describe("live E2E script contract", () => {
  it("targets the checked-in agent live specs without stale repo-root paths", () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const liveCloudScript = pkg.scripts?.["test:live:cloud"];
    const liveOnboardingScript = pkg.scripts?.["test:live:onboarding"];
    const liveScript = pkg.scripts?.["test:live"];

    expect(liveCloudScript).toBeDefined();
    expect(liveCloudScript).toContain(
      "bunx vitest run --config vitest.live-e2e.config.ts",
    );
    expect(liveCloudScript).toContain(
      "packages/agent/test/cloud-providers.e2e.test.ts",
    );
    expect(liveCloudScript).not.toMatch(
      /(^|\s)test\/cloud-providers\.e2e\.test\.ts(?=\s|$)/,
    );

    expect(liveOnboardingScript).toBeDefined();
    expect(liveOnboardingScript).toContain(
      "bunx vitest run --config vitest.live-e2e.config.ts",
    );
    expect(liveOnboardingScript).toContain(
      "packages/app-core/test/app/onboarding-companion.live.e2e.test.ts",
    );

    expect(liveScript).toBeDefined();
    expect(liveScript).toContain(
      "bunx vitest run --config vitest.live-e2e.config.ts",
    );
    expect(liveScript).toContain("packages/agent/test/wallet-live.e2e.test.ts");
    expect(liveScript).toContain(
      "packages/agent/test/api-auth-live.e2e.test.ts",
    );
    expect(liveScript).toContain(
      "packages/agent/test/cloud-providers.e2e.test.ts",
    );
    expect(liveScript).not.toMatch(
      /(^|\s)test\/wallet-live\.e2e\.test\.ts(?=\s|$)/,
    );
    expect(liveScript).not.toMatch(
      /(^|\s)test\/api-auth-live\.e2e\.test\.ts(?=\s|$)/,
    );
    expect(liveScript).not.toMatch(
      /(^|\s)test\/cloud-providers\.e2e\.test\.ts(?=\s|$)/,
    );
  });

  it("keeps the mixed cloud provider spec in the live config allowlist", () => {
    const config = fs.readFileSync(LIVE_E2E_CONFIG_PATH, "utf8");

    expect(config).toContain(
      '"packages/agent/test/cloud-providers.e2e.test.ts"',
    );
  });
});
