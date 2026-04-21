import type { Tab } from "@miladyai/app-core/navigation";
import { describe, expect, it } from "vitest";
import {
  ACCENT_COLORS,
  accentForegroundVar,
  accentSubtleVar,
  accentVar,
  COMPANION_OVERLAY_TABS,
  cardSizeClass,
  overlayBackdropClass,
  TOP_BAR_COLORS,
  tabFlags,
  viewWrapperStyle,
} from "./companion-shell-styles";

describe("COMPANION_OVERLAY_TABS", () => {
  it("contains only companion — settings/character/skills etc. require native mode", () => {
    expect(COMPANION_OVERLAY_TABS.has("companion")).toBe(true);
  });

  it("does not treat other tabs as companion overlay", () => {
    expect(COMPANION_OVERLAY_TABS.has("chat")).toBe(false);
    expect(COMPANION_OVERLAY_TABS.has("settings")).toBe(false);
    expect(COMPANION_OVERLAY_TABS.has("skills")).toBe(false);
  });
});

describe("tabFlags", () => {
  const advancedOverlayTabs: Tab[] = [
    "advanced",
    "fine-tuning",
    "trajectories",
    "relationships",
    "runtime",
    "database",
    "logs",
  ];

  for (const tab of advancedOverlayTabs) {
    it(`${tab} is an advanced overlay`, () => {
      expect(tabFlags(tab).isAdvancedOverlay).toBe(true);
      expect(tabFlags(tab).isCentered).toBe(true);
    });
  }

  it("keeps non-advanced tabs out of the advanced overlay bucket", () => {
    expect(tabFlags("chat").isAdvancedOverlay).toBe(false);
    expect(tabFlags("stream").isAdvancedOverlay).toBe(false);
    expect(tabFlags("triggers").isAdvancedOverlay).toBe(false);
    expect(tabFlags("inventory").isAdvancedOverlay).toBe(false);
    expect(tabFlags("settings").isAdvancedOverlay).toBe(false);
    expect(tabFlags("knowledge").isAdvancedOverlay).toBe(false);
  });

  it("treats triggers as a settings-style layout", () => {
    expect(tabFlags("triggers").isSettings).toBe(true);
    expect(tabFlags("triggers").isCentered).toBe(true);
  });

  it("reports individual flags consistently", () => {
    expect(tabFlags("skills").isSkills).toBe(true);
    expect(tabFlags("stream").isStream).toBe(true);
    expect(tabFlags("inventory").isWallets).toBe(true);
    expect(tabFlags("character").isCharacter).toBe(true);
    expect(tabFlags("character-select").isCharacter).toBe(true);
    expect(tabFlags("advanced").isSkills).toBe(false);
    expect(tabFlags("advanced").isStream).toBe(false);
    expect(tabFlags("advanced").isCharacter).toBe(false);
    expect(tabFlags("advanced").isWallets).toBe(false);
  });
});

describe("derived style helpers", () => {
  it("gives advanced overlays the large centered card layout", () => {
    const classes = cardSizeClass(tabFlags("advanced"));
    expect(classes).toContain("w-[95vw]");
    expect(classes).toContain("h-[95vh]");
    expect(classes).toContain("rounded-2xl");
    expect(classes).toContain("overflow-hidden");
  });

  it("gives advanced overlays the dark blurred backdrop", () => {
    const classes = overlayBackdropClass(tabFlags("advanced"));
    expect(classes).toContain("backdrop-blur-2xl");
    expect(classes).toContain("bg-black/50");
    expect(classes).toContain("pointer-events-auto");
  });

  it("keeps chat as the base view without backdrop", () => {
    expect(overlayBackdropClass(tabFlags("chat"))).toBe("opacity-0");
  });

  it("uses the default accent for generic advanced overlays", () => {
    const flags = tabFlags("advanced");
    expect(accentVar(flags)).toBe("#f0b90b");
    expect(accentSubtleVar(flags)).toBe("rgba(240, 185, 11, 0.12)");
  });

  it("keeps special-case accents for stream and wallets", () => {
    expect(accentVar(tabFlags("stream"))).toBe("#ef4444");
    expect(accentVar(tabFlags("inventory"))).toBe("#f0b90b");
  });

  it("keeps card surfaces non-transparent in base chat shell (with pack fallback)", () => {
    const style = viewWrapperStyle(tabFlags("chat"), "#7b8fb5");
    expect(style["--card"]).toContain("rgba(255, 255, 255, 0.05)");
  });

  it("uses dark accent foregrounds for yellow companion tabs", () => {
    expect(accentForegroundVar(tabFlags("inventory"))).toBe("#1a1f26");
    expect(accentForegroundVar(tabFlags("skills"))).toBe("#1a1f26");
    expect(accentForegroundVar(tabFlags("knowledge"))).toBe("#ffffff");
  });
});

describe("App.tsx advanced-tab parity", () => {
  const advancedParityTabs: Tab[] = [
    "advanced",
    "fine-tuning",
    "trajectories",
    "relationships",
    "runtime",
    "database",
    "logs",
  ];

  for (const tab of advancedParityTabs) {
    it(`${tab} stays aligned with the native-shell advanced layout contract`, () => {
      expect(tabFlags(tab).isAdvancedOverlay).toBe(true);
    });
  }
});

describe("accent palettes", () => {
  it("keeps stable accent constants", () => {
    expect(ACCENT_COLORS.stream).toBe("#ef4444");
    expect(ACCENT_COLORS.skills).toBe("#f0b90b");
    expect(TOP_BAR_COLORS.stream).toContain("239, 68, 68");
  });
});
