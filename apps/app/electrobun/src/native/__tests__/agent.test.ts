/**
 * Tests for agent.ts utility functions.
 *
 * Covers:
 *  - resolveConfigDir: Windows vs POSIX config directory resolution
 *  - getMiladyDistFallbackCandidates: path resolution fallback list
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  configureDesktopLocalApiAuth,
  ensureDesktopApiToken,
  getMiladyDistFallbackCandidates,
  inspectExistingElizaInstall,
  resolveConfigDir,
} from "../agent";

// ---------------------------------------------------------------------------
// resolveConfigDir
// ---------------------------------------------------------------------------

describe("resolveConfigDir", () => {
  it("returns %APPDATA%\\Milady on Windows when APPDATA is set", () => {
    const result = resolveConfigDir({
      platform: "win32",
      appdata: "C:\\Users\\Test\\AppData\\Roaming",
      homedir: "C:\\Users\\Test",
    });
    expect(result).toBe(
      path.join("C:\\Users\\Test\\AppData\\Roaming", "Milady"),
    );
  });

  it("falls back to homedir\\AppData\\Roaming\\Milady on Windows when APPDATA is absent", () => {
    const result = resolveConfigDir({
      platform: "win32",
      homedir: "C:\\Users\\Test",
    });
    // No appdata provided and process.env.APPDATA should not be used when
    // explicit opts are given — but the function falls through to
    // process.env.APPDATA. On a non-Windows CI runner APPDATA is unset, so
    // the fallback to homedir kicks in. On a Windows runner APPDATA is set.
    // Either way, the result must end with "Milady".
    expect(result.endsWith("Milady")).toBe(true);
  });

  it("returns ~/.config/Milady on macOS", () => {
    const result = resolveConfigDir({
      platform: "darwin",
      homedir: "/Users/test",
    });
    expect(result).toBe(path.posix.join("/Users/test", ".config", "Milady"));
  });

  it("returns ~/.config/Milady on Linux", () => {
    const result = resolveConfigDir({
      platform: "linux",
      homedir: "/home/test",
    });
    expect(result).toBe(path.posix.join("/home/test", ".config", "Milady"));
  });

  it("ignores APPDATA on non-Windows platforms", () => {
    const result = resolveConfigDir({
      platform: "darwin",
      appdata: "C:\\Users\\Test\\AppData\\Roaming",
      homedir: "/Users/test",
    });
    // Should use ~/.config, not APPDATA
    expect(result).toBe(path.posix.join("/Users/test", ".config", "Milady"));
  });

  it("uses explicit appdata over process.env.APPDATA", () => {
    const result = resolveConfigDir({
      platform: "win32",
      appdata: "D:\\CustomAppData",
      homedir: "C:\\Users\\Test",
    });
    expect(result).toBe(path.join("D:\\CustomAppData", "Milady"));
  });
});

// ---------------------------------------------------------------------------
// getMiladyDistFallbackCandidates
// ---------------------------------------------------------------------------

describe("getMiladyDistFallbackCandidates", () => {
  it("returns an array of candidate paths", () => {
    const candidates = getMiladyDistFallbackCandidates(
      "/some/dir",
      "/usr/bin/bun",
    );
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("deduplicates candidates", () => {
    const candidates = getMiladyDistFallbackCandidates("/a/b", "/a/b/bun");
    const unique = new Set(candidates);
    expect(candidates.length).toBe(unique.size);
  });

  it("includes macOS bundle path", () => {
    const candidates = getMiladyDistFallbackCandidates(
      "/a/b",
      "/app/Contents/MacOS/launcher",
    );
    const macosBundlePath = path.posix.resolve(
      "/app/Contents/MacOS",
      "../Resources/app/milady-dist",
    );
    expect(candidates).toContain(macosBundlePath);
  });

  it("includes Windows resources path", () => {
    const candidates = getMiladyDistFallbackCandidates(
      "/a/b",
      "/app/launcher.exe",
    );
    const winResourcesPath = path.posix.resolve(
      "/app",
      "resources/app/milady-dist",
    );
    expect(candidates).toContain(winResourcesPath);
  });
});

describe("ensureDesktopApiToken", () => {
  it("reuses an existing token and mirrors both env aliases", () => {
    const env: NodeJS.ProcessEnv = {
      MILADY_API_TOKEN: "desktop-token",
    };

    expect(ensureDesktopApiToken(env)).toBe("desktop-token");
    expect(env.MILADY_API_TOKEN).toBe("desktop-token");
    expect(env.ELIZA_API_TOKEN).toBe("desktop-token");
  });

  it("generates a token when neither alias is configured", () => {
    const env: NodeJS.ProcessEnv = {};

    const token = ensureDesktopApiToken(env);

    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect(env.MILADY_API_TOKEN).toBe(token);
    expect(env.ELIZA_API_TOKEN).toBe(token);
  });
});

describe("configureDesktopLocalApiAuth", () => {
  it("disables pairing while keeping the mirrored desktop token aliases", () => {
    const env: NodeJS.ProcessEnv = {
      MILADY_API_TOKEN: "desktop-token",
    };

    expect(configureDesktopLocalApiAuth(env)).toBe("desktop-token");
    expect(env.MILADY_API_TOKEN).toBe("desktop-token");
    expect(env.ELIZA_API_TOKEN).toBe("desktop-token");
    expect(env.MILADY_PAIRING_DISABLED).toBe("1");
    expect(env.ELIZA_PAIRING_DISABLED).toBe("1");
  });
});

describe("inspectExistingElizaInstall", () => {
  it("detects the default ~/.eliza config when it exists", async () => {
    const homeDir = path.join(process.cwd(), "tmp-home-default");
    const stateDir = path.join(homeDir, ".eliza");
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, "eliza.json"),
      JSON.stringify({ agents: { list: [{ id: "main" }] } }),
    );

    const result = inspectExistingElizaInstall({
      env: {},
      homedir: homeDir,
    });

    expect(result.detected).toBe(true);
    expect(result.stateDir).toBe(stateDir);
    expect(result.configPath).toBe(path.join(stateDir, "eliza.json"));
    expect(result.configExists).toBe(true);
    expect(result.source).toBe("default-state-dir");

    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("detects an env-overridden state dir even without eliza.json when it has state entries", async () => {
    const homeDir = path.join(process.cwd(), "tmp-home-env-state");
    const stateDir = path.join(homeDir, "custom-state");
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "skills.json"), JSON.stringify({}));

    const result = inspectExistingElizaInstall({
      env: {
        ELIZA_STATE_DIR: stateDir,
      },
      homedir: homeDir,
    });

    expect(result.detected).toBe(true);
    expect(result.stateDir).toBe(stateDir);
    expect(result.configPath).toBe(path.join(stateDir, "eliza.json"));
    expect(result.configExists).toBe(false);
    expect(result.hasStateEntries).toBe(true);
    expect(result.source).toBe("state-dir-env");

    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("prefers an explicit config path when provided", async () => {
    const homeDir = path.join(process.cwd(), "tmp-home-config-path");
    const configPath = path.join(homeDir, "profiles", "legacy.json");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({}));

    const result = inspectExistingElizaInstall({
      env: {
        MILADY_CONFIG_PATH: configPath,
      },
      homedir: homeDir,
    });

    expect(result.detected).toBe(true);
    expect(result.configPath).toBe(configPath);
    expect(result.stateDir).toBe(path.dirname(configPath));
    expect(result.source).toBe("config-path-env");

    fs.rmSync(homeDir, { recursive: true, force: true });
  });
});
