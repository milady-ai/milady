import { describe, expect, it } from "vitest";

import {
  resolveDesktopBundleVersion,
  shouldResetWindowsCefProfile,
  shouldWriteWindowsCefProfileMarker,
} from "../windows-cef-profile";

describe("windows-cef-profile", () => {
  it("resolves the packaged Windows bundle version from Resources/version.json", () => {
    const version = resolveDesktopBundleVersion(
      "C:\\mi\\Resources\\app\\bun",
      "C:\\mi\\bin\\bun.exe",
      "win32",
      {
        existsSync: (filePath) =>
          filePath === "C:\\mi\\Resources\\version.json",
        readFileSync: (filePath) => {
          if (filePath !== "C:\\mi\\Resources\\version.json") {
            throw new Error(`unexpected path: ${filePath}`);
          }
          return JSON.stringify({ version: "2.0.0-alpha.87" });
        },
      },
    );

    expect(version).toBe("2.0.0-alpha.87");
  });

  it("falls back to the local package.json in dev", () => {
    const version = resolveDesktopBundleVersion(
      "/repo/apps/app/electrobun/src",
      "/usr/local/bin/bun",
      "darwin",
      {
        existsSync: (filePath) =>
          filePath === "/repo/apps/app/electrobun/package.json",
        readFileSync: (filePath) => {
          if (filePath !== "/repo/apps/app/electrobun/package.json") {
            throw new Error(`unexpected path: ${filePath}`);
          }
          return JSON.stringify({ version: "2.0.0-dev" });
        },
      },
    );

    expect(version).toBe("2.0.0-dev");
  });

  it("resets stale CEF data when the previous version marker is missing", () => {
    expect(
      shouldResetWindowsCefProfile({
        currentVersion: "2.0.0-alpha.116",
        previousVersion: null,
        cefDirExists: true,
      }),
    ).toBe(true);
  });

  it("does not reset when the CEF directory does not exist", () => {
    expect(
      shouldResetWindowsCefProfile({
        currentVersion: "2.0.0-alpha.116",
        previousVersion: null,
        cefDirExists: false,
      }),
    ).toBe(false);
  });

  it("does not reset when the version has not changed", () => {
    expect(
      shouldResetWindowsCefProfile({
        currentVersion: "2.0.0-alpha.116",
        previousVersion: "2.0.0-alpha.116",
        cefDirExists: true,
      }),
    ).toBe(false);
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
