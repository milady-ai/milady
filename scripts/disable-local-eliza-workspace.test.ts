import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempDirManager } from "../test/helpers/temp-dir";
import {
  CI_OVERRIDE_SPECIFIERS,
  collectWorkspaceProtocolDependencyNames,
  disableLocalElizaWorkspace,
  ELIZA_RUNTIME_CI_OVERRIDE_SPECIFIERS,
  LLAMA_CPP_CAPACITOR_PATCH_PATH,
  PINNED_VERSION_SOURCE_OVERRIDE,
  PINNED_VERSION_SOURCE_TEMPLATE,
  PINNED_VERSION_SOURCE_WORKSPACE,
  resolveCiOverrideSpecifiers,
  resolvePublishSafePinnedVersions,
} from "./disable-local-eliza-workspace.mjs";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type PackageWithDependencies = {
  dependencies?: Record<string, string>;
};

function isPackageWithDependencies(
  value: unknown,
): value is PackageWithDependencies {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value.dependencies === undefined ||
      (typeof value.dependencies === "object" &&
        value.dependencies !== null &&
        !Array.isArray(value.dependencies) &&
        Object.values(value.dependencies).every(
          (dependency) => typeof dependency === "string",
        )))
  );
}

function writeJson(filePath: string, value: JsonValue) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const { makeTempDir, cleanupTempDirs } = createTempDirManager(
  "milady-disable-eliza-",
);

afterEach(() => {
  cleanupTempDirs();
});

