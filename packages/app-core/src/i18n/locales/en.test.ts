import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("English onboarding translations", () => {
  it("includes the identity step labels used by the onboarding nav", () => {
    const locale = JSON.parse(
      readFileSync(new URL("./en.json", import.meta.url), "utf8"),
    ) as Record<string, string>;

    expect(locale["onboarding.stepName.identity"]).toBe("Identity");
    expect(locale["onboarding.stepSub.identity"]).toBe("Choose your style");
  });
});
