// @vitest-environment jsdom

import type { ResolvedContentPack } from "@miladyai/shared/contracts/content-pack";
import { describe, expect, it, vi } from "vitest";
import {
  applyColorScheme,
  applyContentPack,
  type ContentPackApplyDeps,
} from "./apply-pack";

function makeDeps(): ContentPackApplyDeps {
  return {
    setCustomVrmUrl: vi.fn(),
    setCustomBackgroundUrl: vi.fn(),
    setCustomWorldUrl: vi.fn(),
    setSelectedVrmIndex: vi.fn(),
    setOnboardingName: vi.fn(),
    setOnboardingStyle: vi.fn(),
  };
}

function makePack(
  overrides?: Partial<ResolvedContentPack>,
): ResolvedContentPack {
  return {
    manifest: {
      id: "test-pack",
      name: "Test Pack",
      version: "1.0.0",
      assets: {},
    },
    source: { kind: "bundled", id: "test-pack" },
    ...overrides,
  };
}

describe("applyContentPack", () => {
  it("applies custom VRM URL and sets index to 0", () => {
    const deps = makeDeps();
    applyContentPack(makePack({ vrmUrl: "/packs/test/model.vrm.gz" }), deps);
    expect(deps.setCustomVrmUrl).toHaveBeenCalledWith(
      "/packs/test/model.vrm.gz",
    );
    expect(deps.setSelectedVrmIndex).toHaveBeenCalledWith(0);
  });

  it("uses avatarIndex for bundled packs instead of custom URL", () => {
    const deps = makeDeps();
    applyContentPack(
      makePack({ avatarIndex: 3, vrmUrl: "/should/not/be/used" }),
      deps,
    );
    expect(deps.setSelectedVrmIndex).toHaveBeenCalledWith(3);
    expect(deps.setCustomVrmUrl).toHaveBeenCalledWith("");
  });

  it("applies background URL", () => {
    const deps = makeDeps();
    applyContentPack(makePack({ backgroundUrl: "/packs/test/bg.png" }), deps);
    expect(deps.setCustomBackgroundUrl).toHaveBeenCalledWith(
      "/packs/test/bg.png",
    );
  });

  it("applies personality name", () => {
    const deps = makeDeps();
    applyContentPack(makePack({ personality: { name: "Nyx" } }), deps);
    expect(deps.setOnboardingName).toHaveBeenCalledWith("Nyx");
  });

  it("sets onboarding style to pack id for bundled avatar packs", () => {
    const deps = makeDeps();
    applyContentPack(makePack({ avatarIndex: 2 }), deps);
    expect(deps.setOnboardingStyle).toHaveBeenCalledWith("test-pack");
  });

  it("does not override onboarding style for custom packs", () => {
    const deps = makeDeps();
    applyContentPack(
      makePack({
        source: { kind: "url", url: "https://example.com/packs/test-pack/" },
        vrmUrl: "https://example.com/packs/test-pack/model.vrm.gz",
      }),
      deps,
    );
    expect(deps.setOnboardingStyle).not.toHaveBeenCalled();
  });

  it("skips setters for missing assets", () => {
    const deps = makeDeps();
    applyContentPack(makePack(), deps);
    expect(deps.setCustomVrmUrl).not.toHaveBeenCalled();
    expect(deps.setCustomBackgroundUrl).not.toHaveBeenCalled();
    expect(deps.setOnboardingName).not.toHaveBeenCalled();
  });
});

describe("applyColorScheme", () => {
  it("rejects customProperties values containing url() to prevent external requests", () => {
    const root = document.documentElement;
    const cleanup = applyColorScheme({
      accent: "#ff00ff",
      customProperties: {
        "safe-color": "#00ff00",
        "unsafe-bg": "url(https://evil.com/tracker.png)",
        "also-unsafe": "URL( https://evil.com )",
      },
    });

    expect(root.style.getPropertyValue("--safe-color")).toBe("#00ff00");
    expect(root.style.getPropertyValue("--unsafe-bg")).toBe("");
    expect(root.style.getPropertyValue("--also-unsafe")).toBe("");
    expect(root.style.getPropertyValue("--pack-accent")).toBe("#ff00ff");

    cleanup();
    expect(root.style.getPropertyValue("--safe-color")).toBe("");
    expect(root.style.getPropertyValue("--pack-accent")).toBe("");
  });
});
