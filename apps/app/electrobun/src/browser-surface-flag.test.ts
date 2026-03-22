import { describe, expect, it } from "vitest";
import { isBrowserSurfaceEnabled } from "./browser-surface-flag";

describe("isBrowserSurfaceEnabled", () => {
  it("defaults to enabled when unset", () => {
    expect(isBrowserSurfaceEnabled({})).toBe(true);
  });

  it.each([
    "0",
    "false",
    "no",
    "off",
  ])("disables the browser surface for %s", (value) => {
    expect(
      isBrowserSurfaceEnabled({ MILADY_ENABLE_BROWSER_SURFACE: value }),
    ).toBe(false);
  });

  it.each([
    "1",
    "true",
    "yes",
    "on",
  ])("keeps the browser surface enabled for %s", (value) => {
    expect(
      isBrowserSurfaceEnabled({ MILADY_ENABLE_BROWSER_SURFACE: value }),
    ).toBe(true);
  });
});
