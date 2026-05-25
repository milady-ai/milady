import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const homepageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("homepage e2e contracts", () => {
  it("keeps the HTTPS and mocked-clock fixes for the dashboard surface", () => {
    const playwrightConfig = readFileSync(
      path.join(homepageRoot, "playwright.config.ts"),
      "utf8",
    );
    const signInSpec = readFileSync(
      path.join(homepageRoot, "test/e2e/signin.spec.ts"),
      "utf8",
    );

    expect(playwrightConfig).toContain("ignoreHTTPSErrors: true");
    expect(signInSpec).toContain("page.clock.runFor(");
    expect(signInSpec).not.toContain("page.clock.fastForward");
  });
});
