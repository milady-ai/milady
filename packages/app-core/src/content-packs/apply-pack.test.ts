import { describe, expect, it, vi } from "vitest";
import type { ResolvedContentPack } from "@miladyai/shared/contracts/content-pack";
import { applyContentPack, type ContentPackApplyDeps } from "./apply-pack";

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
    applyContentPack(
      makePack({ vrmUrl: "/packs/test/model.vrm.gz" }),
      deps,
    );
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
    applyContentPack(
      makePack({ backgroundUrl: "/packs/test/bg.png" }),
      deps,
    );
    expect(deps.setCustomBackgroundUrl).toHaveBeenCalledWith(
      "/packs/test/bg.png",
    );
  });

  it("applies personality name", () => {
    const deps = makeDeps();
    applyContentPack(
      makePack({ personality: { name: "Nyx" } }),
      deps,
    );
    expect(deps.setOnboardingName).toHaveBeenCalledWith("Nyx");
  });

  it("sets onboarding style to pack id", () => {
    const deps = makeDeps();
    applyContentPack(makePack(), deps);
    expect(deps.setOnboardingStyle).toHaveBeenCalledWith("test-pack");
  });

  it("skips setters for missing assets", () => {
    const deps = makeDeps();
    applyContentPack(makePack(), deps);
    expect(deps.setCustomVrmUrl).not.toHaveBeenCalled();
    expect(deps.setCustomBackgroundUrl).not.toHaveBeenCalled();
    expect(deps.setOnboardingName).not.toHaveBeenCalled();
  });
});
