import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyMiladyCopyPatches,
  bootstrapBundledBunInstall,
  ensurePluginAnthropicBunTypes,
  getElizaInstallArgs,
} from "./setup-upstreams.mjs";

const tempDirs: string[] = [];
const LEGACY_COPY =
  "Sent through the connected {{source}} account on this Mac.";
const DEVICE_COPY =
  "Sent through the connected {{source}} account on this device.";

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-setup-upstreams-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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
      [path.join("node_modules", "bun", "install.js")],
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

describe("applyMiladyCopyPatches", () => {
  it("rewrites legacy inbox hint copy across target files", () => {
    const elizaRoot = makeTempDir();
    const chatViewPath = path.join(
      elizaRoot,
      "packages",
      "app-core",
      "src",
      "components",
      "pages",
      "ChatView.tsx",
    );
    const localePath = path.join(
      elizaRoot,
      "packages",
      "app-core",
      "src",
      "i18n",
      "locales",
      "en.json",
    );

    writeFile(chatViewPath, `copy: "${LEGACY_COPY}"`);
    writeFile(localePath, `{"reply_hint":"${LEGACY_COPY}"}`);

    expect(applyMiladyCopyPatches(elizaRoot)).toBe(2);
    expect(fs.readFileSync(chatViewPath, "utf8")).toContain(DEVICE_COPY);
    expect(fs.readFileSync(chatViewPath, "utf8")).not.toContain(LEGACY_COPY);
    expect(fs.readFileSync(localePath, "utf8")).toContain(DEVICE_COPY);
    expect(fs.readFileSync(localePath, "utf8")).not.toContain(LEGACY_COPY);
  });

  it("is idempotent after replacement", () => {
    const elizaRoot = makeTempDir();
    const chatViewPath = path.join(
      elizaRoot,
      "packages",
      "app-core",
      "src",
      "components",
      "pages",
      "ChatView.tsx",
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    writeFile(chatViewPath, DEVICE_COPY);

    expect(applyMiladyCopyPatches(elizaRoot)).toBe(0);
    expect(applyMiladyCopyPatches(elizaRoot)).toBe(0);
    expect(fs.readFileSync(chatViewPath, "utf8")).toBe(DEVICE_COPY);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("warns when target files exist but patch targets no longer match", () => {
    const elizaRoot = makeTempDir();
    const localePath = path.join(
      elizaRoot,
      "packages",
      "app-core",
      "src",
      "i18n",
      "locales",
      "en.json",
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    writeFile(localePath, '{"reply_hint":"unexpected copy"}');

    expect(applyMiladyCopyPatches(elizaRoot)).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      "[setup-upstreams] WARNING: inbox reply hint legacy string not found — patch may need updating",
    );

    warnSpy.mockRestore();
  });
});

describe("ensurePluginAnthropicBunTypes", () => {
  function writeBuildConfig(
    pluginsRoot: string,
    config: Record<string, unknown>,
  ) {
    const buildConfigPath = path.join(
      pluginsRoot,
      "plugin-anthropic",
      "typescript",
      "tsconfig.build.json",
    );
    writeFile(buildConfigPath, `${JSON.stringify(config, null, "\t")}\n`);
    return buildConfigPath;
  }

  it("adds 'bun' to compilerOptions.types when missing", () => {
    const pluginsRoot = makeTempDir();
    const buildConfigPath = writeBuildConfig(pluginsRoot, {
      extends: "./tsconfig.json",
      compilerOptions: {
        rootDir: ".",
        outDir: "../dist",
      },
      include: ["**/*.ts"],
    });

    expect(ensurePluginAnthropicBunTypes(pluginsRoot)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(buildConfigPath, "utf8")) as {
      compilerOptions: { types?: string[] };
    };
    expect(parsed.compilerOptions.types).toContain("bun");
    expect(parsed.compilerOptions.types).toContain("node");
  });

  it("is a no-op when 'bun' is already present", () => {
    const pluginsRoot = makeTempDir();
    const initialConfig = {
      extends: "./tsconfig.json",
      compilerOptions: {
        rootDir: ".",
        outDir: "../dist",
        types: ["node", "bun"],
      },
      include: ["**/*.ts"],
    };
    const buildConfigPath = writeBuildConfig(pluginsRoot, initialConfig);
    const originalContents = fs.readFileSync(buildConfigPath, "utf8");

    expect(ensurePluginAnthropicBunTypes(pluginsRoot)).toBe(false);
    expect(fs.readFileSync(buildConfigPath, "utf8")).toBe(originalContents);
  });

  it("extends an existing types array without duplicating 'bun'", () => {
    const pluginsRoot = makeTempDir();
    const buildConfigPath = writeBuildConfig(pluginsRoot, {
      extends: "./tsconfig.json",
      compilerOptions: {
        rootDir: ".",
        outDir: "../dist",
        types: ["node"],
      },
      include: ["**/*.ts"],
    });

    expect(ensurePluginAnthropicBunTypes(pluginsRoot)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(buildConfigPath, "utf8")) as {
      compilerOptions: { types?: string[] };
    };
    expect(parsed.compilerOptions.types).toEqual(["node", "bun"]);
  });

  it("is a no-op when plugin-anthropic is not present", () => {
    const pluginsRoot = makeTempDir();
    expect(ensurePluginAnthropicBunTypes(pluginsRoot)).toBe(false);
  });
});
