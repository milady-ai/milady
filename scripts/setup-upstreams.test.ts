import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  bootstrapBundledBunInstall,
  getElizaInstallArgs,
} from "./setup-upstreams.mjs";

describe("getElizaInstallArgs", () => {
  it("uses a normal bun install by default", () => {
    expect(getElizaInstallArgs({})).toEqual(["install"]);
  });

  it("skips lifecycle scripts when vision deps are disabled", () => {
    expect(getElizaInstallArgs({ MILADY_NO_VISION_DEPS: "1" })).toEqual([
      "install",
      "--ignore-scripts",
    ]);
  });
});

describe("bootstrapBundledBunInstall", () => {
  it("does nothing when lifecycle scripts were not skipped", async () => {
    const runCommandImpl = vi.fn();

    await expect(
      bootstrapBundledBunInstall("/repo/eliza", {
        env: {},
        pathExists: () => true,
        runCommandImpl,
      }),
    ).resolves.toBe(false);

    expect(runCommandImpl).not.toHaveBeenCalled();
  });

  it("runs Bun's bundled install script after ignore-scripts installs", async () => {
    const runCommandImpl = vi.fn().mockResolvedValue(undefined);
    const workspaceRoot = "/repo/eliza";
    const bunInstallScriptPath = path.join(
      workspaceRoot,
      "node_modules",
      "bun",
      "install.js",
    );

    await expect(
      bootstrapBundledBunInstall(workspaceRoot, {
        env: { MILADY_NO_VISION_DEPS: "1" },
        pathExists: (targetPath) => targetPath === bunInstallScriptPath,
        runCommandImpl,
      }),
    ).resolves.toBe(true);

    expect(runCommandImpl).toHaveBeenCalledWith(
      "node",
      ["node_modules/bun/install.js"],
      {
        cwd: workspaceRoot,
        label: "node node_modules/bun/install.js (eliza bun bootstrap)",
      },
    );
  });

  it("fails clearly when Bun's bundled install script is missing", async () => {
    await expect(
      bootstrapBundledBunInstall("/repo/eliza", {
        env: { MILADY_NO_VISION_DEPS: "1" },
        pathExists: () => false,
        runCommandImpl: vi.fn(),
      }),
    ).rejects.toThrow("node_modules/bun/install.js");
  });
});
