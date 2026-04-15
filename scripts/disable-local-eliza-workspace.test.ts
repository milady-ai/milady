import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CI_OVERRIDE_SPECIFIERS,
  collectWorkspaceProtocolDependencyNames,
  disableLocalElizaWorkspace,
  ELIZA_RUNTIME_CI_OVERRIDE_SPECIFIERS,
  PINNED_VERSION_SOURCE_OVERRIDE,
  PINNED_VERSION_SOURCE_TEMPLATE,
  PINNED_VERSION_SOURCE_WORKSPACE,
  resolvePublishSafePinnedVersions,
} from "./disable-local-eliza-workspace.mjs";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-disable-eliza-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

    const agentPackage = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "eliza", "packages", "agent", "package.json"),
        "utf8",
      ),
    );
    expect(agentPackage.dependencies).toMatchObject({
      "@elizaos/core": "2.0.0-alpha.163",
      "@elizaos/plugin-agent-orchestrator": "0.6.2-alpha.0",
      "@elizaos/skills": "2.0.0-alpha.163",
    });
  });

  it("injects the published-workspace @elizaos/ui override for CI rewrites", () => {
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

    disableLocalElizaWorkspace(repoRoot, {
      log: () => {},
      warn: () => {},
      errorLog: () => {},
    });

    const rootPackage = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    );
    expect(rootPackage.overrides).toMatchObject({
      "@elizaos/ui": CI_OVERRIDE_SPECIFIERS["@elizaos/ui"],
      "@elizaos/plugin-wechat":
        CI_OVERRIDE_SPECIFIERS["@elizaos/plugin-wechat"],
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
      "@elizaos/plugin-wechat":
        ELIZA_RUNTIME_CI_OVERRIDE_SPECIFIERS["@elizaos/plugin-wechat"],
    });
  });
});
