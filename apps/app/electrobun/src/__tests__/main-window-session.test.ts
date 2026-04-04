import { describe, expect, it } from "vitest";

import {
  PACKAGED_WINDOWS_BOOTSTRAP_PARTITION,
  resolveBootstrapShellRenderer,
  resolveBootstrapViewRenderer,
  resolveMainWindowPartition,
} from "../main-window-session";

describe("main-window-session", () => {
  it("uses the explicit test partition when provided", () => {
    expect(
      resolveMainWindowPartition({
        MILADY_DESKTOP_TEST_PARTITION: "milady-smoke",
      }),
    ).toBe("persist:milady-smoke");
    expect(
      resolveMainWindowPartition({
        MILADY_DESKTOP_TEST_PARTITION: "persist:already-normalized",
      }),
    ).toBe("persist:already-normalized");
  });

  it("falls back to the isolated bootstrap partition for test API bootstrap", () => {
    expect(
      resolveMainWindowPartition({
        MILADY_DESKTOP_TEST_API_BASE: "http://127.0.0.1:43123",
      }),
    ).toBe(PACKAGED_WINDOWS_BOOTSTRAP_PARTITION);
  });

  it("returns null for normal startup without bootstrap overrides", () => {
    expect(resolveMainWindowPartition({})).toBeNull();
  });

  it("prefers a native shell but chooses CEF for the isolated main view when available", () => {
    const buildInfo = {
      defaultRenderer: "native" as const,
      availableRenderers: ["native", "cef"] as Array<"native" | "cef">,
    };

    expect(resolveBootstrapShellRenderer(buildInfo)).toBe("native");
    expect(resolveBootstrapViewRenderer(buildInfo)).toBe("cef");
  });

  it("falls back cleanly when only the native renderer is bundled", () => {
    const buildInfo = {
      defaultRenderer: "native" as const,
      availableRenderers: ["native"] as Array<"native" | "cef">,
    };

    expect(resolveBootstrapShellRenderer(buildInfo)).toBe("native");
    expect(resolveBootstrapViewRenderer(buildInfo)).toBe("native");
  });

  it("ignores blank partition overrides", () => {
    expect(
      resolveMainWindowPartition({
        MILADY_DESKTOP_TEST_PARTITION: "   ",
      }),
    ).toBeNull();
  });
});
