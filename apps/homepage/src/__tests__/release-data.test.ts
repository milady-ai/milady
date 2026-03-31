import { describe, expect, it } from "vitest";
import { releaseData } from "../generated/release-data";
import { matchAsset } from "../lib/release-helpers";

describe("matchAsset", () => {
  it("maps macOS ARM64 DMG correctly", () => {
    expect(matchAsset("canary-macos-arm64-Milady-canary.dmg")).toBe(
      "macos-arm64",
    );
  });

  it("maps macOS x64 DMG correctly", () => {
    expect(matchAsset("canary-macos-x64-Milady-canary.dmg")).toBe("macos-x64");
  });

  it("maps Windows exe correctly", () => {
    expect(matchAsset("Milady-Setup-canary.exe")).toBe("windows-x64");
  });

  it("maps Linux tar.gz correctly", () => {
    expect(matchAsset("canary-linux-x64-Milady-canary-Setup.tar.gz")).toBe(
      "linux-x64",
    );
  });

  it("maps Linux deb correctly", () => {
    expect(matchAsset("milady-linux-x64.deb")).toBe("linux-deb");
  });

  it("returns null for unknown filenames", () => {
    expect(matchAsset("SHA256SUMS.txt")).toBeNull();
    expect(matchAsset("random-file.pdf")).toBeNull();
  });
});

describe("releaseData structure", () => {
  it("has a tagName", () => {
    expect(releaseData.release.tagName).toBeTruthy();
    expect(typeof releaseData.release.tagName).toBe("string");
  });

  it("has a release URL", () => {
    expect(releaseData.release.url).toBeTruthy();
    expect(releaseData.release.url).toMatch(/^https:\/\//);
  });

  it("has a downloads array", () => {
    expect(Array.isArray(releaseData.release.downloads)).toBe(true);
    expect(releaseData.release.downloads.length).toBeGreaterThan(0);
  });

  it("downloads have valid URLs (not empty, start with https://)", () => {
    for (const dl of releaseData.release.downloads) {
      expect(dl.url).toBeTruthy();
      expect(dl.url).toMatch(/^https:\/\//);
    }
  });

  it("generatedAt is within 30 days", () => {
    const generated = new Date(releaseData.generatedAt);
    const now = new Date();
    const diffMs = now.getTime() - generated.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeLessThan(30);
  });

  it("scripts.shell has a cdnUrl pointing to jsDelivr", () => {
    expect(releaseData.scripts.shell.cdnUrl).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/gh\/milady-ai\/milady@/,
    );
    expect(releaseData.scripts.shell.cdnUrl).toContain("/install.sh");
  });

  it("scripts.powershell has a cdnUrl pointing to jsDelivr", () => {
    expect(releaseData.scripts.powershell.cdnUrl).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/gh\/milady-ai\/milady@/,
    );
    expect(releaseData.scripts.powershell.cdnUrl).toContain("/install.ps1");
  });

  it("script cdnUrls contain the release tag", () => {
    const tag = releaseData.release.tagName;
    expect(releaseData.scripts.shell.cdnUrl).toContain(`@${tag}/`);
    expect(releaseData.scripts.powershell.cdnUrl).toContain(`@${tag}/`);
  });
});
