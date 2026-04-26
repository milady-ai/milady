import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyMiladyCopyPatches,
  applyPluginAnthropicBunRuntimePatch,
  applyPluginAnthropicCliUsagePatch,
  applyTypeScriptIgnoreDeprecationsCompatPatch,
  applyUnpublishedPluginStubOverrides,
  bootstrapBundledBunInstall,
  createPackageLink,
  ensureElizaAgentSkillsPluginBuild,
  ensureElizaBuildOutputs,
  ensureElizaTypescriptDependencyLinks,
  ensurePluginAnthropicBunTypes,
  ensurePublishedElizaPackageLinks,
  ensureRequiredElizaPluginBuilds,
  findInstalledPackageDir,
  getElizaInstallArgs,
  getMissingConditionalElizaWorkspaceEntries,
  getTemporaryElizaWorkspaceEntries,
  getUpstreamPackageLinks,
  patchPluginBuildTscBinPaths,
  resolveTypeScriptIgnoreDeprecationsTarget,
  runElizaInstallWithRetry,
  stripMissingConditionalElizaWorkspaces,
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

describe("ensureElizaTypescriptDependencyLinks", () => {
  it("does not link any packages by default", () => {
    const repoRoot = makeTempDir();
    const elizaRoot = path.join(repoRoot, "eliza");
    expect(ensureElizaTypescriptDependencyLinks(elizaRoot)).toBe(0);
  });

  it("links an explicitly listed package from the repo root into core", () => {
    const repoRoot = makeTempDir();
    const elizaRoot = path.join(repoRoot, "eliza");
    const targetPkg = path.join(
      repoRoot,
      "node_modules",
      "milady-test-link-pkg",
    );
    writeFile(
      path.join(targetPkg, "package.json"),
      '{"name":"milady-test-link-pkg"}',
    );

    expect(
      ensureElizaTypescriptDependencyLinks(elizaRoot, {
        dependencies: ["milady-test-link-pkg"],
      }),
    ).toBe(1);
    expect(
      fs.realpathSync(
        path.join(
          elizaRoot,
          "packages",
          "typescript",
          "node_modules",
          "milady-test-link-pkg",
        ),
      ),
    ).toBe(fs.realpathSync(targetPkg));
  });
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

describe("getTemporaryElizaWorkspaceEntries", () => {
  it("includes the root CI stub workspace for unpublished eliza plugins", () => {
    const elizaRoot = "/repo/eliza";
    const existingPaths = new Set([
      path.join(
        elizaRoot,
        "plugins",
        "plugin-sql",
        "typescript",
        "package.json",
      ),
      path.join(
        elizaRoot,
        "..",
        "scripts",
        "ci-stubs",
        "elizaos-plugin-wechat",
        "package.json",
      ),
    ]);

    expect(
      getTemporaryElizaWorkspaceEntries(elizaRoot, {
        pathExists: (targetPath) => existingPaths.has(targetPath),
      }),
    ).toEqual([
      "plugins/plugin-sql/typescript",
      "../scripts/ci-stubs/elizaos-plugin-wechat",
    ]);
  });

  it("uses the installable app-control workspace path when deciding whether to keep the stub", () => {
    const elizaRoot = "/repo/eliza";
    const existingPaths = new Set([
      path.join(
        elizaRoot,
        "..",
        "scripts",
        "ci-stubs",
        "elizaos-plugin-app-control",
        "package.json",
      ),
    ]);

    expect(
      getTemporaryElizaWorkspaceEntries(elizaRoot, {
        pathExists: (targetPath) => existingPaths.has(targetPath),
      }),
    ).toContain("../scripts/ci-stubs/elizaos-plugin-app-control");
  });

  it("skips the wechat CI stub when the real plugin workspace exists", () => {
    const elizaRoot = "/repo/eliza";
    const existingPaths = new Set([
      path.join(
        elizaRoot,
        "..",
        "scripts",
        "ci-stubs",
        "elizaos-plugin-wechat",
        "package.json",
      ),
      path.join(elizaRoot, "plugins", "plugin-wechat", "package.json"),
    ]);

    expect(
      getTemporaryElizaWorkspaceEntries(elizaRoot, {
        pathExists: (targetPath) => existingPaths.has(targetPath),
      }),
    ).toEqual([]);
  });

  it("includes cloud billing workspace when the nested package exists", () => {
    const elizaRoot = "/repo/eliza";
    const billingPkg = path.join(
      elizaRoot,
      "cloud",
      "packages",
      "services",
      "billing",
      "package.json",
    );
    const existingPaths = new Set([billingPkg]);

    expect(
      getTemporaryElizaWorkspaceEntries(elizaRoot, {
        pathExists: (targetPath) => existingPaths.has(targetPath),
      }),
    ).toEqual(["cloud/packages/services/billing"]);
  });
});

describe("getMissingConditionalElizaWorkspaceEntries", () => {
  it("flags the cloud billing workspace when it is listed but missing", () => {
    expect(
      getMissingConditionalElizaWorkspaceEntries(
        "/repo/eliza",
        ["cloud/packages/services/billing"],
        {
          pathExists: () => false,
        },
      ),
    ).toEqual(["cloud/packages/services/billing"]);
  });

  it("ignores conditional workspaces that exist on disk", () => {
    const elizaRoot = "/repo/eliza";
    const existingPaths = new Set([
      path.join(
        elizaRoot,
        "cloud",
        "packages",
        "services",
        "billing",
        "package.json",
      ),
    ]);

    expect(
      getMissingConditionalElizaWorkspaceEntries(
        elizaRoot,
        ["cloud/packages/services/billing"],
        {
          pathExists: (targetPath) => existingPaths.has(targetPath),
        },
      ),
    ).toEqual([]);
  });
});

describe("stripMissingConditionalElizaWorkspaces", () => {
  it("removes a missing cloud workspace from eliza/package.json", () => {
    const elizaRoot = makeTempDir();
    const packageJsonPath = path.join(elizaRoot, "package.json");
    writeFile(
      packageJsonPath,
      JSON.stringify(
        {
          name: "eliza",
          workspaces: ["packages/*", "cloud/packages/services/billing"],
        },
        null,
        2,
      ),
    );

    expect(stripMissingConditionalElizaWorkspaces(elizaRoot)).toEqual([
      "cloud/packages/services/billing",
    ]);
    expect(
      JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
        workspaces: string[];
      },
    ).toEqual({
      name: "eliza",
      workspaces: ["packages/*"],
    });
  });
});

describe("applyUnpublishedPluginStubOverrides", () => {
  it("removes stale CI stub overrides when the real plugin workspace exists", () => {
    const elizaRoot = makeTempDir();
    writeFile(
      path.join(elizaRoot, "package.json"),
      JSON.stringify(
        {
          name: "eliza",
          overrides: {
            "@elizaos/plugin-app-control":
              "file:../scripts/ci-stubs/elizaos-plugin-app-control",
            "@elizaos/plugin-wechat":
              "file:../scripts/ci-stubs/elizaos-plugin-wechat",
          },
        },
        null,
        2,
      ),
    );
    writeFile(
      path.join(
        elizaRoot,
        "..",
        "scripts",
        "ci-stubs",
        "elizaos-plugin-app-control",
        "package.json",
      ),
      '{"name":"@elizaos/plugin-app-control"}\n',
    );
    writeFile(
      path.join(
        elizaRoot,
        "..",
        "scripts",
        "ci-stubs",
        "elizaos-plugin-wechat",
        "package.json",
      ),
      '{"name":"@elizaos/plugin-wechat"}\n',
    );
    writeFile(
      path.join(
        elizaRoot,
        "plugins",
        "plugin-app-control",
        "typescript",
        "package.json",
      ),
      '{"name":"@elizaos/plugin-app-control"}\n',
    );
    writeFile(
      path.join(elizaRoot, "plugins", "plugin-wechat", "package.json"),
      '{"name":"@elizaos/plugin-wechat"}\n',
    );

    expect(applyUnpublishedPluginStubOverrides(elizaRoot)).toBe(2);
    expect(
      JSON.parse(fs.readFileSync(path.join(elizaRoot, "package.json"), "utf8")),
    ).not.toHaveProperty("overrides");
  });

  it("keeps the real wechat plugin package name aligned with the CI stub", () => {
    const stubPackage = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "scripts",
          "ci-stubs",
          "elizaos-plugin-wechat",
          "package.json",
        ),
        "utf8",
      ),
    ) as { name?: string };
    const realPackage = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "eliza",
          "plugins",
          "plugin-wechat",
          "package.json",
        ),
        "utf8",
      ),
    ) as { name?: string };

    expect(realPackage.name).toBe("@elizaos/plugin-wechat");
    expect(realPackage.name).toBe(stubPackage.name);
  });
});

