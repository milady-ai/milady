import { describe, expect, it, vi } from "vitest";
import {
  resolveAppOverride,
  sanitizeSandbox,
  LOCAL_APP_DEFAULT_SANDBOX,
} from "./registry-client-app-meta.js";

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe("agent registry-client-app-meta", () => {
  it("keeps the shared sandbox allowlist behavior", () => {
    expect(sanitizeSandbox(undefined)).toBe(LOCAL_APP_DEFAULT_SANDBOX);
  });

  it("registers Babylon, Hyperscape, and 2004scape detail panels", () => {
    expect(
      resolveAppOverride("@elizaos/app-babylon", undefined)?.uiExtension
        ?.detailPanelId,
    ).toBe("babylon-operator-dashboard");
    expect(
      resolveAppOverride("@elizaos/app-hyperscape", undefined)?.uiExtension
        ?.detailPanelId,
    ).toBe("hyperscape-embedded-agent-control");
    expect(
      resolveAppOverride("@elizaos/app-2004scape", undefined)?.uiExtension
        ?.detailPanelId,
    ).toBe("2004scape-operator-dashboard");
  });
});

