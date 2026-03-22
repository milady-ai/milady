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

  it("returns a non-empty array", () => {
    expect(getStylePresets().length).toBeGreaterThan(0);
  });
});

describe("getPresetNameMap", () => {
  it("returns a name→catchphrase mapping for every STYLE_PRESETS entry", () => {
    const map = getPresetNameMap();
    expect(Object.keys(map).length).toBe(STYLE_PRESETS.length);
    for (const entry of STYLE_PRESETS) {
      expect(map[entry.name]).toBe(entry.catchphrase);
    }
  });

  it("keys match STYLE_PRESETS names exactly", () => {
    const map = getPresetNameMap();
    const expectedNames = STYLE_PRESETS.map((e) => e.name);
    expect(Object.keys(map).sort()).toEqual(expectedNames.sort());
  });
});
