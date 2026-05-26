import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureElizaBuildOutputs,
  ensurePluginBuildOutputs,
  ensurePluginDependencyLinks,
  getUnavailableLocalPluginPackageNames,
} from "./setup-upstreams.mjs";

const tempDirs: string[] = [];

function createTempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "milady-setup-upstreams-"));
  tempDirs.push(dir);
  return dir;
}

function writePackageJson(packageDir: string, packageName: string) {
  mkdirSync(packageDir, { recursive: true });
  const packageJson = JSON.stringify(
    {
      name: packageName,
      scripts: {
        build: "echo build",
      },
    },
    null,
    2,
  );
  writeFileSync(path.join(packageDir, "package.json"), `${packageJson}\n`);
}

function writePackageJsonRecord(packageDir: string, packageJson: object) {
  mkdirSync(packageDir, { recursive: true });
  const packageJsonContent = JSON.stringify(packageJson, null, 2);
  writeFileSync(
    path.join(packageDir, "package.json"),
    `${packageJsonContent}\n`,
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("setup-upstreams cloud-coupled plugins", () => {
  it("builds app-core before linking local upstream packages", async () => {
    const repoRoot = createTempDir();
    const elizaRoot = path.join(repoRoot, "eliza");
    const builtLabels: string[] = [];

    await ensureElizaBuildOutputs(elizaRoot, {
      pathExists: (targetPath: string) => {
        if (
          targetPath.endsWith(
            path.join("packages", "app-core", "dist", "index.js"),
          )
        ) {
          return false;
        }
        return true;
      },
      runCommandImpl: async (
        _command: string,
        _args: string[],
        options: { label?: string },
      ) => {
        if (options.label) {
          builtLabels.push(options.label);
        }
      },
    });

    expect(builtLabels).toContain("bun run build (@elizaos/app-core)");
  });

  it("always rebuilds shared before linking local upstream packages", async () => {
    const repoRoot = createTempDir();
    const elizaRoot = path.join(repoRoot, "eliza");
    const builtLabels: string[] = [];

    await ensureElizaBuildOutputs(elizaRoot, {
      pathExists: () => true,
      runCommandImpl: async (
        _command: string,
        _args: string[],
        options: { label?: string },
      ) => {
        if (options.label) {
          builtLabels.push(options.label);
        }
      },
    });

    expect(builtLabels).toContain("bun run build (@elizaos/shared)");
  });

  it("builds vault before linking local upstream packages", async () => {
    const repoRoot = createTempDir();
    const elizaRoot = path.join(repoRoot, "eliza");
    const builtLabels: string[] = [];

    await ensureElizaBuildOutputs(elizaRoot, {
      pathExists: (targetPath: string) => {
        if (
          targetPath.endsWith(
            path.join("packages", "vault", "dist", "index.js"),
          )
        ) {
          return false;
        }
        return true;
      },
      runCommandImpl: async (
        _command: string,
        _args: string[],
        options: { label?: string },
      ) => {
        if (options.label) {
          builtLabels.push(options.label);
        }
      },
    });

    expect(builtLabels).toContain("bun run build (@elizaos/vault)");
  });

  it("builds desktop remote runtime packages before linking local upstream packages", async () => {
    const repoRoot = createTempDir();
    const elizaRoot = path.join(repoRoot, "eliza");
    const builtLabels: string[] = [];

    await ensureElizaBuildOutputs(elizaRoot, {
      pathExists: (targetPath: string) => {
        if (
          targetPath.endsWith(
            path.join("packages", "security", "dist", "index.js"),
          ) ||
          targetPath.endsWith(
            path.join("packages", "plugin-remote-manifest", "dist", "index.js"),
          ) ||
          targetPath.endsWith(
            path.join("packages", "plugin-worker-runtime", "dist", "index.js"),
          )
        ) {
          return false;
        }
        return true;
      },
      runCommandImpl: async (
        _command: string,
        _args: string[],
        options: { label?: string },
      ) => {
        if (options.label) {
          builtLabels.push(options.label);
        }
      },
    });

    expect(builtLabels).toEqual(
      expect.arrayContaining([
        "bun run build (@elizaos/security)",
        "bun run build (@elizaos/plugin-remote-manifest)",
        "bun run build (@elizaos/plugin-worker-runtime)",
      ]),
    );
  });

  it("marks elizaCloud unavailable when cloud SDK source is absent", () => {
    const repoRoot = createTempDir();
    const elizaRoot = path.join(repoRoot, "eliza");
    mkdirSync(elizaRoot, { recursive: true });

    expect([...getUnavailableLocalPluginPackageNames(elizaRoot)]).toEqual([
      "@elizaos/plugin-elizacloud",
    ]);

    mkdirSync(path.join(elizaRoot, "cloud", "packages", "sdk"), {
      recursive: true,
    });
    writeFileSync(
      path.join(elizaRoot, "cloud", "packages", "sdk", "package.json"),
      '{"name":"@elizaos/cloud-sdk"}\n',
    );

    expect([...getUnavailableLocalPluginPackageNames(elizaRoot)]).toEqual([]);
  });

  it("does not build excluded local plugin packages", async () => {
    const repoRoot = createTempDir();
    const pluginsRoot = path.join(repoRoot, "eliza", "plugins");
    writePackageJson(
      path.join(pluginsRoot, "plugin-elizacloud"),
      "@elizaos/plugin-elizacloud",
    );
    writePackageJson(
      path.join(pluginsRoot, "plugin-zai"),
      "@elizaos/plugin-zai",
    );

    const builtPackages: string[] = [];
    await ensurePluginBuildOutputs(pluginsRoot, {
      excludedPackageNames: new Set(["@elizaos/plugin-elizacloud"]),
      pathExists: existsSync,
      requiredPackageNames: new Set(["@elizaos/plugin-zai"]),
      runCommandImpl: async (
        _command: string,
        _args: string[],
        options: { cwd?: string },
      ) => {
        if (!options.cwd) {
          throw new Error("expected plugin build cwd");
        }
        builtPackages.push(path.basename(options.cwd));
      },
    });

    expect(builtPackages).toEqual(["plugin-zai"]);
  });

  it("links plugin dependencies to an installed version that matches the requested range", () => {
    const repoRoot = createTempDir();
    const elizaRoot = path.join(repoRoot, "eliza");
    const pluginsRoot = path.join(elizaRoot, "plugins");
    const pluginRoot = path.join(pluginsRoot, "plugin-social-alpha");
    const v3PackageDir = path.join(
      elizaRoot,
      "node_modules",
      ".bun",
      "tailwindcss@3.4.19+hash",
      "node_modules",
      "tailwindcss",
    );
    const v4PackageDir = path.join(
      elizaRoot,
      "node_modules",
      ".bun",
      "tailwindcss@4.2.4",
      "node_modules",
      "tailwindcss",
    );
    writePackageJsonRecord(v3PackageDir, {
      name: "tailwindcss",
      version: "3.4.19",
    });
    writePackageJsonRecord(v4PackageDir, {
      name: "tailwindcss",
      version: "4.2.4",
    });
    mkdirSync(path.join(elizaRoot, "node_modules"), { recursive: true });
    symlinkSync(
      v3PackageDir,
      path.join(elizaRoot, "node_modules", "tailwindcss"),
      "dir",
    );
    writePackageJsonRecord(pluginRoot, {
      name: "@elizaos/plugin-social-alpha",
      dependencies: {
        tailwindcss: "^4.0.0",
      },
    });

    ensurePluginDependencyLinks(repoRoot, pluginsRoot);

    expect(
      realpathSync(path.join(pluginRoot, "node_modules", "tailwindcss")),
    ).toBe(realpathSync(v4PackageDir));
  });
});
