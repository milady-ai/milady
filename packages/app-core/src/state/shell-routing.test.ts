import { describe, expect, it } from "vitest";
import { COMPANION_ENABLED } from "../navigation";
import {
  deriveUiShellModeForTab,
  getTabForShellView,
  shouldStartAtCharacterSelectOnLaunch,
} from "./shell-routing";

describe("shouldStartAtCharacterSelectOnLaunch", () => {
  const baseParams = {
    onboardingNeedsOptions: false,
    onboardingMode: "basic" as const,
    navPath: "/",
    urlTab: null,
  };

  it("always returns false (character-select auto-redirect is disabled)", () => {
    expect(shouldStartAtCharacterSelectOnLaunch(baseParams)).toBe(false);
  });

  it("returns false even when onboarding does not need options", () => {
    expect(
      shouldStartAtCharacterSelectOnLaunch({
        ...baseParams,
        onboardingNeedsOptions: false,
      }),
    ).toBe(false);
  });

  it("returns false when onboardingMode is elizacloudonly", () => {
    expect(
      shouldStartAtCharacterSelectOnLaunch({
        ...baseParams,
        onboardingMode: "elizacloudonly",
      }),
    ).toBe(false);
  });

  it("returns false when onboardingNeedsOptions is true", () => {
    expect(
      shouldStartAtCharacterSelectOnLaunch({
        ...baseParams,
        onboardingNeedsOptions: true,
      }),
    ).toBe(false);
  });

  it("returns false regardless of navPath", () => {
    expect(
      shouldStartAtCharacterSelectOnLaunch({
        ...baseParams,
        navPath: "/companion",
      }),
    ).toBe(false);
  });

  it("returns false regardless of urlTab", () => {
    expect(
      shouldStartAtCharacterSelectOnLaunch({
        ...baseParams,
        urlTab: "chat",
      }),
    ).toBe(false);
  });
});

describe("deriveUiShellModeForTab", () => {
  it("returns companion for the companion tab", () => {
    expect(deriveUiShellModeForTab("companion")).toBe("companion");
  });

  it("returns native for the chat tab", () => {
    expect(deriveUiShellModeForTab("chat")).toBe("native");
  });

  it("returns native for non-companion tabs (runtime switching)", () => {
    // Users can freely switch between native and companion mode at runtime.
    // deriveUiShellModeForTab must correctly return "native" for all
    // non-companion tabs so mode switching keeps working.
    for (const tab of [
      "chat",
      "plugins",
      "knowledge",
      "inventory",
      "stream",
    ] as const) {
      expect(deriveUiShellModeForTab(tab)).toBe("native");
    }
  });
});

describe("startup tab default (regression: no base-UI flash)", () => {
  // Regression: tab previously defaulted to "chat", which rendered the
  // native/base UI on first paint. An async effect later switched to
  // "companion", causing a visible flash. The initial tab must be
  // "companion" when COMPANION_ENABLED so the very first render shows
  // companion mode — but users can still switch to native mode afterwards.
  it("initial tab defaults to companion when COMPANION_ENABLED", () => {
    const initialTab = COMPANION_ENABLED ? "companion" : "chat";
    if (COMPANION_ENABLED) {
      expect(initialTab).toBe("companion");
      expect(deriveUiShellModeForTab(initialTab)).toBe("companion");
    } else {
      expect(initialTab).toBe("chat");
      expect(deriveUiShellModeForTab(initialTab)).toBe("native");
    }
  });
});

describe("getTabForShellView", () => {
  it("returns companion for companion view", () => {
    expect(getTabForShellView("companion", "chat")).toBe("companion");
  });

  it("returns character for character view (not character-select)", () => {
    const result = getTabForShellView("character", "chat");
    expect(result).toBe("character");
    expect(result).not.toBe("character-select");
  });

  it("returns the lastNativeTab for desktop view", () => {
    expect(getTabForShellView("desktop", "chat")).toBe("chat");
    expect(getTabForShellView("desktop", "plugins")).toBe("plugins");
    expect(getTabForShellView("desktop", "inventory")).toBe("inventory");
  });

  it("uses whatever lastNativeTab is passed for desktop view", () => {
    expect(getTabForShellView("desktop", "knowledge")).toBe("knowledge");
  });

  it("falls back to chat if lastNativeTab is character-select", () => {
    expect(getTabForShellView("desktop", "character-select")).toBe("chat");
  });

  it("falls back to chat if lastNativeTab is companion", () => {
    expect(getTabForShellView("desktop", "companion")).toBe("chat");
  });
});
