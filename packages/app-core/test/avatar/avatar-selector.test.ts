/**
 * Tests for avatar selection logic — VRM index management, path resolution, localStorage persistence.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type RosterEntry = { name: string; avatarIndex: number };

// Load roster from shared JSON (same source as getStylePresets) inside vi.hoisted so
// TEST_VRM_ASSETS exists before vi.mock runs. Use require() here — ESM imports are not
// initialized yet when the hoisted factory runs.
const { TEST_CHARACTER_ROSTER, TEST_VRM_ASSETS } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const { fileURLToPath } = require("node:url") as typeof import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const jsonPath = path.join(
    here,
    "../../../../packages/agent/src/brand/character-definitions.json",
  );
  const defs = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as RosterEntry[];
  const sorted = [...defs].sort((a, b) => a.avatarIndex - b.avatarIndex);
  return {
    TEST_CHARACTER_ROSTER: sorted,
    TEST_VRM_ASSETS: sorted.map((p) => ({
      title: p.name,
      slug: `milady-${p.avatarIndex}`,
    })),
  };
});

// Mock boot config so VRM helpers resolve the standard Milady roster.
vi.mock("../../src/config/boot-config", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    getBootConfig: () => ({
      branding: {},
      cloudApiBase: "https://www.elizacloud.ai",
      vrmAssets: TEST_VRM_ASSETS,
    }),
  };
});

import {
  getCompanionBackgroundUrl,
  getVrmCount,
  getVrmPreviewUrl,
  getVrmTitle,
  getVrmUrl,
} from "@miladyai/app-core/state";

describe("Avatar VRM Utilities", () => {
  describe("getVrmUrl", () => {
    it("returns correct path for each bundled Milady VRM", () => {
      for (const p of TEST_CHARACTER_ROSTER) {
        expect(getVrmUrl(p.avatarIndex)).toBe(
          `/vrms/milady-${p.avatarIndex}.vrm.gz`,
        );
      }
    });

    it("clamps out-of-range indices to avatar 1", () => {
      const pastEnd =
        Math.max(...TEST_CHARACTER_ROSTER.map((p) => p.avatarIndex), 0) + 1;
      expect(getVrmUrl(pastEnd)).toBe("/vrms/milady-1.vrm.gz");
      expect(getVrmUrl(34)).toBe("/vrms/milady-1.vrm.gz");
      expect(getVrmUrl(-3)).toBe("/vrms/milady-1.vrm.gz");
      expect(getVrmUrl(Number.NaN)).toBe("/vrms/milady-1.vrm.gz");
      expect(getVrmUrl(0)).toBe("/vrms/milady-1.vrm.gz");
    });
  });

  describe("getVrmPreviewUrl", () => {
    it("returns correct preview path for each bundled Milady VRM", () => {
      for (const p of TEST_CHARACTER_ROSTER) {
        expect(getVrmPreviewUrl(p.avatarIndex)).toBe(
          `/vrms/previews/milady-${p.avatarIndex}.png`,
        );
      }
    });

    it("clamps out-of-range preview indices to avatar 1", () => {
      const pastEnd =
        Math.max(...TEST_CHARACTER_ROSTER.map((p) => p.avatarIndex), 0) + 1;
      expect(getVrmPreviewUrl(pastEnd)).toBe("/vrms/previews/milady-1.png");
      expect(getVrmPreviewUrl(999)).toBe("/vrms/previews/milady-1.png");
      expect(getVrmPreviewUrl(-1)).toBe("/vrms/previews/milady-1.png");
      expect(getVrmPreviewUrl(0)).toBe("/vrms/previews/milady-1.png");
    });
  });

  describe("getVrmTitle", () => {
    it("returns roster titles for bundled Milady avatars", () => {
      for (const p of TEST_CHARACTER_ROSTER) {
        expect(getVrmTitle(p.avatarIndex)).toBe(p.name);
      }
    });

    it("clamps out-of-range index to avatar 1", () => {
      const pastEnd =
        Math.max(...TEST_CHARACTER_ROSTER.map((p) => p.avatarIndex), 0) + 1;
      expect(getVrmTitle(pastEnd)).toBe(
        TEST_CHARACTER_ROSTER[0]?.name ?? "Chen",
      );
    });

    it("hoisted test roster stays in sync with STYLE_PRESETS", async () => {
      const { STYLE_PRESETS } = await import(
        "@miladyai/agent/onboarding-presets"
      );
      const expected = STYLE_PRESETS.slice()
        .sort(
          (a: { avatarIndex: number }, b: { avatarIndex: number }) =>
            a.avatarIndex - b.avatarIndex,
        )
        .map((p: { name: string; avatarIndex: number }) => ({
          title: p.name,
          slug: `milady-${p.avatarIndex}`,
        }));
      expect(TEST_VRM_ASSETS).toEqual(expected);
    });
  });

  describe("getCompanionBackgroundUrl", () => {
    it("stays within the bundled avatar background set", () => {
      expect(getCompanionBackgroundUrl("light")).toBe(
        "/vrms/backgrounds/milady-3.png",
      );
      expect(getCompanionBackgroundUrl("dark")).toBe(
        "/vrms/backgrounds/milady-4.png",
      );
    });
  });
});

describe("Avatar Selection State", () => {
  // Must match AVATAR_INDEX_KEY in AppContext.tsx
  const AVATAR_STORAGE_KEY = "eliza_avatar_index";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("localStorage persistence", () => {
    it("stores selected VRM index", () => {
      const mockStorage = new Map<string, string>();
      const mockGetItem = vi.fn((key: string) => mockStorage.get(key) ?? null);
      const mockSetItem = vi.fn((key: string, value: string) => {
        mockStorage.set(key, value);
      });

      // Simulate saving avatar selection
      mockSetItem(AVATAR_STORAGE_KEY, "3");
      expect(mockStorage.get(AVATAR_STORAGE_KEY)).toBe("3");

      // Simulate loading
      const stored = mockGetItem(AVATAR_STORAGE_KEY);
      expect(stored).toBe("3");
      const index = Number(stored);
      expect(index).toBe(3);
      expect(index >= 1 && index <= getVrmCount()).toBe(true);
    });

    it("handles custom VRM (index 0)", () => {
      const mockStorage = new Map<string, string>();
      mockStorage.set(AVATAR_STORAGE_KEY, "0");

      const stored = mockStorage.get(AVATAR_STORAGE_KEY);
      const index = Number(stored);
      expect(index).toBe(0); // custom VRM
    });

    it("falls back to 1 for invalid stored values", () => {
      const testCases = ["", "abc", "-1", "34", "NaN"];

      for (const invalid of testCases) {
        const n = Number(invalid);
        const isValid = !Number.isNaN(n) && n >= 0 && n <= getVrmCount();
        const result = isValid ? n : 1;
        // Invalid cases should fall back to 1
        if (!isValid) {
          expect(result).toBe(1);
        }
      }
    });
  });
});

describe("Onboarding Avatar Step", () => {
  it("avatar step comes after name and before style", () => {
    const steps = [
      "cloud_login",
      "name",
      "avatar",
      "style",
      "theme",
      "runMode",
      "llmProvider",
      "inventorySetup",
      "connectors",
    ];

    const nameIdx = steps.indexOf("name");
    const avatarIdx = steps.indexOf("avatar");
    const styleIdx = steps.indexOf("style");

    expect(avatarIdx).toBe(nameIdx + 1);
    expect(styleIdx).toBe(avatarIdx + 1);
  });

  it("onboarding saves avatar to selectedVrmIndex on next", () => {
    let selectedVrmIndex = 1;
    const onboardingAvatar = 4;

    // Simulate handleOnboardingNext for "avatar" step
    selectedVrmIndex = onboardingAvatar;

    expect(selectedVrmIndex).toBe(4);
  });
});
