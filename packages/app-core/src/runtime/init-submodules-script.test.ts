import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  getSubmoduleReadinessMarkerPaths,
  isSubmoduleCheckoutReady,
  parseTrackedSubmodules,
  runInitSubmodules,
} from "../../../../scripts/init-submodules.mjs";

const ROOT = "/tmp/eliza-test-root";
const GIT_DIR = resolve(ROOT, ".git");
const GITMODULES = resolve(ROOT, ".gitmodules");
const ELIZA_MARKERS = getSubmoduleReadinessMarkerPaths("eliza", {
  rootDir: ROOT,
});
const OPENZEPPELIN_MARKERS = getSubmoduleReadinessMarkerPaths(
  "test/contracts/lib/openzeppelin-contracts",
  { rootDir: ROOT },
);

function createExistsStub(extraPaths: string[] = []) {
  return (filePath: string) =>
    filePath === GIT_DIR ||
    filePath === GITMODULES ||
    extraPaths.includes(filePath);
}

describe("init-submodules script", () => {
  it("discovers tracked submodules from .gitmodules git-config output", () => {
    const existingPaths = new Set<string>([GIT_DIR, GITMODULES]);
    const exec = vi.fn((command: string) => {
      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        return [
          "submodule.test/contracts/lib/openzeppelin-contracts.path test/contracts/lib/openzeppelin-contracts",
          "submodule.extra.path extra",
        ].join("\n");
      }
      if (
        command ===
        'git submodule status -- "test/contracts/lib/openzeppelin-contracts"'
      ) {
        return "-dc44c9f test/contracts/lib/openzeppelin-contracts";
      }
      if (command === 'git submodule status -- "extra"') {
        return " dc44c9f extra";
      }
      if (
        command ===
        'git submodule update --init --recursive "test/contracts/lib/openzeppelin-contracts"'
      ) {
        for (const marker of OPENZEPPELIN_MARKERS) {
          existingPaths.add(marker);
        }
        return "";
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = runInitSubmodules({
      rootDir: ROOT,
      exists: (filePath: string) => existingPaths.has(filePath),
      exec,
      log: () => {},
      logError: () => {},
    });

    expect(result.submodules).toEqual([
      {
        name: "test/contracts/lib/openzeppelin-contracts",
        path: "test/contracts/lib/openzeppelin-contracts",
      },
      {
        name: "extra",
        path: "extra",
      },
    ]);
    expect(result.initialized).toBe(1);
    expect(result.alreadyInitialized).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("emits an explicit failure summary when initialization fails", () => {
    const errorLogs: string[] = [];
    const exec = vi.fn((command: string) => {
      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        return "submodule.bad.path bad";
      }
      if (command === 'git submodule status -- "bad"') {
        return "-deadbeef bad";
      }
      if (command === 'git submodule update --init --recursive "bad"') {
        throw new Error("simulated update failure");
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = runInitSubmodules({
      rootDir: ROOT,
      exists: createExistsStub(),
      exec,
      log: () => {},
      logError: (message: string) => errorLogs.push(message),
    });

    expect(result.failed).toBe(1);
    expect(
      errorLogs.some((message) =>
        message.includes(
          "Failed to initialize bad (bad): simulated update failure",
        ),
      ),
    ).toBe(true);
    expect(
      errorLogs.some((message) =>
        message.includes("Initialized 0, already ready 0, failed 1."),
      ),
    ).toBe(true);
  });

  it("parses empty .gitmodules output as no tracked submodules", () => {
    expect(parseTrackedSubmodules("")).toEqual([]);
    expect(parseTrackedSubmodules("   \n")).toEqual([]);
  });

  it("treats eliza as not ready when required checkout files are missing", () => {
    expect(
      isSubmoduleCheckoutReady("eliza", {
        rootDir: ROOT,
        exists: createExistsStub([ELIZA_MARKERS[0]]),
      }),
    ).toBe(false);

    expect(
      isSubmoduleCheckoutReady("eliza", {
        rootDir: ROOT,
        exists: createExistsStub(ELIZA_MARKERS),
      }),
    ).toBe(true);
  });

  it("reinitializes eliza when the checkout is incomplete even if git reports it present", () => {
    const existingPaths = new Set<string>([GIT_DIR, GITMODULES]);
    const exists = (filePath: string) => existingPaths.has(filePath);
    const exec = vi.fn((command: string) => {
      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        return "submodule.eliza.path eliza";
      }
      if (command === 'git submodule status -- "eliza"') {
        return " dc44c9f eliza";
      }
      if (command === "git status --porcelain") {
        return "";
      }
      if (command === 'git submodule update --init --recursive "eliza"') {
        for (const marker of ELIZA_MARKERS) {
          existingPaths.add(marker);
        }
        return "";
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = runInitSubmodules({
      rootDir: ROOT,
      exists,
      exec,
      log: () => {},
      logError: () => {},
      shouldSkipSubmodule: () => false,
    });

    expect(result.initialized).toBe(1);
    expect(result.alreadyInitialized).toBe(0);
    expect(result.failed).toBe(0);
    expect(exec).toHaveBeenCalledWith(
      'git submodule update --init --recursive "eliza"',
      expect.objectContaining({
        cwd: ROOT,
        stdio: "inherit",
      }),
    );
  });

  it("warns when a submodule has uncommitted local changes", () => {
    const existingPaths = new Set<string>([
      GIT_DIR,
      GITMODULES,
      ...ELIZA_MARKERS,
    ]);
    const exists = (filePath: string) => existingPaths.has(filePath);
    const logs: string[] = [];
    const exec = vi.fn((command: string) => {
      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        return "submodule.eliza.path eliza";
      }
      if (command === 'git submodule status -- "eliza"') {
        return " dc44c9f eliza";
      }
      if (command === "git status --porcelain") {
        return " M packages/core/src/index.ts";
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = runInitSubmodules({
      rootDir: ROOT,
      exists,
      exec,
      log: (msg: string) => logs.push(msg),
      logError: () => {},
      shouldSkipSubmodule: () => false,
    });

    // Checkout is ready so no re-init happens, but warning is emitted.
    expect(result.initialized).toBe(0);
    expect(result.alreadyInitialized).toBe(1);
    expect(logs.some((m) => m.includes("uncommitted local changes"))).toBe(
      true,
    );
  });

  it("warns when a submodule has commits not recorded in parent", () => {
    const existingPaths = new Set<string>([
      GIT_DIR,
      GITMODULES,
      ...ELIZA_MARKERS,
    ]);
    const exists = (filePath: string) => existingPaths.has(filePath);
    const logs: string[] = [];
    const exec = vi.fn((command: string) => {
      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        return "submodule.eliza.path eliza";
      }
      if (command === 'git submodule status -- "eliza"') {
        return "+dc44c9f eliza";
      }
      if (command === "git status --porcelain") {
        return "";
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = runInitSubmodules({
      rootDir: ROOT,
      exists,
      exec,
      log: (msg: string) => logs.push(msg),
      logError: () => {},
      shouldSkipSubmodule: () => false,
    });

    expect(result.initialized).toBe(0);
    expect(result.alreadyInitialized).toBe(1);
    expect(logs.some((m) => m.includes("not recorded in the parent"))).toBe(
      true,
    );
  });
});
