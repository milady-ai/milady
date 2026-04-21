/**
 * When boot config has no vrmAssets (or an empty roster), path helpers must
 * point at files that actually ship under apps/app/public/vrms/.
 */
import { setBootConfig } from "@miladyai/app-core/config";
import {
  getVrmBackgroundUrl,
  getVrmPreviewUrl,
  getVrmUrl,
} from "@miladyai/app-core/state";
import { beforeEach, describe, expect, it } from "vitest";

describe("VRM paths with empty boot roster", () => {
  beforeEach(() => {
    setBootConfig({ branding: {}, vrmAssets: [] });
  });

  it("falls back to milady-1 assets, not missing default.* files", () => {
    expect(getVrmUrl(1)).toBe("/vrms/milady-1.vrm.gz");
    expect(getVrmPreviewUrl(1)).toBe("/vrms/previews/milady-1.png");
    expect(getVrmBackgroundUrl(1)).toBe("/vrms/backgrounds/milady-1.png");
  });

  it("treats omitted vrmAssets like an empty roster", () => {
    setBootConfig({ branding: {} });
    expect(getVrmUrl(1)).toBe("/vrms/milady-1.vrm.gz");
  });
});
