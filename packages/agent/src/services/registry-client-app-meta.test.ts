import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_APP_DEFAULT_SANDBOX,
  resolveAppOverride,
  sanitizeSandbox,
} from "./registry-client-app-meta.js";

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe("agent registry-client-app-meta", () => {
  it("keeps the shared sandbox allowlist behavior", () => {
    expect(sanitizeSandbox(undefined)).toBe(LOCAL_APP_DEFAULT_SANDBOX);
  });

  it("keeps supplemental Hyperscape host overrides off standalone metadata", () => {
    expect(
      resolveAppOverride("@hyperscape/plugin-hyperscape", undefined),
    ).toBeUndefined();
  });

  it("registers standalone host-owned detail panels when overrides define app metadata", () => {
    expect(
      resolveAppOverride("@elizaos/app-hyperscape", undefined)?.runtimePlugin,
    ).toBe("@hyperscape/plugin-hyperscape");
    expect(
      resolveAppOverride("@elizaos/app-babylon", undefined)?.uiExtension
        ?.detailPanelId,
    ).toBe("babylon-operator-dashboard");
    const result = resolveAppOverride("@elizaos/app-2004scape", undefined);
    expect(result?.uiExtension?.detailPanelId).toBe(
      "2004scape-operator-dashboard",
    );
    expect(result?.launchUrl).toBe("/api/apps/2004scape/viewer");
    expect(result?.viewer?.url).toBe("/api/apps/2004scape/viewer");
    expect(result?.viewer?.embedParams).toEqual({
      bot: "",
      password: "",
    });
  });
});
