import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findRuntimePluginExport, STATIC_ELIZA_PLUGINS } from "./eliza";
import {
  getLastFailedPluginNames,
  importPluginModuleFromPath,
  resolvePlugins,
} from "./plugin-resolver";

const ENV_KEYS = [
  "MILADY_STATE_DIR",
  "ELIZA_STATE_DIR",
  "ELIZA_WORKSPACE_ROOT",
  "ELIZA_SKIP_PLUGINS",
] as const;
const envBackup = new Map<string, string | undefined>();

let tempRoot = "";
const tempNodeModulesPackages = new Set<string>();
const repoNodeModulesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "node_modules",
);

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function writePackageJson(
  packageRoot: string,
  packageName: string,
): Promise<void> {
  await writeFile(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify(
      {
        name: packageName,
        type: "module",
        exports: "./index.js",
      },
      null,
      2,
    )}\n`,
  );
}

async function writePluginPackage(params: {
  packageRoot: string;
  packageName: string;
  dependencyName?: string;
  dependencyValue: string;
  versionValue: string;
}): Promise<void> {
  const {
    packageRoot,
    packageName,
    dependencyName,
    dependencyValue,
    versionValue,
  } = params;
  await writePackageJson(packageRoot, packageName);
  const dependencyImport = dependencyName
    ? `import { dependencyValue } from "${dependencyName}";\n`
    : `const dependencyValue = ${JSON.stringify(dependencyValue)};\n`;
  await writeFile(
    path.join(packageRoot, "index.js"),
    `${dependencyImport}import { versionValue } from "./version.js";\n\nexport const plugin = {\n  name: "plugin-hot-reload",\n  description: \`\${dependencyValue}:\${versionValue}\`,\n  actions: [],\n};\n`,
  );
  await writeFile(
    path.join(packageRoot, "version.js"),
    `export const versionValue = ${JSON.stringify(versionValue)};\n`,
  );
}

async function writeDependencyPackage(
  dependencyRoot: string,
  dependencyName: string,
  dependencyValue: string,
): Promise<void> {
  await writePackageJson(dependencyRoot, dependencyName);
  await writeFile(
    path.join(dependencyRoot, "index.js"),
    `export const dependencyValue = ${JSON.stringify(dependencyValue)};\n`,
  );
}

async function writeNestedDependencyPackage(params: {
  dependencyRoot: string;
  dependencyName: string;
  nestedDependencyName: string;
}): Promise<void> {
  await writePackageJson(params.dependencyRoot, params.dependencyName);
  await writeFile(
    path.join(params.dependencyRoot, "index.js"),
    `import { dependencyValue } from "${params.nestedDependencyName}";\nexport { dependencyValue };\n`,
  );
}

async function loadPluginDescription(
  installPath: string,
  packageName: string,
): Promise<string> {
  const moduleShape = await importPluginModuleFromPath(
    installPath,
    packageName,
  );
  const plugin = findRuntimePluginExport(moduleShape);
  expect(plugin).not.toBeNull();
  expect(plugin?.description).toEqual(expect.any(String));
  return plugin?.description ?? "";
}

function sanitizePluginCacheSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function findLatestStagedImportRoot(
  packageName: string,
): Promise<string> {
  const stagingBaseDir = path.join(
    process.env.MILADY_STATE_DIR ?? "",
    "plugins",
    ".runtime-imports",
    sanitizePluginCacheSegment(packageName),
  );
  const entries = await fs.readdir(stagingBaseDir, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  expect(dirs.length).toBeGreaterThan(0);
  return path.join(stagingBaseDir, dirs[dirs.length - 1], "root");
}

describe("personality plugin wiring", () => {
  it("exposes the expected runtime capabilities from the static plugin map", () => {
    const personalityModule = STATIC_ELIZA_PLUGINS[
      "@elizaos/plugin-personality"
    ] as Parameters<typeof findRuntimePluginExport>[0];

    const plugin = findRuntimePluginExport(personalityModule);

    expect(plugin).toMatchObject({
      name: "@elizaos/plugin-personality",
      description: expect.any(String),
    });
    expect(plugin?.actions?.map((action) => action.name)).toContain(
      "MODIFY_CHARACTER",
    );
    expect(plugin?.providers?.map((provider) => provider.name)).toContain(
      "userPersonalityPreferences",
    );
    expect(plugin?.evaluators?.map((evaluator) => evaluator.name)).toContain(
      "CHARACTER_EVOLUTION",
    );
  });
});

describe("importPluginModuleFromPath", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-plugin-import-"),
    );
    for (const key of ENV_KEYS) {
      envBackup.set(key, process.env[key]);
    }
    process.env.MILADY_STATE_DIR = path.join(tempRoot, "state");
    delete process.env.ELIZA_STATE_DIR;
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      const previousValue = envBackup.get(key);
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
    envBackup.clear();
    for (const packageRoot of tempNodeModulesPackages) {
      await fs.rm(packageRoot, { recursive: true, force: true });
    }
    tempNodeModulesPackages.clear();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("reloads changed relative modules for git-style plugin installs", async () => {
    const packageName = "@acme/plugin-hot-reload";
    const installPath = path.join(tempRoot, "git-install");
    const dependencyRoot = path.join(installPath, "node_modules", "dep-helper");

    await writePluginPackage({
      packageRoot: installPath,
      packageName,
      dependencyName: "dep-helper",
      dependencyValue: "unused",
      versionValue: "v1",
    });
    await writeDependencyPackage(dependencyRoot, "dep-helper", "dep-v1");

    await expect(loadPluginDescription(installPath, packageName)).resolves.toBe(
      "dep-v1:v1",
    );

    await writeFile(
      path.join(installPath, "version.js"),
      'export const versionValue = "v2";\n',
    );

    await expect(loadPluginDescription(installPath, packageName)).resolves.toBe(
      "dep-v1:v2",
    );
  });

  it("reloads changed bundled dependencies for npm-style installs", async () => {
    const packageName = "@acme/plugin-hot-reload";
    const installPath = path.join(tempRoot, "npm-install");
    const packageRoot = path.join(
      installPath,
      "node_modules",
      "@acme",
      "plugin-hot-reload",
    );
    const dependencyRoot = path.join(installPath, "node_modules", "dep-helper");

    await writePluginPackage({
      packageRoot,
      packageName,
      dependencyName: "dep-helper",
      dependencyValue: "unused",
      versionValue: "v1",
    });
    await writeDependencyPackage(dependencyRoot, "dep-helper", "dep-v1");

    await expect(loadPluginDescription(installPath, packageName)).resolves.toBe(
      "dep-v1:v1",
    );

    await writeFile(
      path.join(packageRoot, "version.js"),
      'export const versionValue = "v2";\n',
    );
    await writeFile(
      path.join(dependencyRoot, "index.js"),
      'export const dependencyValue = "dep-v2";\n',
    );

    await expect(loadPluginDescription(installPath, packageName)).resolves.toBe(
      "dep-v2:v2",
    );
  });

  it("preserves ancestor node_modules resolution for workspace-style packages", async () => {
    const packageName = "@acme/plugin-hot-reload";
    const workspaceRoot = path.join(tempRoot, "workspace");
    const installPath = path.join(
      workspaceRoot,
      "packages",
      "plugin-hot-reload",
    );
    const dependencyRoot = path.join(
      workspaceRoot,
      "node_modules",
      "dep-helper",
    );

    await writePluginPackage({
      packageRoot: installPath,
      packageName,
      dependencyName: "dep-helper",
      dependencyValue: "unused",
      versionValue: "v1",
    });
    await writeDependencyPackage(dependencyRoot, "dep-helper", "shared-dep");

    await expect(loadPluginDescription(installPath, packageName)).resolves.toBe(
      "shared-dep:v1",
    );

    await writeFile(
      path.join(installPath, "version.js"),
      'export const versionValue = "v2";\n',
    );

    await expect(loadPluginDescription(installPath, packageName)).resolves.toBe(
      "shared-dep:v2",
    );
  });

  it("preserves hoisted transitive dependencies for workspace-style packages with local node_modules", async () => {
    const packageName = "@acme/plugin-hot-reload";
    const workspaceRoot = path.join(tempRoot, "workspace");
    const installPath = path.join(
      workspaceRoot,
      "packages",
      "plugin-hot-reload",
    );
    const hoistedDependencyRoot = path.join(
      workspaceRoot,
      "node_modules",
      "dep-helper",
    );
    const directDependencyRoot = path.join(
      installPath,
      "node_modules",
      "nested-helper",
    );

    await writePluginPackage({
      packageRoot: installPath,
      packageName,
      dependencyName: "nested-helper",
      dependencyValue: "unused",
      versionValue: "v1",
    });
    await writeDependencyPackage(
      hoistedDependencyRoot,
      "dep-helper",
      "shared-dep",
    );
    await writeNestedDependencyPackage({
      dependencyRoot: directDependencyRoot,
      dependencyName: "nested-helper",
      nestedDependencyName: "dep-helper",
    });

    await expect(loadPluginDescription(installPath, packageName)).resolves.toBe(
      "shared-dep:v1",
    );
  });

  it("symlinks staged node_modules entries instead of dereferencing workspace dependencies", async () => {
    const packageName = "@acme/plugin-hot-reload";
    const workspaceRoot = path.join(tempRoot, "workspace");
    const installPath = path.join(
      workspaceRoot,
      "packages",
      "plugin-hot-reload",
    );
    const dependencyRoot = path.join(
      workspaceRoot,
      "node_modules",
      "dep-helper",
    );

    await writePluginPackage({
      packageRoot: installPath,
      packageName,
      dependencyName: "dep-helper",
      dependencyValue: "unused",
      versionValue: "v1",
    });
    await writeDependencyPackage(dependencyRoot, "dep-helper", "shared-dep");
    await fs.mkdir(path.join(installPath, "node_modules"), { recursive: true });
    await fs.symlink(
      dependencyRoot,
      path.join(installPath, "node_modules", "dep-helper"),
      "dir",
    );

    await expect(loadPluginDescription(installPath, packageName)).resolves.toBe(
      "shared-dep:v1",
    );

    const stagedImportRoot = await findLatestStagedImportRoot(packageName);
    const stagedDependencyPath = path.join(
      stagedImportRoot,
      "node_modules",
      "dep-helper",
    );
    const stagedDependencyStat = await fs.lstat(stagedDependencyPath);

    expect(stagedDependencyStat.isSymbolicLink()).toBe(true);
  });
});