describe("disable-local-eliza-workspace", () => {
  it("falls back unpublished workspace-derived versions to the latest published alpha", () => {
    const pinnedVersions = new Map([
      ["@elizaos/core", "2.0.0-alpha.153"],
      ["@elizaos/agent", "2.0.0-alpha.153"],
      ["@elizaos/plugin-openrouter", "2.0.0-alpha.13"],
    ]);
    const versionSources = new Map([
      ["@elizaos/core", PINNED_VERSION_SOURCE_WORKSPACE],
      ["@elizaos/agent", PINNED_VERSION_SOURCE_TEMPLATE],
      ["@elizaos/plugin-openrouter", PINNED_VERSION_SOURCE_OVERRIDE],
    ]);
    const dependencyNames = new Set([
      "@elizaos/core",
      "@elizaos/agent",
      "@elizaos/plugin-openrouter",
    ]);
    const readRegistryInfo = vi.fn((packageName: string) => {
      if (packageName === "@elizaos/core" || packageName === "@elizaos/agent") {
        return {
          versions: ["2.0.0-alpha.152"],
          "dist-tags": {
            alpha: "2.0.0-alpha.152",
            latest: "0.25.9",
          },
          version: "0.25.9",
        };
      }

      throw new Error(`unexpected registry read for ${packageName}`);
    });

    const resolved = resolvePublishSafePinnedVersions(pinnedVersions, {
      dependencyNames,
      versionSources,
      readRegistryInfo,
      log: () => {},
      warn: () => {},
    });

    expect(resolved).toEqual(
      new Map([
        ["@elizaos/core", "2.0.0-alpha.152"],
        ["@elizaos/agent", "2.0.0-alpha.152"],
        ["@elizaos/plugin-openrouter", "2.0.0-alpha.13"],
      ]),
    );
    expect(readRegistryInfo).toHaveBeenCalledTimes(2);
  });

  it("collects workspace protocol dependencies and excludes local-only packages", () => {
    const dependencyNames = collectWorkspaceProtocolDependencyNames(
      {
        dependencies: {
          "@elizaos/core": "workspace:*",
          "@elizaos/shared": "workspace:*",
          react: "^19.2.4",
        },
        overrides: {
          "@elizaos/agent": "workspace:*",
        },
      },
      {
        localOnlyPackages: new Set(["@elizaos/shared"]),
      },
    );

    expect(dependencyNames).toEqual(
      new Set(["@elizaos/core", "@elizaos/agent"]),
    );
  });

  it("rewrites disabled eliza workspace packages that stay on disk in rewrite-only CI", () => {
    const repoRoot = makeTempDir();
    writeJson(path.join(repoRoot, "package.json"), {
      name: "milady-test",
      workspaces: ["eliza/packages/*", "eliza/plugins/*", "packages/*"],
      dependencies: {
        "@elizaos/core": "workspace:*",
        "@elizaos/plugin-agent-orchestrator": "workspace:*",
        "@elizaos/skills": "workspace:*",
      },
      overrides: {
        "@elizaos/core": "2.0.0-alpha.163",
      },
    });
    writeJson(
      path.join(repoRoot, "eliza", "packages", "typescript", "package.json"),
      {
        name: "@elizaos/typescript",
        version: "2.0.0-alpha.163",
      },
    );
    writeJson(
      path.join(repoRoot, "eliza", "packages", "skills", "package.json"),
      {
        name: "@elizaos/skills",
        version: "2.0.0-alpha.163",
      },
    );
    writeJson(
      path.join(
        repoRoot,
        "eliza",
        "plugins",
        "plugin-agent-orchestrator",
        "package.json",
      ),
      {
        name: "@elizaos/plugin-agent-orchestrator",
        version: "0.6.2-alpha.0",
      },
    );
    writeJson(
      path.join(repoRoot, "eliza", "packages", "agent", "package.json"),
      {
        name: "@elizaos/agent",
        dependencies: {
          "@elizaos/core": "workspace:*",
          "@elizaos/plugin-agent-orchestrator": "workspace:*",
          "@elizaos/skills": "workspace:*",
        },
      },
    );

    disableLocalElizaWorkspace(repoRoot, {
      log: () => {},
      warn: () => {},
      errorLog: () => {},
    });

    const agentPackageRaw: unknown = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "eliza", "packages", "agent", "package.json"),
        "utf8",
      ),
    );
    if (!isPackageWithDependencies(agentPackageRaw)) {
      throw new Error("agent package.json fixture is missing dependencies");
    }
    const agentPackage = agentPackageRaw;
    expect(agentPackage.dependencies).toMatchObject({
      "@elizaos/core": "2.0.0-alpha.163",
      "@elizaos/plugin-agent-orchestrator": "0.6.2-alpha.0",
      "@elizaos/skills": "workspace:*",
    });

    const rootPackage = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    );
    expect(rootPackage.workspaces).toContain("eliza/packages/skills");
    expect(rootPackage.overrides).toMatchObject({
      "@elizaos/skills":
        resolveCiOverrideSpecifiers(repoRoot)["@elizaos/skills"],
    });
  });

  it("repairs known malformed eliza patch files before install", () => {
    const repoRoot = makeTempDir();
    writeJson(path.join(repoRoot, "package.json"), {
      name: "milady-test",
      workspaces: ["eliza/packages/*"],
      overrides: {
        "@elizaos/core": "2.0.0-alpha.163",
      },
    });
    writeJson(
      path.join(repoRoot, "eliza", "packages", "typescript", "package.json"),
      {
        name: "@elizaos/typescript",
        version: "2.0.0-alpha.163",
      },
    );
    const patchPath = path.join(repoRoot, LLAMA_CPP_CAPACITOR_PATCH_PATH);
    fs.mkdirSync(path.dirname(patchPath), { recursive: true });
    fs.writeFileSync(
      patchPath,
      [
        "diff --git a/android/build.gradle b/android/build.gradle",
        "@@ -18,7 +18,7 @@ apply plugin: 'com.android.library'",
        " ",
        " android {",
        '-    namespace "ai.annadata.plugin.capacitor"',
        '+    namespace = "ai.annadata.plugin.capacitor"',
        "     compileSdk project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 35",
        "     defaultConfig {",
        "         minSdkVersion project.hasProperty('minSdkVersion') ? rootProject.ext.minSdkVersion : 23",
        "",
      ].join("\n"),
    );

    disableLocalElizaWorkspace(repoRoot, {
      log: () => {},
      warn: () => {},
      errorLog: () => {},
    });

    expect(fs.readFileSync(patchPath, "utf8")).toContain(
      "@@ -18,6 +18,6 @@ apply plugin: 'com.android.library'",
    );
  });

  it("rewrites nested installable package manifests under app-core platforms", () => {
    const repoRoot = makeTempDir();
    writeJson(path.join(repoRoot, "package.json"), {
      name: "milady-test",
      workspaces: ["eliza/packages/*"],
      overrides: {
        "@elizaos/core": "2.0.0-alpha.163",
        "@elizaos/shared": "2.0.0-alpha.163",
      },
    });
    writeJson(
      path.join(repoRoot, "eliza", "packages", "typescript", "package.json"),
      {
        name: "@elizaos/typescript",
        version: "2.0.0-alpha.163",
      },
    );
    writeJson(
      path.join(repoRoot, "eliza", "packages", "shared", "package.json"),
      {
        name: "@elizaos/shared",
        version: "2.0.0-alpha.0",
      },
    );
    writeJson(
      path.join(
        repoRoot,
        "eliza",
        "packages",
        "app-core",
        "platforms",
        "electrobun",
        "package.json",
      ),
      {
        name: "@elizaos/electrobun",
        dependencies: {
          "@elizaos/shared": "workspace:*",
          electrobun: "^1.16.0",
        },
      },
    );

    disableLocalElizaWorkspace(repoRoot, {
      log: () => {},
      warn: () => {},
      errorLog: () => {},
    });

    const electrobunPackageRaw: unknown = JSON.parse(
      fs.readFileSync(
        path.join(
          repoRoot,
          "eliza",
          "packages",
          "app-core",
          "platforms",
          "electrobun",
          "package.json",
        ),
        "utf8",
      ),
    );
    if (!isPackageWithDependencies(electrobunPackageRaw)) {
      throw new Error(
        "electrobun package.json fixture is missing dependencies",
      );
    }
    expect(electrobunPackageRaw.dependencies).toMatchObject({
      "@elizaos/shared": "file:../../../shared",
    });
  });

  it("injects the renamed-workspace @elizaos/ui override for CI rewrites", () => {
    const repoRoot = makeTempDir();
    const originalRenameSetting =
      process.env.MILADY_DISABLE_LOCAL_UPSTREAMS_RENAME;
    writeJson(path.join(repoRoot, "package.json"), {
      name: "milady-test",
      workspaces: ["eliza/packages/*"],
      overrides: {
        "@elizaos/core": "2.0.0-alpha.163",
      },
    });
    writeJson(
      path.join(repoRoot, "eliza", "packages", "typescript", "package.json"),
      {
        name: "@elizaos/typescript",
        version: "2.0.0-alpha.163",
      },
    );
    writeJson(path.join(repoRoot, "eliza", "packages", "ui", "package.json"), {
      name: "@elizaos/ui",
      version: "2.0.0-alpha.163",
    });

    try {
      process.env.MILADY_DISABLE_LOCAL_UPSTREAMS_RENAME = "1";
      disableLocalElizaWorkspace(repoRoot, {
        log: () => {},
        warn: () => {},
        errorLog: () => {},
      });
    } finally {
      if (originalRenameSetting === undefined) {
        delete process.env.MILADY_DISABLE_LOCAL_UPSTREAMS_RENAME;
      } else {
        process.env.MILADY_DISABLE_LOCAL_UPSTREAMS_RENAME =
          originalRenameSetting;
      }
    }

    const rootPackage = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    );
    expect(rootPackage.overrides).toMatchObject({
      "@elizaos/app-core":
        resolveCiOverrideSpecifiers(repoRoot)["@elizaos/app-core"],
      "@elizaos/ui": resolveCiOverrideSpecifiers(repoRoot)["@elizaos/ui"],
      "@elizaos/plugin-app-control":
        CI_OVERRIDE_SPECIFIERS["@elizaos/plugin-app-control"],
      "@elizaos/plugin-wechat":
        CI_OVERRIDE_SPECIFIERS["@elizaos/plugin-wechat"],
    });
  });

  it("injects the live-workspace @elizaos/ui override when eliza stays on disk", () => {
    const repoRoot = makeTempDir();
    writeJson(path.join(repoRoot, "package.json"), {
      name: "milady-test",
      workspaces: ["eliza/packages/*"],
      overrides: {
        "@elizaos/core": "2.0.0-alpha.163",
      },
    });
    writeJson(
      path.join(repoRoot, "eliza", "packages", "typescript", "package.json"),
      {
        name: "@elizaos/typescript",
        version: "2.0.0-alpha.163",
      },
    );
    writeJson(path.join(repoRoot, "eliza", "packages", "ui", "package.json"), {
      name: "@elizaos/ui",
      version: "2.0.0-alpha.163",
    });

    disableLocalElizaWorkspace(repoRoot, {
      log: () => {},
      warn: () => {},
      errorLog: () => {},
    });

    const rootPackage = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    );
    expect(rootPackage.overrides).toMatchObject({
      "@elizaos/app-core":
        resolveCiOverrideSpecifiers(repoRoot)["@elizaos/app-core"],
      "@elizaos/ui": resolveCiOverrideSpecifiers(repoRoot)["@elizaos/ui"],
      "@elizaos/plugin-app-control":
        CI_OVERRIDE_SPECIFIERS["@elizaos/plugin-app-control"],
      "@elizaos/plugin-browser-bridge":
        resolveCiOverrideSpecifiers(repoRoot)["@elizaos/plugin-browser-bridge"],
      "@elizaos/plugin-wechat":
        CI_OVERRIDE_SPECIFIERS["@elizaos/plugin-wechat"],
    });
  });

  it("keeps the local browser bridge package resolvable in published-only CI", () => {
    const repoRoot = makeTempDir();
    writeJson(path.join(repoRoot, "package.json"), {
      name: "milady-test",
      workspaces: ["eliza/packages/*", "eliza/apps/*"],
      dependencies: {
        "@elizaos/core": "workspace:*",
        "@elizaos/plugin-browser-bridge": "workspace:*",
      },
      overrides: {
        "@elizaos/core": "2.0.0-alpha.163",
      },
    });
    writeJson(
      path.join(repoRoot, "eliza", "packages", "typescript", "package.json"),
      {
        name: "@elizaos/typescript",
        version: "2.0.0-alpha.163",
      },
    );
    writeJson(
      path.join(
        repoRoot,
        "eliza",
        "packages",
        "plugin-browser-bridge",
        "package.json",
      ),
      {
        name: "@elizaos/plugin-browser-bridge",
        version: "0.1.0",
        private: true,
        dependencies: {
          "@elizaos/app-lifeops": "workspace:*",
          "@elizaos/core": "workspace:*",
        },
      },
    );
    writeJson(
      path.join(repoRoot, "eliza", "apps", "app-lifeops", "package.json"),
      {
        name: "@elizaos/app-lifeops",
        version: "0.1.0",
        private: true,
      },
    );

    disableLocalElizaWorkspace(repoRoot, {
      log: () => {},
      warn: () => {},
      errorLog: () => {},
    });

    const rootPackage = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    );
    expect(rootPackage.workspaces).toContain(
      "eliza/packages/plugin-browser-bridge",
    );
    expect(rootPackage.dependencies).toMatchObject({
      "@elizaos/core": "2.0.0-alpha.163",
      "@elizaos/plugin-browser-bridge": "workspace:*",
    });
    expect(rootPackage.overrides).toMatchObject({
      "@elizaos/plugin-browser-bridge":
        resolveCiOverrideSpecifiers(repoRoot)["@elizaos/plugin-browser-bridge"],
    });

    const browserBridgePackage = JSON.parse(
      fs.readFileSync(
        path.join(
          repoRoot,
          "eliza",
          "packages",
          "plugin-browser-bridge",
          "package.json",
        ),
        "utf8",
      ),
    );
    expect(browserBridgePackage.dependencies).toMatchObject({
      "@elizaos/app-lifeops": "workspace:*",
      "@elizaos/core": "2.0.0-alpha.163",
    });
  });

  it("keeps source-only runtime packages resolvable in published-only CI", () => {
    const repoRoot = makeTempDir();
    writeJson(path.join(repoRoot, "package.json"), {
      name: "milady-test",
      workspaces: [
        "eliza/packages/*",
        "eliza/plugins/*",
        "eliza/plugins/plugin-*/typescript",
      ],
      dependencies: {
        "@elizaos/core": "workspace:*",
        "@elizaos/plugin-signal": "workspace:*",
        "@elizaos/skills": "workspace:*",
      },
      overrides: {
        "@elizaos/core": "2.0.0-alpha.163",
      },
    });
    writeJson(
      path.join(repoRoot, "eliza", "packages", "typescript", "package.json"),
      {
        name: "@elizaos/typescript",
        version: "2.0.0-alpha.163",
      },
    );
    writeJson(
      path.join(repoRoot, "eliza", "packages", "skills", "package.json"),
      {
        name: "@elizaos/skills",
        version: "2.0.0-alpha.163",
      },
    );
    writeJson(
      path.join(
        repoRoot,
        "eliza",
        "plugins",
        "plugin-signal",
        "typescript",
        "package.json",
      ),
      {
        name: "@elizaos/plugin-signal",
        version: "2.0.0-alpha.7",
      },
    );

    disableLocalElizaWorkspace(repoRoot, {
      log: () => {},
      warn: () => {},
      errorLog: () => {},
    });

    const rootPackage = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    );
    expect(rootPackage.workspaces).toContain("eliza/packages/skills");
    expect(rootPackage.workspaces).toContain(
      "eliza/plugins/plugin-signal/typescript",
    );
    expect(rootPackage.dependencies).toMatchObject({
      "@elizaos/core": "2.0.0-alpha.163",
      "@elizaos/plugin-signal": "workspace:*",
      "@elizaos/skills": "workspace:*",
    });
    expect(rootPackage.overrides).toMatchObject({
      "@elizaos/plugin-signal":
        resolveCiOverrideSpecifiers(repoRoot)["@elizaos/plugin-signal"],
      "@elizaos/skills":
        resolveCiOverrideSpecifiers(repoRoot)["@elizaos/skills"],
    });
  });

  it("injects runtime install overrides into eliza/package.json for published-only CI", () => {
    const repoRoot = makeTempDir();
    writeJson(path.join(repoRoot, "package.json"), {
      name: "milady-test",
      workspaces: ["eliza/packages/*"],
      overrides: {
        "@elizaos/core": "2.0.0-alpha.163",
      },
    });
    writeJson(path.join(repoRoot, "eliza", "package.json"), {
      name: "eliza",
      workspaces: ["packages/*", "plugins/*"],
    });
    writeJson(
      path.join(repoRoot, "eliza", "packages", "typescript", "package.json"),
      {
        name: "@elizaos/typescript",
        version: "2.0.0-alpha.163",
      },
    );

    disableLocalElizaWorkspace(repoRoot, {
      log: () => {},
      warn: () => {},
      errorLog: () => {},
    });

    const elizaPackage = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "eliza", "package.json"), "utf8"),
    );
    expect(elizaPackage.overrides).toMatchObject({
      "@elizaos/ui": ELIZA_RUNTIME_CI_OVERRIDE_SPECIFIERS["@elizaos/ui"],
      "@elizaos/plugin-app-control":
        ELIZA_RUNTIME_CI_OVERRIDE_SPECIFIERS["@elizaos/plugin-app-control"],
      "@elizaos/plugin-browser-bridge":
        ELIZA_RUNTIME_CI_OVERRIDE_SPECIFIERS["@elizaos/plugin-browser-bridge"],
      "@elizaos/plugin-wechat":
        ELIZA_RUNTIME_CI_OVERRIDE_SPECIFIERS["@elizaos/plugin-wechat"],
    });
  });

  it("skips malformed eliza/package.json when injecting runtime overrides", () => {
    const repoRoot = makeTempDir();
    const warnings: string[] = [];
    writeJson(path.join(repoRoot, "package.json"), {
      name: "milady-test",
      workspaces: ["eliza/packages/*"],
      overrides: {
        "@elizaos/core": "2.0.0-alpha.163",
      },
    });
    fs.mkdirSync(path.join(repoRoot, "eliza"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "eliza", "package.json"), "null\n");
    writeJson(
      path.join(repoRoot, "eliza", "packages", "typescript", "package.json"),
      {
        name: "@elizaos/typescript",
        version: "2.0.0-alpha.163",
      },
    );

    disableLocalElizaWorkspace(repoRoot, {
      log: () => {},
      warn: (message) => warnings.push(message),
      errorLog: () => {},
    });

    expect(
      fs.readFileSync(path.join(repoRoot, "eliza", "package.json"), "utf8"),
    ).toBe("null\n");
    expect(warnings).toContain(
      `[disable-local-eliza-workspace] Skipping ${path.join(repoRoot, "eliza", "package.json")}: package.json is malformed`,
    );
  });
});
