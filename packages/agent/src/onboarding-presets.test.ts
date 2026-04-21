import { describe, expect, it } from "vitest";
import {
  getPresetNameMap,
  getStylePresets,
  STYLE_PRESETS,
} from "./onboarding-presets";

describe("getStylePresets", () => {
  it("returns the STYLE_PRESETS array", () => {
    expect(getStylePresets()).toBe(STYLE_PRESETS);
  });

  it("returns a non-empty array of presets with required fields", () => {
    const presets = getStylePresets();
    expect(presets.length).toBeGreaterThan(0);
    for (const preset of presets) {
      expect(preset).toHaveProperty("catchphrase");
      expect(preset).toHaveProperty("hint");
      expect(preset).toHaveProperty("bio");
      expect(preset).toHaveProperty("system");
    }
  });

  it("keeps the richer English examples in the canonical roster", () => {
    const chen = STYLE_PRESETS.find((preset) => preset.id === "chen");
    const jin = STYLE_PRESETS.find((preset) => preset.id === "jin");

    expect(chen?.postExamples).toContain("goodnight, everyone");
    expect(chen?.messageExamples).toEqual(
      expect.arrayContaining([
        [
          {
            user: "{{user1}}",
            content: { text: "thanks for listening" },
          },
          {
            user: "{{agentName}}",
            content: { text: "always here for you" },
          },
        ],
      ]),
    );
    expect(jin?.postExamples).toContain(
      "most meetings should be pull requests.",
    );
  });
});

describe("getPresetNameMap", () => {
  it("returns a name → catchphrase mapping", () => {
    const map = getPresetNameMap();
    expect(typeof map).toBe("object");
    for (const [name, catchphrase] of Object.entries(map)) {
      expect(typeof name).toBe("string");
      expect(typeof catchphrase).toBe("string");
      expect(name.length).toBeGreaterThan(0);
      expect(catchphrase.length).toBeGreaterThan(0);
    }
  });

  it("contains one entry per STYLE_PRESETS entry", () => {
    const map = getPresetNameMap();
    expect(Object.keys(map).length).toBe(STYLE_PRESETS.length);
    for (const preset of STYLE_PRESETS) {
      expect(map[preset.name]).toBe(preset.catchphrase);
    }
  });

  it("maps are consistent with STYLE_PRESETS catchphrases", () => {
    const map = getPresetNameMap();
    const validCatchphrases = new Set(
      getStylePresets().map((p) => p.catchphrase),
    );
    for (const catchphrase of Object.values(map)) {
      expect(validCatchphrases.has(catchphrase)).toBe(true);
    }
  });
});
