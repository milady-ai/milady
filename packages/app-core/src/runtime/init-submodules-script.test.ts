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
const ORCHESTRATOR_MARKERS = getSubmoduleReadinessMarkerPaths(
  "plugins/plugin-agent-orchestrator",
  { rootDir: ROOT },
);
const PLUGIN_PDF_TS_PACKAGE = resolve(
  ROOT,
  "plugins/plugin-pdf/typescript/package.json",
);
const PLUGIN_PI_AI_ROOT_PACKAGE = resolve(
  ROOT,
  "plugins/plugin-pi-ai/package.json",
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

  it("treats plugin checkouts as incomplete until a workspace manifest exists", () => {
    expect(
      isSubmoduleCheckoutReady("plugins/plugin-pdf", {
        rootDir: ROOT,
        exists: createExistsStub(),
      }),
    ).toBe(false);

    expect(
      isSubmoduleCheckoutReady("plugins/plugin-pdf", {
        rootDir: ROOT,
        exists: createExistsStub([PLUGIN_PDF_TS_PACKAGE]),
      }),
    ).toBe(true);

    expect(
      isSubmoduleCheckoutReady("plugins/plugin-pi-ai", {
        rootDir: ROOT,
        exists: createExistsStub([PLUGIN_PI_AI_ROOT_PACKAGE]),
      }),
    ).toBe(true);
  });

  it("prefers explicit readiness markers over generic plugin manifests", () => {
    expect(
      isSubmoduleCheckoutReady("plugins/plugin-agent-orchestrator", {
        rootDir: ROOT,
        exists: createExistsStub([ORCHESTRATOR_MARKERS[0]]),
      }),
    ).toBe(true);

    expect(
      isSubmoduleCheckoutReady("plugins/plugin-agent-orchestrator", {
        rootDir: ROOT,
        exists: createExistsStub([PLUGIN_PI_AI_ROOT_PACKAGE]),
      }),
    ).toBe(false);
  });

  it("reinitializes plugin submodules when git reports them present but workspace manifests are missing", () => {
    const existingPaths = new Set<string>([GIT_DIR, GITMODULES]);
    const exists = (filePath: string) => existingPaths.has(filePath);
    const exec = vi.fn((command: string) => {
      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        return "submodule.plugins/plugin-pdf.path plugins/plugin-pdf";
      }
      if (command === 'git submodule status -- "plugins/plugin-pdf"') {
        return " dc44c9f plugins/plugin-pdf";
      }
      if (
        command ===
        'git submodule update --init --recursive "plugins/plugin-pdf"'
      ) {
        existingPaths.add(PLUGIN_PDF_TS_PACKAGE);
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
      'git submodule update --init --recursive "plugins/plugin-pdf"',
      expect.objectContaining({
        cwd: ROOT,
        stdio: "inherit",
      }),
    );
  });

  it("repairs empty submodule worktrees after git submodule update completes", () => {
    const existingPaths = new Set<string>([GIT_DIR, GITMODULES]);
    const exists = (filePath: string) => existingPaths.has(filePath);
    const exec = vi.fn((command: string) => {
      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        return "submodule.plugins/plugin-solana.path plugins/plugin-solana";
      }
      if (command === 'git submodule status -- "plugins/plugin-solana"') {
        return " dc44c9f plugins/plugin-solana";
      }
      if (
        command ===
        'git submodule update --init --recursive "plugins/plugin-solana"'
      ) {
        return "";
      }
      if (
        command === 'git -C "plugins/plugin-solana" read-tree --reset -u HEAD'
      ) {
        existingPaths.add(resolve(ROOT, "plugins/plugin-solana/package.json"));
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
    expect(result.failed).toBe(0);
    expect(exec).toHaveBeenCalledWith(
      'git -C "plugins/plugin-solana" read-tree --reset -u HEAD',
      expect.objectContaining({
        cwd: ROOT,
        stdio: "inherit",
      }),
    );
  });
});