describe("findInstalledPackageDir", () => {
  it("falls back to eliza workspace installs for nested plugin dependencies", () => {
    const repoRoot = makeTempDir();
    const elizaRoot = path.join(repoRoot, "eliza");
    const elizaInstall = path.join(
      elizaRoot,
      "node_modules",
      "@types",
      "bun",
      "package.json",
    );

    writeFile(elizaInstall, '{"name":"@types/bun"}');

    expect(findInstalledPackageDir(repoRoot, "@types/bun")).toBeNull();
    expect(
      findInstalledPackageDir(repoRoot, "@types/bun", undefined, null, {
        searchRoots: [repoRoot, elizaRoot],
      }),
    ).toBe(path.dirname(elizaInstall));
  });
});

describe("ensurePublishedElizaPackageLinks", () => {
  it("links published skip-mode packages from Bun's store into root and eliza node_modules", () => {
    const repoRoot = makeTempDir();
    const packageName = "@elizaos/plugin-local-embedding";
    const version = "2.0.0-alpha.12";
    const installedPackage = path.join(
      repoRoot,
      "node_modules",
      ".bun",
      "@elizaos+plugin-local-embedding@2.0.0-alpha.12",
      "node_modules",
      "@elizaos",
      "plugin-local-embedding",
    );

    writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ dependencies: { [packageName]: version } }, null, 2),
    );
    writeFile(
      path.join(installedPackage, "package.json"),
      JSON.stringify({ name: packageName, version }, null, 2),
    );

    expect(ensurePublishedElizaPackageLinks(repoRoot)).toBe(4);
    expect(
      fs.realpathSync(
        path.join(
          repoRoot,
          "node_modules",
          "@elizaos",
          "plugin-local-embedding",
        ),
      ),
    ).toBe(fs.realpathSync(installedPackage));
    expect(
      fs.realpathSync(
        path.join(
          repoRoot,
          "eliza",
          "node_modules",
          "@elizaos",
          "plugin-local-embedding",
        ),
      ),
    ).toBe(fs.realpathSync(installedPackage));
    expect(
      fs.realpathSync(
        path.join(
          repoRoot,
          "apps",
          "app",
          "node_modules",
          "@elizaos",
          "plugin-local-embedding",
        ),
      ),
    ).toBe(fs.realpathSync(installedPackage));
    expect(
      fs.realpathSync(
        path.join(
          repoRoot,
          "apps",
          "home",
          "node_modules",
          "@elizaos",
          "plugin-local-embedding",
        ),
      ),
    ).toBe(fs.realpathSync(installedPackage));
  });
});

