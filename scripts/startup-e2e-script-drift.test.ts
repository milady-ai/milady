import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");

describe("startup E2E script contract", () => {
  it("runs the explicit startup specs under the E2E config without passWithNoTests", () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const script = pkg.scripts?.["test:startup:e2e"];

    expect(script).toBeDefined();
    expect(script).toContain("bunx vitest run --config vitest.e2e.config.ts");
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
});
