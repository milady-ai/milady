import { describe, expect, it } from "vitest";

// normalizeOnboardingStep is not exported from persistence.ts — we test it
// indirectly by verifying the valid and invalid step values the module documents.
// The function is the whitelist guard for localStorage persistence; its contract
// is: valid step strings pass through, anything else returns null.

// Import the load/save helpers that call normalizeOnboardingStep internally so
// we can verify the contract without re-exporting the private function.
import {
  clearPersistedOnboardingStep,
  loadCompanionAnimateWhenHidden,
  loadCompanionHalfFramerateMode,
  loadCompanionVrmPowerMode,
  loadPersistedOnboardingStep,
  normalizeCompanionHalfFramerateMode,
  normalizeCompanionVrmPowerMode,
  saveCompanionAnimateWhenHidden,
  saveCompanionHalfFramerateMode,
  saveCompanionVrmPowerMode,
  saveOnboardingStep,
} from "./persistence";

// We need a localStorage-like environment. Vitest (jsdom not configured here)
// may not have localStorage, so we provide a minimal in-memory stub.
function withLocalStorageStub(fn: () => void) {
  const store: Record<string, string> = {};
  const stub = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
  const original = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = stub;
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete (globalThis as Record<string, unknown>).localStorage;
    } else {
      (globalThis as Record<string, unknown>).localStorage = original;
    }
  }
}

describe("normalizeOnboardingStep (via load/save helpers)", () => {
  it.each([
    "welcome",
    "hosting",
    "providers",
    "permissions",
    "launch",
  ] as const)("accepts valid step %s", (step) => {
    withLocalStorageStub(() => {
      saveOnboardingStep(step);
      expect(loadPersistedOnboardingStep()).toBe(step);
    });
  });

  it.each([
    ["connection", "hosting"],
    ["cloudLogin", "providers"],
    ["identity", "providers"],
    ["rpc", "providers"],
    ["senses", "permissions"],
    ["activate", "launch"],
  ] as const)("migrates legacy step %s to %s", (legacy, expected) => {
    withLocalStorageStub(() => {
      localStorage.setItem("eliza:onboarding:step", legacy);
      expect(loadPersistedOnboardingStep()).toBe(expected);
    });
  });

  it("returns null for an invalid step value", () => {
    withLocalStorageStub(() => {
      // Write an arbitrary invalid string directly into localStorage
      localStorage.setItem("eliza:onboarding:step", "saveKeys");
      expect(loadPersistedOnboardingStep()).toBeNull();
    });
  });

  it("returns null for the old-only step name saveKeys", () => {
    withLocalStorageStub(() => {
      localStorage.setItem("eliza:onboarding:step", "saveKeys");
      expect(loadPersistedOnboardingStep()).toBeNull();
    });
  });

  it("returns null for completely unknown step names", () => {
    withLocalStorageStub(() => {
      localStorage.setItem("eliza:onboarding:step", "bogus-step");
      expect(loadPersistedOnboardingStep()).toBeNull();
    });
  });

  it("returns null for numeric strings", () => {
    withLocalStorageStub(() => {
      localStorage.setItem("eliza:onboarding:step", "42");
      expect(loadPersistedOnboardingStep()).toBeNull();
    });
  });

  it("returns null when localStorage is empty (no step saved)", () => {
    withLocalStorageStub(() => {
      clearPersistedOnboardingStep();
      expect(loadPersistedOnboardingStep()).toBeNull();
    });
  });

  it("returns null after clearPersistedOnboardingStep is called", () => {
    withLocalStorageStub(() => {
      saveOnboardingStep("hosting");
      clearPersistedOnboardingStep();
      expect(loadPersistedOnboardingStep()).toBeNull();
    });
  });
});

describe("companion VRM power mode persistence", () => {
  it("defaults to balanced when unset", () => {
    withLocalStorageStub(() => {
      expect(loadCompanionVrmPowerMode()).toBe("balanced");
    });
  });

  it("round-trips quality, balanced, and efficiency", () => {
    withLocalStorageStub(() => {
      saveCompanionVrmPowerMode("quality");
      expect(loadCompanionVrmPowerMode()).toBe("quality");
      saveCompanionVrmPowerMode("efficiency");
      expect(loadCompanionVrmPowerMode()).toBe("efficiency");
      saveCompanionVrmPowerMode("balanced");
      expect(loadCompanionVrmPowerMode()).toBe("balanced");
    });
  });

  it("migrates legacy companion-efficiency on", () => {
    withLocalStorageStub(() => {
      localStorage.setItem("eliza:companion-efficiency", "1");
      expect(loadCompanionVrmPowerMode()).toBe("efficiency");
      expect(localStorage.getItem("eliza:companion-vrm-power")).toBe(
        "efficiency",
      );
      expect(localStorage.getItem("eliza:companion-efficiency")).toBeNull();
    });
  });

  it("migrates legacy quality-on-battery on when efficiency off", () => {
    withLocalStorageStub(() => {
      localStorage.setItem("eliza:companion-efficiency", "0");
      localStorage.setItem("eliza:companion-quality-on-battery", "1");
      expect(loadCompanionVrmPowerMode()).toBe("quality");
      expect(
        localStorage.getItem("eliza:companion-quality-on-battery"),
      ).toBeNull();
    });
  });

  it("normalizeCompanionVrmPowerMode coerces unknown to balanced", () => {
    expect(normalizeCompanionVrmPowerMode("nope")).toBe("balanced");
    expect(normalizeCompanionVrmPowerMode("quality")).toBe("quality");
  });
});

describe("companion half-framerate mode persistence", () => {
  it("defaults to when_saving_power when unset", () => {
    withLocalStorageStub(() => {
      expect(loadCompanionHalfFramerateMode()).toBe("when_saving_power");
    });
  });

  it("round-trips off, when_saving_power, and always", () => {
    withLocalStorageStub(() => {
      saveCompanionHalfFramerateMode("off");
      expect(loadCompanionHalfFramerateMode()).toBe("off");
      saveCompanionHalfFramerateMode("always");
      expect(loadCompanionHalfFramerateMode()).toBe("always");
      saveCompanionHalfFramerateMode("when_saving_power");
      expect(loadCompanionHalfFramerateMode()).toBe("when_saving_power");
    });
  });

  it("normalizeCompanionHalfFramerateMode coerces unknown to when_saving_power", () => {
    expect(normalizeCompanionHalfFramerateMode("nope")).toBe(
      "when_saving_power",
    );
    expect(normalizeCompanionHalfFramerateMode("always")).toBe("always");
  });
});

describe("companion animate when hidden persistence", () => {
  it("defaults to false when unset", () => {
    withLocalStorageStub(() => {
      expect(loadCompanionAnimateWhenHidden()).toBe(false);
    });
  });

  it("round-trips true and false", () => {
    withLocalStorageStub(() => {
      saveCompanionAnimateWhenHidden(true);
      expect(loadCompanionAnimateWhenHidden()).toBe(true);
      expect(localStorage.getItem("eliza:companion-animate-when-hidden")).toBe(
        "1",
      );
      saveCompanionAnimateWhenHidden(false);
      expect(loadCompanionAnimateWhenHidden()).toBe(false);
      expect(localStorage.getItem("eliza:companion-animate-when-hidden")).toBe(
        "0",
      );
    });
  });
});