describe("getUpstreamPackageLinks", () => {
  it("links nested eliza plugin workspaces into eliza node_modules", () => {
    const repoRoot = makeTempDir();
    const elizaRoot = path.join(repoRoot, "eliza");
    const pluginRoot = path.join(elizaRoot, "plugins", "plugin-agent-skills");
    const pluginPackage = path.join(pluginRoot, "typescript");

    writeFile(
      path.join(pluginRoot, "package.json"),
      '{"name":"@elizaos/plugin-agent-skills-root"}\n',
    );
    writeFile(
      path.join(pluginPackage, "package.json"),
      '{"name":"@elizaos/plugin-agent-skills"}\n',
    );

    const links = getUpstreamPackageLinks(repoRoot, {
      elizaRoot,
      pluginsRoot: path.join(elizaRoot, "plugins"),
    });

    expect(links).toContainEqual({
      linkPath: path.join(
        repoRoot,
        "eliza",
        "node_modules",
        "@elizaos",
        "plugin-agent-skills",
      ),
      targetPath: pluginPackage,
    });
    expect(
      links.some((link) => link.linkPath.includes("plugin-agent-skills-root")),
    ).toBe(false);
  });

  it("links local eliza packages into app workspace node_modules", () => {
    const repoRoot = makeTempDir();
    const elizaRoot = path.join(repoRoot, "eliza");
    const agentPackage = path.join(elizaRoot, "packages", "agent");
    const lifeopsPackage = path.join(elizaRoot, "apps", "app-lifeops");

    writeFile(
      path.join(agentPackage, "package.json"),
      '{"name":"@elizaos/agent"}\n',
    );
    fs.mkdirSync(path.join(agentPackage, "node_modules"), {
      recursive: true,
    });
    writeFile(
      path.join(lifeopsPackage, "package.json"),
      '{"name":"@elizaos/app-lifeops"}\n',
    );
    fs.mkdirSync(path.join(lifeopsPackage, "node_modules"), {
      recursive: true,
    });

    const links = getUpstreamPackageLinks(repoRoot, {
      elizaRoot,
      pluginsRoot: path.join(elizaRoot, "plugins"),
    });

    expect(links).toContainEqual({
      linkPath: path.join(lifeopsPackage, "node_modules", "@elizaos", "agent"),
      targetPath: agentPackage,
    });
    expect(
      links.some((link) =>
        link.linkPath.includes(path.join("packages", "agent", "node_modules")),
      ),
    ).toBe(false);
  });
});

describe("createPackageLink", () => {
  it("replaces a broken symlink before writing the new target", () => {
    const repoRoot = makeTempDir();
    const linkPath = path.join(
      repoRoot,
      "apps",
      "home",
      "node_modules",
      "@elizaos",
      "app-babylon",
    );
    const targetPath = path.join(repoRoot, "eliza", "apps", "app-babylon");

    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.mkdirSync(targetPath, { recursive: true });
    fs.symlinkSync("../../../../plugins/app-babylon", linkPath, "dir");

    expect(createPackageLink(linkPath, targetPath)).toBe(true);
    expect(fs.realpathSync(linkPath)).toBe(fs.realpathSync(targetPath));
  });
});

describe("ensureElizaAgentSkillsPluginBuild", () => {
  it("builds the nested agent-skills artifact when it is missing", async () => {
    const repoRoot = makeTempDir();
    const pluginPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-agent-skills",
      "typescript",
    );
    writeFile(path.join(pluginPackage, "package.json"), "{}\n");

    const runCommandImpl = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await expect(
      ensureElizaAgentSkillsPluginBuild(repoRoot, {
        runCommandImpl,
        log,
      }),
    ).resolves.toBe(true);

    expect(runCommandImpl).toHaveBeenCalledWith(
      "bun",
      [
        "build",
        "./src/index.ts",
        "--outdir",
        "./dist",
        "--target",
        "node",
        "--format",
        "esm",
        "--sourcemap=linked",
        "--external",
        "node:*",
        "--external",
        "@elizaos/core",
        "--external",
        "fflate",
      ],
      {
        cwd: pluginPackage,
        label:
          "bun build ./src/index.ts --outdir ./dist --target node --format esm --sourcemap=linked --external node:* --external @elizaos/core --external fflate (@elizaos/plugin-agent-skills)",
      },
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("@elizaos/plugin-agent-skills"),
    );
  });

  it("skips the nested agent-skills build when the artifact is current", async () => {
    const repoRoot = makeTempDir();
    const pluginPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-agent-skills",
      "typescript",
    );
    const manifestPath = path.join(pluginPackage, "package.json");
    const artifactPath = path.join(pluginPackage, "dist", "index.js");
    writeFile(manifestPath, "{}\n");
    writeFile(artifactPath, "export {};\n");

    const runCommandImpl = vi.fn();

    await expect(
      ensureElizaAgentSkillsPluginBuild(repoRoot, {
        pathExists: (targetPath) =>
          targetPath === manifestPath || targetPath === artifactPath,
        stat: (targetPath) =>
          ({
            mtimeMs: targetPath === manifestPath ? 1 : 2,
          }) as fs.Stats,
        runCommandImpl,
      }),
    ).resolves.toBe(false);

    expect(runCommandImpl).not.toHaveBeenCalled();
  });
});

