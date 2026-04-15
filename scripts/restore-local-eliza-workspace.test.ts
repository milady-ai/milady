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

    expect(restoreLocalElizaWorkspace(repoRoot, { log })).toBe(true);
    expect(fs.existsSync(disabledDir)).toBe(false);
    expect(fs.existsSync(restoredDir)).toBe(true);
    expect(log).toHaveBeenCalledWith(
      "restore-local-eliza-workspace: restored eliza/ from .eliza.ci-disabled/.",
    );
  });

  it("skips when there is no disabled eliza path", () => {
    const repoRoot = makeTempDir();
    const log = vi.fn();

    expect(restoreLocalElizaWorkspace(repoRoot, { log })).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "restore-local-eliza-workspace: .eliza.ci-disabled not present; skipping restore.",
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
      new URL(`file:///${value.replace(/\\\\/g, "/")}`);

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
