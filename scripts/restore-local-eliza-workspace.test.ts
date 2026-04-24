import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isDirectRun,
  restoreLocalElizaWorkspace,
} from "./restore-local-eliza-workspace.mjs";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-restore-eliza-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  vi.restoreAllMocks();
});

describe("restore-local-eliza-workspace", () => {
  it("restores eliza from the CI-disabled path", () => {
    const repoRoot = makeTempDir();
    const disabledDir = path.join(repoRoot, ".eliza.ci-disabled");
    const restoredDir = path.join(repoRoot, "eliza");
    const log = vi.fn();

    fs.mkdirSync(path.join(disabledDir, "packages"), { recursive: true });
    fs.writeFileSync(
      path.join(disabledDir, "package.json"),
      JSON.stringify({ name: "eliza" }, null, 2),
    );

    expect(restoreLocalElizaWorkspace(repoRoot, { log })).toBe(true);
    expect(fs.existsSync(disabledDir)).toBe(false);
    expect(fs.existsSync(restoredDir)).toBe(true);
    expect(log).toHaveBeenCalledWith(
      "restore-local-eliza-workspace: restored eliza/ from .eliza.ci-disabled/.",
    );
  });

  it("reapplies unpublished plugin stub overrides after restore", () => {
    const repoRoot = makeTempDir();
    const disabledDir = path.join(repoRoot, ".eliza.ci-disabled");

    fs.mkdirSync(path.join(disabledDir, "packages"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "apps", "app"), { recursive: true });
    fs.mkdirSync(
      path.join(repoRoot, "scripts", "ci-stubs", "elizaos-plugin-app-control"),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(disabledDir, "package.json"),
      JSON.stringify({ name: "eliza" }, null, 2),
    );
    fs.writeFileSync(
      path.join(repoRoot, "apps", "app", "package.json"),
      JSON.stringify({ name: "milady-app" }, null, 2),
    );
    fs.writeFileSync(
      path.join(
        repoRoot,
        "scripts",
        "ci-stubs",
        "elizaos-plugin-app-control",
        "package.json",
      ),
      JSON.stringify({ name: "@elizaos/plugin-app-control" }, null, 2),
    );

    expect(restoreLocalElizaWorkspace(repoRoot)).toBe(true);

    const restoredPackageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "eliza", "package.json"), "utf8"),
    ) as {
      overrides?: Record<string, string>;
    };

    expect(restoredPackageJson.overrides).toEqual({
      "@elizaos/plugin-app-control":
        "file:../scripts/ci-stubs/elizaos-plugin-app-control",
    });

    const restoredAppPackageJson = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "apps", "app", "package.json"),
        "utf8",
      ),
    ) as {
      overrides?: Record<string, string>;
    };

    expect(restoredAppPackageJson.overrides).toEqual({
      "@elizaos/plugin-app-control":
        "file:../../scripts/ci-stubs/elizaos-plugin-app-control",
    });
  });

  it("skips when there is no disabled eliza path", () => {
    const repoRoot = makeTempDir();
    const log = vi.fn();

    expect(restoreLocalElizaWorkspace(repoRoot, { log })).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "restore-local-eliza-workspace: .eliza.ci-disabled not present and eliza/ is missing; skipping restore.",
    );
  });

  it("throws an explicit error when rename fails", () => {
    const repoRoot = makeTempDir();
    const disabledDir = path.join(repoRoot, ".eliza.ci-disabled");
    const errorLog = vi.fn();

    fs.mkdirSync(disabledDir, { recursive: true });
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("EPERM");
    });

    expect(() => restoreLocalElizaWorkspace(repoRoot, { errorLog })).toThrow(
      "restore-local-eliza-workspace: failed to rename .eliza.ci-disabled to eliza: EPERM",
    );
    expect(errorLog).toHaveBeenCalledWith(
      "restore-local-eliza-workspace: failed to rename .eliza.ci-disabled to eliza: EPERM",
    );
  });

  it("matches direct-run detection on windows-style paths", () => {
    const windowsScriptPath =
      "C:\\repo\\scripts\\restore-local-eliza-workspace.mjs";
    const toWindowsFileUrl = (value: string) =>
      new URL(`file:///${value.replace(/\\/g, "/")}`);

    expect(
      isDirectRun(
        "file:///C:/repo/scripts/restore-local-eliza-workspace.mjs",
        windowsScriptPath,
        () => windowsScriptPath,
        toWindowsFileUrl,
      ),
    ).toBe(true);
    expect(
      isDirectRun(
        "file:///C:/repo/scripts/other.mjs",
        windowsScriptPath,
        () => windowsScriptPath,
        toWindowsFileUrl,
      ),
    ).toBe(false);
    expect(toWindowsFileUrl(windowsScriptPath).href).toBe(
      "file:///C:/repo/scripts/restore-local-eliza-workspace.mjs",
    );
  });
});