describe("ensureRequiredElizaPluginBuilds", () => {
  it("builds plugin-telegram when the account auth subpath artifact is missing", async () => {
    const repoRoot = makeTempDir();
    const agentSkillsPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-agent-skills",
      "typescript",
    );
    const telegramPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-telegram",
    );
    const edgeTtsPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-edge-tts",
      "typescript",
    );
    const localEmbeddingPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-local-embedding",
      "typescript",
    );
    writeFile(path.join(agentSkillsPackage, "package.json"), "{}\n");
    writeFile(
      path.join(agentSkillsPackage, "dist", "index.js"),
      "export {};\n",
    );
    writeFile(path.join(telegramPackage, "package.json"), "{}\n");
    writeFile(path.join(edgeTtsPackage, "package.json"), "{}\n");
    writeFile(
      path.join(edgeTtsPackage, "dist", "node", "index.node.js"),
      "export {};\n",
    );
    writeFile(path.join(localEmbeddingPackage, "package.json"), "{}\n");
    writeFile(
      path.join(localEmbeddingPackage, "dist", "index.js"),
      "export {};\n",
    );

    const runCommandImpl = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await expect(
      ensureRequiredElizaPluginBuilds(repoRoot, {
        pathExists: (targetPath) =>
          targetPath.endsWith(path.join("package.json")) ||
          targetPath.endsWith(
            path.join("plugin-agent-skills", "typescript", "dist", "index.js"),
          ) ||
          targetPath.endsWith(
            path.join(
              "plugin-edge-tts",
              "typescript",
              "dist",
              "node",
              "index.node.js",
            ),
          ) ||
          targetPath.endsWith(
            path.join(
              "plugin-local-embedding",
              "typescript",
              "dist",
              "index.js",
            ),
          ),
        stat: () => ({ mtimeMs: 1 }) as fs.Stats,
        runCommandImpl,
        log,
      }),
    ).resolves.toBe(true);

    expect(runCommandImpl).toHaveBeenCalledTimes(1);
    expect(runCommandImpl).toHaveBeenCalledWith("bun", ["run", "build"], {
      cwd: telegramPackage,
      label: "bun run build (@elizaos/plugin-telegram)",
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("@elizaos/plugin-telegram"),
    );
  });

  it("builds plugin-edge-tts when the node export artifact is missing", async () => {
    const repoRoot = makeTempDir();
    const agentSkillsPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-agent-skills",
      "typescript",
    );
    const edgeTtsPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-edge-tts",
      "typescript",
    );
    const telegramPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-telegram",
    );
    const localEmbeddingPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-local-embedding",
      "typescript",
    );
    writeFile(path.join(agentSkillsPackage, "package.json"), "{}\n");
    writeFile(
      path.join(agentSkillsPackage, "dist", "index.js"),
      "export {};\n",
    );
    writeFile(path.join(edgeTtsPackage, "package.json"), "{}\n");
    writeFile(path.join(telegramPackage, "package.json"), "{}\n");
    writeFile(
      path.join(telegramPackage, "dist", "account-auth-service.js"),
      "export {};\n",
    );
    writeFile(path.join(localEmbeddingPackage, "package.json"), "{}\n");
    writeFile(
      path.join(localEmbeddingPackage, "dist", "index.js"),
      "export {};\n",
    );

    const runCommandImpl = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await expect(
      ensureRequiredElizaPluginBuilds(repoRoot, {
        pathExists: (targetPath) =>
          targetPath.endsWith(path.join("package.json")) ||
          targetPath.endsWith(
            path.join("plugin-agent-skills", "typescript", "dist", "index.js"),
          ) ||
          targetPath.endsWith(
            path.join("plugin-telegram", "dist", "account-auth-service.js"),
          ) ||
          targetPath.endsWith(
            path.join(
              "plugin-local-embedding",
              "typescript",
              "dist",
              "index.js",
            ),
          ),
        stat: () => ({ mtimeMs: 1 }) as fs.Stats,
        runCommandImpl,
        log,
      }),
    ).resolves.toBe(true);

    expect(runCommandImpl).toHaveBeenCalledTimes(1);
    expect(runCommandImpl).toHaveBeenCalledWith("bun", ["run", "build"], {
      cwd: edgeTtsPackage,
      label: "bun run build (@elizaos/plugin-edge-tts)",
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("@elizaos/plugin-edge-tts"),
    );
  });

  it("builds plugin-local-embedding when the runtime import artifact is missing", async () => {
    const repoRoot = makeTempDir();
    const agentSkillsPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-agent-skills",
      "typescript",
    );
    const telegramPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-telegram",
    );
    const edgeTtsPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-edge-tts",
      "typescript",
    );
    const localEmbeddingPackage = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-local-embedding",
      "typescript",
    );
    writeFile(path.join(agentSkillsPackage, "package.json"), "{}\n");
    writeFile(
      path.join(agentSkillsPackage, "dist", "index.js"),
      "export {};\n",
    );
    writeFile(path.join(telegramPackage, "package.json"), "{}\n");
    writeFile(
      path.join(telegramPackage, "dist", "account-auth-service.js"),
      "export {};\n",
    );
    writeFile(path.join(edgeTtsPackage, "package.json"), "{}\n");
    writeFile(
      path.join(edgeTtsPackage, "dist", "node", "index.node.js"),
      "export {};\n",
    );
    writeFile(path.join(localEmbeddingPackage, "package.json"), "{}\n");

    const runCommandImpl = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await expect(
      ensureRequiredElizaPluginBuilds(repoRoot, {
        pathExists: (targetPath) =>
          targetPath.endsWith(path.join("package.json")) ||
          targetPath.endsWith(
            path.join("plugin-agent-skills", "typescript", "dist", "index.js"),
          ) ||
          targetPath.endsWith(
            path.join("plugin-telegram", "dist", "account-auth-service.js"),
          ) ||
          targetPath.endsWith(
            path.join(
              "plugin-edge-tts",
              "typescript",
              "dist",
              "node",
              "index.node.js",
            ),
          ),
        stat: () => ({ mtimeMs: 1 }) as fs.Stats,
        runCommandImpl,
        log,
      }),
    ).resolves.toBe(true);

    expect(runCommandImpl).toHaveBeenCalledTimes(1);
    expect(runCommandImpl).toHaveBeenCalledWith("bun", ["run", "build"], {
      cwd: localEmbeddingPackage,
      label: "bun run build (@elizaos/plugin-local-embedding)",
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("@elizaos/plugin-local-embedding"),
    );
  });
});

