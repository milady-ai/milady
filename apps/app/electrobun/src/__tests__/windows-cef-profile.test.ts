import { describe, expect, it, vi } from "vitest";

import {
  resetWindowsCefProfile,
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

  it("clears stale profile entries but preserves the version marker", () => {
    const rmSync = vi.fn();
    const writeFileSync = vi.fn();
    const mkdirSync = vi.fn();
    const readdirSync = vi
      .fn()
      .mockReturnValue(["Partitions", "GPUCache", ".milady-version"]);
    const readFileSync = vi.fn((target: string) => {
      if (target.endsWith(".milady-version")) return "";
      if (target.endsWith("package.json")) {
        return JSON.stringify({ version: "2.0.0-alpha.116" });
      }
      throw new Error(`Unexpected read: ${target}`);
    });

    const result = resetWindowsCefProfile({
      moduleDir: "C:\\repo\\apps\\app\\electrobun\\src",
      userDataDir: "C:\\Users\\tester\\AppData\\Roaming\\Milady",
      fileSystem: {
        existsSync: vi.fn(() => true),
        mkdirSync,
        readFileSync,
        readdirSync,
        rmSync,
        writeFileSync,
      },
      log: vi.fn(),
      warn: vi.fn(),
    });

    expect(result.reset).toBe(true);
    expect(result.wroteMarker).toBe(true);
    expect(rmSync).toHaveBeenCalledTimes(2);
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".milady-version"),
      "2.0.0-alpha.116",
    );
  });
});
