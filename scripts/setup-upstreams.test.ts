import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureElizaBuildOutputs,
  ensurePluginBuildOutputs,
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
  writeFileSync(
    path.join(packageDir, "package.json"),
    `${JSON.stringify(
      {
        name: packageName,
        scripts: {
          build: "echo build",
        },
      },
      null,
      2,
    )}\n`,
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
});