describe("ensureElizaBuildOutputs", () => {
  it("always rebuilds @elizaos/core so nested plugin builds see fresh declarations", async () => {
    const elizaRoot = makeTempDir();
    writeFile(
      path.join(
        elizaRoot,
        "packages",
        "typescript",
        "src",
        "i18n",
        "generated",
        "validation-keyword-data.ts",
      ),
      "export {};\n",
    );
    writeFile(
      path.join(
        elizaRoot,
        "packages",
        "prompts",
        "dist",
        "typescript",
        "index.ts",
      ),
      "export {};\n",
    );
    writeFile(
      path.join(elizaRoot, "packages", "skills", "dist", "index.js"),
      "export {};\n",
    );

    const runCommandImpl = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await expect(
      ensureElizaBuildOutputs(elizaRoot, {
        runCommandImpl,
        log,
      }),
    ).resolves.toBeUndefined();

    expect(runCommandImpl).toHaveBeenCalledTimes(1);
    expect(runCommandImpl).toHaveBeenCalledWith("bun", ["run", "build"], {
      cwd: path.join(elizaRoot, "packages", "typescript"),
      label: "bun run build (@elizaos/core)",
    });
    expect(log).toHaveBeenCalledWith(
      "[setup-upstreams] Building @elizaos/core",
    );
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

  it("skips the install script when the bundled Bun executable already works", async () => {
    const runCommandImpl = vi.fn().mockResolvedValue(undefined);
    const workspaceRoot = "/repo/eliza";
    const bunExecutablePath = path.join(
      workspaceRoot,
      "node_modules",
      "bun",
      "bin",
      "bun.exe",
    );

    await expect(
      bootstrapBundledBunInstall(workspaceRoot, {
        env: { MILADY_NO_VISION_DEPS: "1" },
        pathExists: (targetPath) => targetPath === bunExecutablePath,
        runCommandImpl,
      }),
    ).resolves.toBe(false);

    expect(runCommandImpl).toHaveBeenCalledWith(
      path.join("node_modules", "bun", "bin", "bun.exe"),
      ["--version"],
      {
        cwd: workspaceRoot,
        label:
          "node_modules/bun/bin/bun.exe --version (eliza bun bootstrap probe)",
      },
    );
  });

  it("runs Bun's bundled install script after ignore-scripts installs", async () => {
    const runCommandImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("bun probe failed"))
      .mockResolvedValueOnce(undefined);
    const workspaceRoot = "/repo/eliza";
    const bunExecutablePath = path.join(
      workspaceRoot,
      "node_modules",
      "bun",
      "bin",
      "bun.exe",
    );
    const bunInstallScriptPath = path.join(
      workspaceRoot,
      "node_modules",
      "bun",
      "install.js",
    );

    await expect(
      bootstrapBundledBunInstall(workspaceRoot, {
        env: { MILADY_NO_VISION_DEPS: "1" },
        pathExists: (targetPath) =>
          targetPath === bunExecutablePath ||
          targetPath === bunInstallScriptPath,
        runCommandImpl,
      }),
    ).resolves.toBe(true);

    expect(runCommandImpl).toHaveBeenNthCalledWith(
      1,
      path.join("node_modules", "bun", "bin", "bun.exe"),
      ["--version"],
      {
        cwd: workspaceRoot,
        label:
          "node_modules/bun/bin/bun.exe --version (eliza bun bootstrap probe)",
      },
    );
    expect(runCommandImpl).toHaveBeenNthCalledWith(
      2,
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

describe("runElizaInstallWithRetry", () => {
  it("retries bun install once after a transient failure", async () => {
    const runCommandImpl = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("bun install (eliza) exited with code 1"),
      )
      .mockResolvedValueOnce(undefined);
    const wait = vi.fn().mockResolvedValue(undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      runElizaInstallWithRetry("/repo/eliza", {
        env: { MILADY_NO_VISION_DEPS: "1" },
        runCommandImpl,
        wait,
      }),
    ).resolves.toBeUndefined();

    expect(runCommandImpl).toHaveBeenNthCalledWith(
      1,
      "bun",
      ["install", "--ignore-scripts"],
      {
        cwd: "/repo/eliza",
        label: "bun install (eliza)",
      },
    );
    expect(runCommandImpl).toHaveBeenNthCalledWith(
      2,
      "bun",
      ["install", "--ignore-scripts"],
      {
        cwd: "/repo/eliza",
        label: "bun install (eliza)",
      },
    );
    expect(wait).toHaveBeenCalledWith(3000);
    expect(warnSpy).toHaveBeenCalledWith(
      "[setup-upstreams] bun install (eliza) failed on attempt 1; retrying once after 3000ms to recover from transient dependency fetch errors",
    );

    warnSpy.mockRestore();
  });

  it("rethrows the final install failure after the retry", async () => {
    const secondError = new Error("bun install (eliza) exited with code 1");
    const runCommandImpl = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("bun install (eliza) exited with code 1"),
      )
      .mockRejectedValueOnce(secondError);
    const wait = vi.fn().mockResolvedValue(undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      runElizaInstallWithRetry("/repo/eliza", {
        runCommandImpl,
        wait,
      }),
    ).rejects.toBe(secondError);

    expect(runCommandImpl).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
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

describe("applyTypeScriptIgnoreDeprecationsCompatPatch", () => {
  it("targets TypeScript 5 deprecation silencing when the repo toolchain is TypeScript 5", () => {
    const elizaRoot = makeTempDir();
    const repoRoot = makeTempDir();
    const declarationsPath = path.join(
      elizaRoot,
      "packages",
      "typescript",
      "tsconfig.declarations.json",
    );

    writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^5.9.3" } }, null, 2),
    );
    writeFile(
      declarationsPath,
      '{\n  "compilerOptions": {\n    "ignoreDeprecations": "6.0",\n    "baseUrl": "./src"\n  }\n}\n',
    );

    expect(
      applyTypeScriptIgnoreDeprecationsCompatPatch(elizaRoot, { repoRoot }),
    ).toBe(1);
    expect(fs.readFileSync(declarationsPath, "utf8")).toContain(
      '"ignoreDeprecations": "5.0"',
    );
  });

  it("upgrades TypeScript 5 deprecation silencing to TypeScript 6 when the repo toolchain is TypeScript 6", () => {
    const elizaRoot = makeTempDir();
    const repoRoot = makeTempDir();
    const declarationsPath = path.join(
      elizaRoot,
      "packages",
      "typescript",
      "tsconfig.declarations.json",
    );

    writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^6.0.0" } }, null, 2),
    );
    writeFile(
      declarationsPath,
      '{\n  "compilerOptions": {\n    "ignoreDeprecations": "5.0",\n    "baseUrl": "./src"\n  }\n}\n',
    );

    expect(
      applyTypeScriptIgnoreDeprecationsCompatPatch(elizaRoot, { repoRoot }),
    ).toBe(1);
    expect(fs.readFileSync(declarationsPath, "utf8")).toContain(
      '"ignoreDeprecations": "6.0"',
    );
  });

  it("upgrades plugin-agent-skills tsup config for TypeScript 6", () => {
    const elizaRoot = makeTempDir();
    const repoRoot = makeTempDir();
    const configPath = path.join(
      elizaRoot,
      "plugins",
      "plugin-agent-skills",
      "typescript",
      "tsconfig.json",
    );

    writeFile(
      path.join(elizaRoot, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^6.0.0" } }, null, 2),
    );
    writeFile(
      configPath,
      '{\n  "compilerOptions": {\n    "ignoreDeprecations": "5.0",\n    "baseUrl": "./src"\n  }\n}\n',
    );

    expect(
      applyTypeScriptIgnoreDeprecationsCompatPatch(elizaRoot, { repoRoot }),
    ).toBe(1);
    expect(fs.readFileSync(configPath, "utf8")).toContain(
      '"ignoreDeprecations": "6.0"',
    );
  });

  it("inserts plugin deprecation silencing when missing", () => {
    const elizaRoot = makeTempDir();
    const repoRoot = makeTempDir();
    const configPaths = [
      path.join(
        elizaRoot,
        "plugins",
        "plugin-agent-skills",
        "typescript",
        "tsconfig.json",
      ),
      path.join(
        elizaRoot,
        "plugins",
        "plugin-signal",
        "typescript",
        "tsconfig.json",
      ),
      path.join(elizaRoot, "plugins", "plugin-telegram", "tsconfig.json"),
      path.join(elizaRoot, "plugins", "plugin-telegram", "tsconfig.build.json"),
    ];

    writeFile(
      path.join(elizaRoot, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^6.0.0" } }, null, 2),
    );
    for (const configPath of configPaths) {
      writeFile(
        configPath,
        '{\n  "compilerOptions": {\n    "baseUrl": "./src"\n  }\n}\n',
      );
    }

    expect(
      applyTypeScriptIgnoreDeprecationsCompatPatch(elizaRoot, { repoRoot }),
    ).toBe(4);
    for (const configPath of configPaths) {
      expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toMatchObject({
        compilerOptions: { ignoreDeprecations: "6.0" },
      });
    }
  });

  it("downgrades tsup plugin configs to TypeScript 5-compatible deprecation silencing", () => {
    const elizaRoot = makeTempDir();
    const repoRoot = makeTempDir();
    const calendlyPath = path.join(
      elizaRoot,
      "plugins",
      "plugin-calendly",
      "tsconfig.json",
    );

    writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^5.9.3" } }, null, 2),
    );
    writeFile(
      calendlyPath,
      '{\n  "compilerOptions": {\n    "ignoreDeprecations": "6.0",\n    "baseUrl": "./src"\n  }\n}\n',
    );

    expect(
      applyTypeScriptIgnoreDeprecationsCompatPatch(elizaRoot, { repoRoot }),
    ).toBe(1);
    expect(fs.readFileSync(calendlyPath, "utf8")).toContain(
      '"ignoreDeprecations": "5.0"',
    );
  });
});

describe("resolveTypeScriptIgnoreDeprecationsTarget", () => {
  it("defaults to the TypeScript 5-compatible ignoreDeprecations value when the repo is missing a typescript pin", () => {
    const repoRoot = makeTempDir();

    writeFile(path.join(repoRoot, "package.json"), JSON.stringify({}, null, 2));

    expect(resolveTypeScriptIgnoreDeprecationsTarget(repoRoot)).toBe("5.0");
  });

  it("returns the TypeScript 6-compatible ignoreDeprecations value when the repo pins TypeScript 6", () => {
    const repoRoot = makeTempDir();

    writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^6.0.0" } }, null, 2),
    );

    expect(resolveTypeScriptIgnoreDeprecationsTarget(repoRoot)).toBe("6.0");
  });

  it("prefers the nested workspace TypeScript pin before falling back to the root repo", () => {
    const repoRoot = makeTempDir();
    const elizaRoot = makeTempDir();

    writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^5.9.3" } }, null, 2),
    );
    writeFile(
      path.join(elizaRoot, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^6.0.0" } }, null, 2),
    );

    expect(
      resolveTypeScriptIgnoreDeprecationsTarget(elizaRoot, {
        fallbackRoot: repoRoot,
      }),
    ).toBe("6.0");
  });
});

describe("applyPluginAnthropicCliUsagePatch", () => {
  it("normalizes Claude CLI usage fields to prompt/completion tokens", () => {
    const elizaRoot = makeTempDir();
    const claudeCliPath = path.join(
      elizaRoot,
      "plugins",
      "plugin-anthropic",
      "typescript",
      "utils",
      "claude-cli.ts",
    );

    writeFile(
      claudeCliPath,
      [
        "const usage = {",
        "    inputTokens: number;",
        "    outputTokens: number;",
        "};",
        "const mapped = {",
        "    inputTokens: entry.inputTokens,",
        "    outputTokens: entry.outputTokens,",
        "};",
        "emitModelUsageEvent(runtime, modelType, prompt, {",
        "      promptTokens: usage.inputTokens,",
        "      completionTokens: usage.outputTokens,",
        "});",
        "emitModelUsageEvent(runtime, modelType, prompt, {",
        "                promptTokens: usage.inputTokens,",
        "                completionTokens: usage.outputTokens,",
        "});",
      ].join("\n"),
    );

    expect(applyPluginAnthropicCliUsagePatch(elizaRoot)).toBe(4);
    const patched = fs.readFileSync(claudeCliPath, "utf8");
    expect(patched).toContain("promptTokens: number;");
    expect(patched).toContain("completionTokens: number;");
    expect(patched).toContain("promptTokens: entry.inputTokens,");
    expect(patched).toContain("completionTokens: entry.outputTokens,");
    expect(patched).toContain("promptTokens: usage.promptTokens,");
    expect(patched).toContain("completionTokens: usage.completionTokens,");
    expect(patched).not.toContain("usage.inputTokens");
    expect(patched).not.toContain("usage.outputTokens");
  });
});

describe("applyPluginAnthropicBunRuntimePatch", () => {
  it("rewrites plugin-anthropic Bun globals to a typed globalThis fallback", () => {
    const elizaRoot = makeTempDir();
    const initPath = path.join(
      elizaRoot,
      "plugins",
      "plugin-anthropic",
      "typescript",
      "init.ts",
    );
    const claudeCliPath = path.join(
      elizaRoot,
      "plugins",
      "plugin-anthropic",
      "typescript",
      "utils",
      "claude-cli.ts",
    );

    writeFile(
      initPath,
      [
        'if (authMode === "cli") {',
        "  try {",
        '        const result = Bun.spawnSync(["claude", "--version"], {',
        '          stdout: "pipe",',
        '          stderr: "pipe",',
        "        });",
        '        if (result.exitCode !== 0) throw new Error("claude not found");',
        "  } catch {}",
        "}",
      ].join("\n"),
    );
    writeFile(
      claudeCliPath,
      [
        "function parseUsage(",
        "  modelUsage: Record<string, ClaudeCliModelUsage> | undefined,",
        '): CliGenerateResult["usage"] {',
        "  const entry = modelUsage ? Object.values(modelUsage)[0] : undefined;",
        "  if (!entry) return null;",
        "  return {",
        "    promptTokens: entry.inputTokens,",
        "    completionTokens: entry.outputTokens,",
        "    totalTokens: entry.inputTokens + entry.outputTokens,",
        "  };",
        "}",
        "",
        "/**",
        " * Run a prompt through `claude -p` (non-streaming).",
        " */",
        'const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });',
        'const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });',
      ].join("\n"),
    );

    expect(applyPluginAnthropicBunRuntimePatch(elizaRoot)).toBe(4);
    const patchedInit = fs.readFileSync(initPath, "utf8");
    const patchedCli = fs.readFileSync(claudeCliPath, "utf8");

    expect(patchedInit).toContain(
      "const bunRuntime = (globalThis as typeof globalThis",
    );
    expect(patchedInit).toContain("if (!result || result.exitCode !== 0)");
    expect(patchedCli).toContain("function getBunRuntime()");
    expect(patchedCli).toContain("const proc = getBunRuntime().spawn");
    expect(patchedCli).not.toContain("Bun.spawn(");
  });

  it("patches the original upstream Claude CLI source before the usage rewrite runs", () => {
    const elizaRoot = makeTempDir();
    const claudeCliPath = path.join(
      elizaRoot,
      "plugins",
      "plugin-anthropic",
      "typescript",
      "utils",
      "claude-cli.ts",
    );

    writeFile(
      claudeCliPath,
      [
        "function parseUsage(",
        "  modelUsage: Record<string, ClaudeCliModelUsage> | undefined,",
        '): CliGenerateResult["usage"] {',
        "  const entry = modelUsage ? Object.values(modelUsage)[0] : undefined;",
        "  if (!entry) return null;",
        "  return {",
        "    inputTokens: entry.inputTokens,",
        "    outputTokens: entry.outputTokens,",
        "    totalTokens: entry.inputTokens + entry.outputTokens,",
        "  };",
        "}",
        "",
        "/**",
        " * Run a prompt through `claude -p` (non-streaming).",
        " */",
        'const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });',
      ].join("\n"),
    );

    expect(applyPluginAnthropicBunRuntimePatch(elizaRoot)).toBe(2);
    expect(applyPluginAnthropicCliUsagePatch(elizaRoot)).toBe(0);

    const patchedCli = fs.readFileSync(claudeCliPath, "utf8");
    expect(patchedCli).toContain("function getBunRuntime()");
    expect(patchedCli).toContain("promptTokens: entry.inputTokens");
    expect(patchedCli).toContain("completionTokens: entry.outputTokens");
    expect(patchedCli).toContain("const proc = getBunRuntime().spawn");
    expect(patchedCli).not.toContain("inputTokens: entry.inputTokens,");
    expect(patchedCli).not.toContain("outputTokens: entry.outputTokens,");
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

  it("adds 'bun-types' to compilerOptions.types when missing", () => {
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
    expect(parsed.compilerOptions.types).toContain("bun-types");
    expect(parsed.compilerOptions.types).toContain("node");
  });

  it("is a no-op when 'bun-types' is already present", () => {
    const pluginsRoot = makeTempDir();
    const initialConfig = {
      extends: "./tsconfig.json",
      compilerOptions: {
        rootDir: ".",
        outDir: "../dist",
        types: ["node", "bun-types"],
      },
      include: ["**/*.ts"],
    };
    const buildConfigPath = writeBuildConfig(pluginsRoot, initialConfig);
    const originalContents = fs.readFileSync(buildConfigPath, "utf8");

    expect(ensurePluginAnthropicBunTypes(pluginsRoot)).toBe(false);
    expect(fs.readFileSync(buildConfigPath, "utf8")).toBe(originalContents);
  });

  it("extends an existing types array without duplicating 'bun-types'", () => {
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
    expect(parsed.compilerOptions.types).toEqual(["node", "bun-types"]);
  });

  it("is a no-op when plugin-anthropic is not present", () => {
    const pluginsRoot = makeTempDir();
    expect(ensurePluginAnthropicBunTypes(pluginsRoot)).toBe(false);
  });
});

describe("patchPluginBuildTscBinPaths", () => {
  it("patches hardcoded plugin tsc paths to use the Windows cmd shim", () => {
    const pluginsRoot = makeTempDir();
    const pdfBuildScript = path.join(
      pluginsRoot,
      "plugin-pdf",
      "typescript",
      "build.ts",
    );
    const ollamaBuildScript = path.join(
      pluginsRoot,
      "plugin-ollama",
      "typescript",
      "build.ts",
    );

    writeFile(
      path.join(pluginsRoot, "plugin-pdf", "typescript", "package.json"),
      JSON.stringify({ name: "@elizaos/plugin-pdf" }),
    );
    writeFile(
      path.join(pluginsRoot, "plugin-ollama", "typescript", "package.json"),
      JSON.stringify({ name: "@elizaos/plugin-ollama" }),
    );
    writeFile(
      pdfBuildScript,
      'const tscPath = join(rootDir, "node_modules", ".bin", "tsc");\n',
    );
    writeFile(
      ollamaBuildScript,
      'const tscPath = join(ROOT, "node_modules", ".bin", "tsc");\n',
    );

    expect(patchPluginBuildTscBinPaths(pluginsRoot)).toBe(2);
    expect(fs.readFileSync(pdfBuildScript, "utf8")).toContain(
      'process.platform === "win32" ? "tsc.cmd" : "tsc"',
    );
    expect(fs.readFileSync(ollamaBuildScript, "utf8")).toContain(
      'process.platform === "win32" ? "tsc.cmd" : "tsc"',
    );
    expect(patchPluginBuildTscBinPaths(pluginsRoot)).toBe(0);
  });
});
