import { describe, expect, it } from "vitest";

import {
  shouldResetWindowsCefProfile,
  shouldWriteWindowsCefProfileMarker,
} from "../windows-cef-profile";

describe("windows-cef-profile", () => {
  it("resets stale CEF data when the previous version marker is missing", () => {
    expect(
      shouldResetWindowsCefProfile({
        currentVersion: "2.0.0-alpha.116",
        previousVersion: null,
        cefDirExists: true,
      }),
    ).toBe(true);
  });

  it("does not reset or persist a marker when the current version is unknown", () => {
    expect(
      shouldResetWindowsCefProfile({
        currentVersion: "unknown",
        previousVersion: null,
        cefDirExists: true,
      }),
    ).toBe(false);
    expect(shouldWriteWindowsCefProfileMarker("unknown")).toBe(false);
  });
});
