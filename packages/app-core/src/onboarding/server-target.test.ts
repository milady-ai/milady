import { describe, expect, it } from "vitest";

import { activeServerKindToOnboardingServerTarget } from "./server-target";

describe("server-target", () => {
  it("maps persisted active-server kinds to onboarding targets", () => {
    expect(activeServerKindToOnboardingServerTarget("local")).toBe("local");
    expect(activeServerKindToOnboardingServerTarget("remote")).toBe("remote");
    expect(activeServerKindToOnboardingServerTarget("cloud")).toBe(
      "elizacloud",
    );
  });
});
