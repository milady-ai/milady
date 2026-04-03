import { describe, expect, it } from "vitest";

import {
  activeServerKindToOnboardingServerTarget,
  buildOnboardingServerSelection,
  resolveOnboardingServerTarget,
} from "./server-target";

describe("server-target", () => {
  it("resolves the canonical onboarding server target from legacy fields", () => {
    expect(
      resolveOnboardingServerTarget({ runMode: "", cloudProvider: "" }),
    ).toBe("");
    expect(
      resolveOnboardingServerTarget({ runMode: "local", cloudProvider: "" }),
    ).toBe("local");
    expect(
      resolveOnboardingServerTarget({
        runMode: "cloud",
        cloudProvider: "remote",
      }),
    ).toBe("remote");
    expect(
      resolveOnboardingServerTarget({
        runMode: "cloud",
        cloudProvider: "elizacloud",
      }),
    ).toBe("elizacloud");
  });

  it("builds the legacy onboarding field pair from the canonical target", () => {
    expect(buildOnboardingServerSelection("")).toEqual({
      runMode: "",
      cloudProvider: "",
    });
    expect(buildOnboardingServerSelection("local")).toEqual({
      runMode: "local",
      cloudProvider: "",
    });
    expect(buildOnboardingServerSelection("remote")).toEqual({
      runMode: "cloud",
      cloudProvider: "remote",
    });
    expect(buildOnboardingServerSelection("elizacloud")).toEqual({
      runMode: "cloud",
      cloudProvider: "elizacloud",
    });
  });

  it("maps persisted active-server kinds to onboarding targets", () => {
    expect(activeServerKindToOnboardingServerTarget("local")).toBe("local");
    expect(activeServerKindToOnboardingServerTarget("remote")).toBe("remote");
    expect(activeServerKindToOnboardingServerTarget("cloud")).toBe(
      "elizacloud",
    );
  });
});