describe("resolvePlugins", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-plugin-import-"),
    );
    for (const key of ENV_KEYS) {
      envBackup.set(key, process.env[key]);
    }
    process.env.MILADY_STATE_DIR = path.join(tempRoot, "state");
    delete process.env.ELIZA_STATE_DIR;
    process.env.ELIZA_WORKSPACE_ROOT = tempRoot;
  });

  afterEach(async () => {
    delete STATIC_ELIZA_PLUGINS["@elizaos/plugin-hot-reload"];
    delete STATIC_ELIZA_PLUGINS["@elizaos/plugin-workspace-node-modules"];
    for (const key of ENV_KEYS) {
      const previousValue = envBackup.get(key);
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
    envBackup.clear();
    for (const packageRoot of tempNodeModulesPackages) {
      await fs.rm(packageRoot, { recursive: true, force: true });
    }
    tempNodeModulesPackages.clear();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("prefers static official plugin modules over workspace overrides", async () => {
    const pluginName = "@elizaos/plugin-hot-reload";
    const workspacePluginRoot = path.join(
      tempRoot,
      "plugins",
      "plugin-hot-reload",
    );
    STATIC_ELIZA_PLUGINS[pluginName] = {
      default: {
        name: "static-hot-reload",
        description: "static",
        actions: [],
      },
    };

    await writePackageJson(workspacePluginRoot, pluginName);
    await writeFile(
      path.join(workspacePluginRoot, "index.js"),
      'throw new Error("workspace override should not load");\n',
    );

    const resolved = await resolvePlugins(
      {
        plugins: {
          allow: [pluginName],
        },
      } as never,
      { quiet: true },
    );

    expect(
      resolved.find((plugin) => plugin.name === pluginName)?.plugin.name,
    ).toBe("static-hot-reload");
  });

  it("prefers repo node_modules over staged workspace imports for official plugins", async () => {
    const pluginName = "@elizaos/plugin-workspace-node-modules";
    const workspacePluginRoot = path.join(
      tempRoot,
      "plugins",
      "plugin-workspace-node-modules",
      "typescript",
    );
    const nodeModulesPluginRoot = path.join(
      repoNodeModulesRoot,
      "@elizaos",
      "plugin-workspace-node-modules",
    );
    tempNodeModulesPackages.add(nodeModulesPluginRoot);

    await writePackageJson(workspacePluginRoot, pluginName);
    await writeFile(
      path.join(workspacePluginRoot, "index.js"),
      'throw new Error("workspace override should not load");\n',
    );

    await writePackageJson(nodeModulesPluginRoot, pluginName);
    await writeFile(
      path.join(nodeModulesPluginRoot, "index.js"),
      'export const plugin = { name: "node-modules-hot-reload", description: "node-modules", actions: [] };\n',
    );

    const resolved = await resolvePlugins(
      {
        plugins: {
          allow: [pluginName],
        },
      } as never,
      { quiet: true },
    );

    expect(
      resolved.find((plugin) => plugin.name === pluginName)?.plugin.name,
    ).toBe("node-modules-hot-reload");
  });

  it("tracks failed plugins and honors ELIZA_SKIP_PLUGINS", async () => {
    const missingPlugin = "@acme/plugin-missing";

    const failed = await resolvePlugins(
      {
        plugins: {
          allow: [missingPlugin],
        },
      } as never,
      { quiet: true },
    );

    expect(failed.map((plugin) => plugin.name)).not.toContain(missingPlugin);
    expect(getLastFailedPluginNames()).toContain(missingPlugin);

    process.env.ELIZA_SKIP_PLUGINS = missingPlugin;
    const skipped = await resolvePlugins(
      {
        plugins: {
          allow: [missingPlugin],
        },
      } as never,
      { quiet: true },
    );

    expect(skipped.map((plugin) => plugin.name)).not.toContain(missingPlugin);
    expect(getLastFailedPluginNames()).toEqual([]);
  });
});
