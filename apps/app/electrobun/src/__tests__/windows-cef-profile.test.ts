import { describe, expect, it } from "vitest";
import {
  resolveDesktopBundleVersion,
  shouldResetWindowsCefProfile,
} from "../windows-cef-profile";

describe("resolveDesktopBundleVersion", () => {
  it("prefers packaged Windows Resources/version.json", () => {
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
});

describe("shouldResetWindowsCefProfile", () => {
  it("does not reset on first run without a prior marker", () => {
    expect(shouldResetWindowsCefProfile(null, "2.0.0")).toBe(false);
  });

  it("does not reset when the current version is unknown", () => {
    expect(shouldResetWindowsCefProfile("1.9.0", "unknown")).toBe(false);
  });

  it("resets only on a real version change", () => {
    expect(shouldResetWindowsCefProfile("1.9.0", "2.0.0")).toBe(true);
    expect(shouldResetWindowsCefProfile("2.0.0", "2.0.0")).toBe(false);
  });
});
