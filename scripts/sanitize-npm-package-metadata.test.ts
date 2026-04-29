import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sanitizeNpmPackageMetadata } from "./sanitize-npm-package-metadata.mjs";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-npm-metadata-"));
  tempDirs.push(dir);
  return dir;
}

function writePackageJson(repoRoot: string, value: Record<string, unknown>) {
  fs.writeFileSync(
    path.join(repoRoot, "package.json"),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function readPackageJson(repoRoot: string) {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as Record<string, unknown>;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  }
  vi.restoreAllMocks();
});

describe("sanitize-npm-package-metadata", () => {
  it("removes local override specifiers before npm pack or publish", () => {
    const repoRoot = makeTempDir();
    const log = vi.fn();
    writePackageJson(repoRoot, {
      name: "milady",
      dependencies: {
        "@elizaos/plugin-app-control": "2.0.0-alpha.1",
        react: "^19.2.4",
      },
      overrides: {
        "@elizaos/plugin-app-control":
          "file:./scripts/ci-stubs/elizaos-plugin-app-control",
        "@elizaos/core": "workspace:*",
        "@capacitor/core": "8.3.1",
        react: "^19.2.4",
      },
    });

    const result = sanitizeNpmPackageMetadata(repoRoot, { log });

    expect(result.changed).toBe(true);
    expect(result.removed.map(({ name }) => name)).toEqual([
      "@elizaos/plugin-app-control",
      "@elizaos/core",
    ]);
    expect(readPackageJson(repoRoot).overrides).toEqual({
      "@capacitor/core": "8.3.1",
      react: "^19.2.4",
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("removed 2 npm-unsafe override(s)"),
    );
  });

  it("removes direct dependency override conflicts even when the specifier is registry-safe", () => {
    const repoRoot = makeTempDir();
    writePackageJson(repoRoot, {
      dependencies: {
        "@elizaos/plugin-app-control": "2.0.0-alpha.1",
      },
      overrides: {
        "@elizaos/plugin-app-control": "2.0.0-alpha.2",
        undici: "7.24.6",
      },
    });

    const result = sanitizeNpmPackageMetadata(repoRoot);

    expect(result.removed).toEqual([
      {
        name: "@elizaos/plugin-app-control",
        reason: "conflicts with direct dependency",
      },
    ]);
    expect(readPackageJson(repoRoot).overrides).toEqual({ undici: "7.24.6" });
  });

  it("removes bundled dependencies before npm pack or publish", () => {
    const repoRoot = makeTempDir();
    const log = vi.fn();
    writePackageJson(repoRoot, {
      name: "milady",
      bundleDependencies: [
        "@elizaos/core",
        "@elizaos/plugin-agent-orchestrator",
      ],
      dependencies: {
        "@elizaos/core": "2.0.0-alpha.353",
        "@elizaos/plugin-agent-orchestrator": "0.3.9",
      },
    });

    const result = sanitizeNpmPackageMetadata(repoRoot, { log });

    expect(result.changed).toBe(true);
    expect(result.removedBundledDependencies).toEqual([
      "@elizaos/core",
      "@elizaos/plugin-agent-orchestrator",
    ]);
    expect(readPackageJson(repoRoot).bundleDependencies).toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("removed 2 bundled dependencies"),
    );
  });

  it("supports dry-run without mutating package.json", () => {
    const repoRoot = makeTempDir();
    const packageJson = {
      dependencies: {
        "@elizaos/plugin-app-control": "2.0.0-alpha.1",
      },
      overrides: {
        "@elizaos/plugin-app-control":
          "file:./scripts/ci-stubs/elizaos-plugin-app-control",
      },
    };
    writePackageJson(repoRoot, packageJson);

    const result = sanitizeNpmPackageMetadata(repoRoot, { dryRun: true });

    expect(result.changed).toBe(true);
    expect(readPackageJson(repoRoot)).toEqual(packageJson);
  });
});
