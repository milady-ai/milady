import { describe, expect, it } from "vitest";
import {
  replaceNameTokens,
  shouldApplyPresetDefaults,
} from "./character-editor-helpers";

describe("replaceNameTokens", () => {
  it("replaces {{name}} with the character name", () => {
    expect(replaceNameTokens("Hello {{name}}, welcome!", "Momo")).toBe(
      "Hello Momo, welcome!",
    );
  });

  it("replaces {{agentName}} with the character name", () => {
    expect(replaceNameTokens("I am {{agentName}}", "Chen")).toBe("I am Chen");
  });

  it("replaces multiple occurrences of both tokens", () => {
    const input = "{{name}} here. Call me {{name}} or {{agentName}}.";
    expect(replaceNameTokens(input, "Momo")).toBe(
      "Momo here. Call me Momo or Momo.",
    );
  });

  it("returns the string unchanged when no tokens present", () => {
    expect(replaceNameTokens("Just a normal bio", "Momo")).toBe(
      "Just a normal bio",
    );
  });

  it("handles empty name gracefully", () => {
    expect(replaceNameTokens("Hi {{name}}", "")).toBe("Hi ");
  });

  it("handles empty input string", () => {
    expect(replaceNameTokens("", "Momo")).toBe("");
  });
});

describe("shouldApplyPresetDefaults", () => {
  it("returns true when there is no meaningful content", () => {
    expect(shouldApplyPresetDefaults(false, "Chen", "Momo")).toBe(true);
  });

  it("returns true when saved name is null (no saved character)", () => {
    expect(shouldApplyPresetDefaults(true, null, "Momo")).toBe(true);
  });

  it("returns true when saved name is undefined", () => {
    expect(shouldApplyPresetDefaults(true, undefined, "Momo")).toBe(true);
  });

  it("returns true when saved name differs from roster entry (preset switch)", () => {
    expect(shouldApplyPresetDefaults(true, "Chen", "Momo")).toBe(true);
  });

  it("returns false when saved name matches roster entry (same character)", () => {
    expect(shouldApplyPresetDefaults(true, "Chen", "Chen")).toBe(false);
  });

  it("is case-insensitive when comparing names", () => {
    expect(shouldApplyPresetDefaults(true, "chen", "Chen")).toBe(false);
    expect(shouldApplyPresetDefaults(true, "MOMO", "momo")).toBe(false);
  });

  it("trims whitespace when comparing names", () => {
    expect(shouldApplyPresetDefaults(true, "  Chen  ", "Chen")).toBe(false);
    expect(shouldApplyPresetDefaults(true, "Chen", "  Chen  ")).toBe(false);
  });
});
