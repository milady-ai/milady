import { describe, expect, it } from "vitest";

// normalizeOnboardingStep is not exported from persistence.ts — we test it
// indirectly by verifying the valid and invalid step values the module documents.
// The function is the whitelist guard for localStorage persistence; its contract
// is: valid step strings pass through, anything else returns null.

// Import the load/save helpers that call normalizeOnboardingStep internally so
// we can verify the contract without re-exporting the private function.
import {
  applyUiTheme,
  clearPersistedOnboardingStep,
  loadCompanionAnimateWhenHidden,
  loadCompanionHalfFramerateMode,
  loadCompanionMessageCutoffTs,
  loadCompanionVrmPowerMode,
  loadLastNativeTab,
  loadPersistedActivePackUrl,
  loadPersistedOnboardingStep,
  loadUiTheme,
  normalizeCompanionHalfFramerateMode,
  normalizeCompanionVrmPowerMode,
  saveCompanionAnimateWhenHidden,
  saveCompanionHalfFramerateMode,
  saveCompanionVrmPowerMode,
  saveLastNativeTab,
  saveOnboardingStep,
  savePersistedActivePackUrl,
  saveUiTheme,
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
    "identity",
    "providers",
  ] as const)("accepts valid step %s", (step) => {
    withLocalStorageStub(() => {
      saveOnboardingStep(step);
      expect(loadPersistedOnboardingStep()).toBe(step);
    });
  });

  it.each([
    ["hosting", "providers"],
    ["connection", "providers"],
    ["cloudLogin", "providers"],
    ["rpc", "providers"],
    ["voice", "providers"],
    ["senses", "providers"],
    ["permissions", "providers"],
    ["launch", "providers"],
    ["activate", "providers"],
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
      saveOnboardingStep("providers");
      clearPersistedOnboardingStep();
      expect(loadPersistedOnboardingStep()).toBeNull();
    });
  });
});

describe("theme persistence", () => {
  it("prefers the current theme key and mirrors saves to the legacy key", () => {
    withLocalStorageStub(() => {
      saveUiTheme("light");
      expect(localStorage.getItem("eliza:ui-theme")).toBe("light");
      expect(localStorage.getItem("milady:ui-theme")).toBe("light");
      expect(loadUiTheme()).toBe("light");
    });
  });

  it("falls back to the legacy Milady theme key when needed", () => {
    withLocalStorageStub(() => {
      localStorage.setItem("milady:ui-theme", "light");
      expect(loadUiTheme()).toBe("light");
    });
  });

  it("applies the theme to the document root selectors", () => {
    const previousDocument = (globalThis as Record<string, unknown>).document;
    let attributeWrites = 0;
    let addCalls = 0;
    let removeCalls = 0;
    const root = {
      dataset: {},
      style: {
        colorScheme: "",
      },
      classList: {
        add: (value: string) => {
          addCalls += 1;
          classes.add(value);
        },
        remove: (value: string) => {
          removeCalls += 1;
          classes.delete(value);
        },
        contains: (value: string) => classes.has(value),
      },
      getAttribute: (name: string) => attributes[name] ?? null,
      setAttribute: (name: string, value: string) => {
        attributeWrites += 1;
        attributes[name] = value;
      },
    };
    const classes = new Set<string>();
    const attributes: Record<string, string> = {};

    (globalThis as Record<string, unknown>).document = {
      documentElement: root,
    };

    try {
      applyUiTheme("light");
      expect(attributes["data-theme"]).toBe("light");
      expect(classes.has("dark")).toBe(false);
      expect(root.style.colorScheme).toBe("light");

      applyUiTheme("dark");
      expect(attributes["data-theme"]).toBe("dark");
      expect(classes.has("dark")).toBe(true);
      expect(root.style.colorScheme).toBe("dark");

      const writesAfterDark = attributeWrites;
      const addsAfterDark = addCalls;
      const removesAfterDark = removeCalls;

      applyUiTheme("dark");
      expect(attributeWrites).toBe(writesAfterDark);
      expect(addCalls).toBe(addsAfterDark);
      expect(removeCalls).toBe(removesAfterDark);
    } finally {
      if (previousDocument === undefined) {
        delete (globalThis as Record<string, unknown>).document;
      } else {
        (globalThis as Record<string, unknown>).document = previousDocument;
      }
    }
  });
});

describe("content pack persistence", () => {
  it("round-trips the persisted custom pack URL and clears it", () => {
    withLocalStorageStub(() => {
      expect(loadPersistedActivePackUrl()).toBeNull();
      savePersistedActivePackUrl("https://example.com/packs/neo/");
      expect(loadPersistedActivePackUrl()).toBe(
        "https://example.com/packs/neo/",
      );
      savePersistedActivePackUrl(null);
      expect(loadPersistedActivePackUrl()).toBeNull();
    });
  });
});

describe("companion message cutoff persistence", () => {
  it("defaults to zero when unset", () => {
    withLocalStorageStub(() => {
      expect(loadCompanionMessageCutoffTs()).toBe(0);
    });
  });

  it("defaults to zero when the stored value is invalid", () => {
    withLocalStorageStub(() => {
      localStorage.setItem("eliza:chat:companionMessageCutoffTs", "bogus");
      expect(loadCompanionMessageCutoffTs()).toBe(0);
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

describe("last native tab persistence", () => {
  it("round-trips advanced routed tabs that should remain addressable", () => {
    withLocalStorageStub(() => {
      saveLastNativeTab("trajectories");
      expect(loadLastNativeTab()).toBe("trajectories");

      saveLastNativeTab("relationships");
      expect(loadLastNativeTab()).toBe("relationships");

      saveLastNativeTab("desktop");
      expect(loadLastNativeTab()).toBe("desktop");
    });
  });
});
