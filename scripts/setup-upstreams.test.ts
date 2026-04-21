import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createPackageLink,
  ensurePluginBuildOutputs,
  ensurePluginDependencyLinks,
  ensurePublishedElizaPackageLinks,
  getElizaPackageLinks,
  getElizaWorkspaceSkipReason,
  getPluginPackageLinks,
  getPublishedElizaPackageSpecs,
  hasInstalledElizaDependencies,
  hasRequiredElizaWorkspaceFiles,
  isPackageLinkCurrent,
} from "./setup-upstreams.mjs";

describe("getElizaWorkspaceSkipReason", () => {
  it("respects the local eliza skip env flag", () => {
    const skipEnvKey = [
      "MILADY_SKIP_LOCAL_UPSTREAMS",
      "ELIZA_SKIP_LOCAL_UPSTREAMS",
    ];
    const results = skipEnvKey.map((key) =>
      getElizaWorkspaceSkipReason("/repo/milady", {
        env: { [key]: "1" },
        pathExists: () => true,
      }),
    );
    const matched = results.find((r) => r !== null);
    expect(matched).toBeDefined();
    expect(matched).toMatch(/(?:MILADY|ELIZA)_SKIP_LOCAL_UPSTREAMS=1/);
  });

  it("allows repo-local upstreams in CI development checkouts", () => {
    expect(
      getElizaWorkspaceSkipReason("/repo/milady", {
        env: { CI: "1" },
        pathExists: () => true,
      }),
    ).toBeNull();
  });

  it("skips non-development installs", () => {
    expect(
      getElizaWorkspaceSkipReason("/repo/milady", {
        env: {},
        pathExists: (candidate) =>
          candidate !==
          path.join("/repo/milady", "apps", "app", "vite.config.ts"),
      }),
    ).toBe("non-development install");
  });
});

describe("hasRequiredElizaWorkspaceFiles", () => {
  it("requires the develop package layout", () => {
    const elizaRoot = "/repo/eliza";

    expect(
      hasRequiredElizaWorkspaceFiles(elizaRoot, {
        pathExists: (candidate) =>
          candidate !== path.join(elizaRoot, "package.json"),
      }),
    ).toBe(false);

    expect(
      hasRequiredElizaWorkspaceFiles(elizaRoot, {
        pathExists: () => true,
      }),
    ).toBe(true);
  });
});

describe("hasInstalledElizaDependencies", () => {
  it("detects a Bun-installed workspace from root install markers", () => {
    const elizaRoot = "/repo/eliza";

    expect(
      hasInstalledElizaDependencies(elizaRoot, {
        pathExists: (candidate) =>
          candidate !== path.join(elizaRoot, "node_modules", ".bin"),
      }),
    ).toBe(false);

    expect(
      hasInstalledElizaDependencies(elizaRoot, {
        pathExists: () => true,
      }),
    ).toBe(true);
  });
});

describe("getElizaPackageLinks", () => {
  it("links repo-local eliza package entries into Milady workspaces", () => {
    const tempRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-setup-eliza-links-"),
    );

    try {
      const elizaRoot = path.join(tempRoot, "eliza");
      const miladyRoot = path.join(tempRoot, "milady");

      const packages = ["app-core", "autonomous", "ui"];
      for (const pkg of packages) {
        const targetDir = path.join(elizaRoot, "packages", pkg);
        mkdirSync(targetDir, { recursive: true });
        writeFileSync(
          path.join(targetDir, "package.json"),
          JSON.stringify({ name: `@elizaos/${pkg}` }),
          "utf8",
        );
      }

      const expectedLinks = getElizaPackageLinks(miladyRoot, elizaRoot).map(
        ({ linkPath, targetPath }) => ({
          linkPath,
          targetPath,
        }),
      );

      expect(expectedLinks).toEqual(
        expect.arrayContaining([
          {
            linkPath: path.join(miladyRoot, "node_modules/@elizaos/app-core"),
            targetPath: path.join(elizaRoot, "packages/app-core"),
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/app/node_modules/@elizaos/app-core",
            ),
            targetPath: path.join(elizaRoot, "packages/app-core"),
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/home/node_modules/@elizaos/app-core",
            ),
            targetPath: path.join(elizaRoot, "packages/app-core"),
          },
          {
            linkPath: path.join(miladyRoot, "node_modules/@elizaos/autonomous"),
            targetPath: path.join(elizaRoot, "packages/autonomous"),
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/app/node_modules/@elizaos/autonomous",
            ),
            targetPath: path.join(elizaRoot, "packages/autonomous"),
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/home/node_modules/@elizaos/autonomous",
            ),
            targetPath: path.join(elizaRoot, "packages/autonomous"),
          },
          {
            linkPath: path.join(miladyRoot, "node_modules/@elizaos/ui"),
            targetPath: path.join(elizaRoot, "packages/ui"),
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/app/node_modules/@elizaos/ui",
            ),
            targetPath: path.join(elizaRoot, "packages/ui"),
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/home/node_modules/@elizaos/ui",
            ),
            targetPath: path.join(elizaRoot, "packages/ui"),
          },
        ]),
      );
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});

describe("getPluginPackageLinks", () => {
  it("prefers plugin typescript package roots over wrapper package roots", () => {
    const tempRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-setup-plugin-links-"),
    );

    try {
      const pluginsRoot = path.join(tempRoot, "plugins");
      const miladyRoot = path.join(tempRoot, "milady");

      const wrapperDir = path.join(pluginsRoot, "plugin-openai");
      const tsDir = path.join(wrapperDir, "typescript");
      mkdirSync(tsDir, { recursive: true });

      writeFileSync(
        path.join(wrapperDir, "package.json"),
        JSON.stringify({ name: "@elizaos/plugin-openai-root" }),
        "utf8",
      );
      writeFileSync(
        path.join(tsDir, "package.json"),
        JSON.stringify({ name: "@elizaos/plugin-openai" }),
        "utf8",
      );

      const appDir = path.join(pluginsRoot, "plugin-hyperscape");
      mkdirSync(appDir, { recursive: true });
      writeFileSync(
        path.join(appDir, "package.json"),
        JSON.stringify({ name: "@hyperscape/plugin-hyperscape" }),
        "utf8",
      );

      expect(getPluginPackageLinks(miladyRoot, pluginsRoot)).toEqual(
        expect.arrayContaining([
          {
            linkPath: path.join(
              miladyRoot,
              "node_modules/@elizaos/plugin-openai",
            ),
            targetPath: tsDir,
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/app/node_modules/@elizaos/plugin-openai",
            ),
            targetPath: tsDir,
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/home/node_modules/@elizaos/plugin-openai",
            ),
            targetPath: tsDir,
          },
        ]),
      );

      // Scoped plugin repos without a nested typescript package link from the
      // repo root so non-eliza workspace plugins stay available locally.
      expect(getPluginPackageLinks(miladyRoot, pluginsRoot)).toEqual(
        expect.arrayContaining([
          {
            linkPath: path.join(
              miladyRoot,
              "node_modules/@hyperscape/plugin-hyperscape",
            ),
            targetPath: appDir,
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/app/node_modules/@hyperscape/plugin-hyperscape",
            ),
            targetPath: appDir,
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/home/node_modules/@hyperscape/plugin-hyperscape",
            ),
            targetPath: appDir,
          },
        ]),
      );
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});

describe("ensurePluginDependencyLinks", () => {
  it("links dependency packages and generates bin shims for linked plugin packages", () => {
    const tempRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-setup-plugin-deps-"),
    );

    try {
      const repoRoot = path.join(tempRoot, "milady");
      const pluginsRoot = path.join(repoRoot, "plugins");
      const packageDir = path.join(
        pluginsRoot,
        "plugin-agent-skills",
        "typescript",
      );
      const installedDependencyDir = path.join(repoRoot, "node_modules", "zod");
      const installedDevDependencyDir = path.join(
        repoRoot,
        "node_modules",
        "tsup",
      );
      const installedDevDependencyBin = path.join(
        installedDevDependencyDir,
        "dist",
        "cli.js",
      );

      mkdirSync(packageDir, { recursive: true });
      mkdirSync(installedDependencyDir, { recursive: true });
      mkdirSync(path.dirname(installedDevDependencyBin), { recursive: true });
      writeFileSync(
        path.join(installedDevDependencyDir, "package.json"),
        JSON.stringify({
          name: "tsup",
          bin: {
            tsup: "dist/cli.js",
          },
        }),
        "utf8",
      );
      writeFileSync(installedDevDependencyBin, "#!/usr/bin/env node\n", "utf8");

      writeFileSync(
        path.join(packageDir, "package.json"),
        JSON.stringify({
          name: "@elizaos/plugin-agent-skills",
          dependencies: {
            zod: "^4.0.0",
          },
          devDependencies: {
            tsup: "^8.0.0",
          },
          scripts: {
            build: "tsup",
          },
        }),
        "utf8",
      );

      expect(ensurePluginDependencyLinks(repoRoot, pluginsRoot)).toBe(3);
      expect(
        realpathSync(path.join(packageDir, "node_modules", ".bin", "tsup")),
      ).toBe(realpathSync(installedDevDependencyBin));
      expect(realpathSync(path.join(packageDir, "node_modules", "zod"))).toBe(
        realpathSync(installedDependencyDir),
      );
      expect(realpathSync(path.join(packageDir, "node_modules", "tsup"))).toBe(
        realpathSync(installedDevDependencyDir),
      );
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});

describe("ensurePluginBuildOutputs", () => {
  it("builds root-level plugin packages when they expose @elizaos names and lack dist", async () => {
    const tempRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-setup-plugin-builds-"),
    );

    try {
      const pluginsRoot = path.join(tempRoot, "plugins");
      const packageDir = path.join(pluginsRoot, "plugin-coding-agent");
      mkdirSync(packageDir, { recursive: true });
      writeFileSync(
        path.join(packageDir, "package.json"),
        JSON.stringify({
          name: "@elizaos/plugin-coding-agent",
          scripts: {
            build: "bun run build.ts",
          },
        }),
        "utf8",
      );

      const calls: Array<{
        command: string;
        args: string[];
        cwd?: string;
        label?: string;
      }> = [];

      await ensurePluginBuildOutputs(pluginsRoot, {
        pathExists: (candidate) => candidate !== path.join(packageDir, "dist"),
        runCommandImpl: async (command, args, options = {}) => {
          calls.push({
            command,
            args,
            cwd: options.cwd,
            label: options.label,
          });
        },
      });

      expect(calls).toEqual([
        {
          command: "bun",
          args: ["run", "build"],
          cwd: packageDir,
          label: "bun run build (@elizaos/plugin-coding-agent)",
        },
      ]);
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});

describe("getPublishedElizaPackageSpecs", () => {
  it("collects non-workspace @elizaos package specs from the root manifest", () => {
    const tempRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-published-eliza-specs-"),
    );

    try {
      const repoRoot = path.join(tempRoot, "milady");
      mkdirSync(repoRoot, { recursive: true });
      writeFileSync(
        path.join(repoRoot, "package.json"),
        JSON.stringify({
          dependencies: {
            "@elizaos/core": "2.0.0-alpha.113",
            "@elizaos/plugin-agent-orchestrator": "workspace:*",
          },
          devDependencies: {
            "@elizaos/prompts": "2.0.0-alpha.113",
          },
          peerDependencies: {
            "@elizaos/skills": "2.0.0-alpha.113",
          },
        }),
        "utf8",
      );

      expect(getPublishedElizaPackageSpecs(repoRoot)).toEqual([
        ["@elizaos/core", "2.0.0-alpha.113"],
        ["@elizaos/prompts", "2.0.0-alpha.113"],
        ["@elizaos/skills", "2.0.0-alpha.113"],
      ]);
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});

describe("ensurePublishedElizaPackageLinks", () => {
  it("restores public @elizaos package links from the Bun cache", () => {
    const tempRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-published-eliza-links-"),
    );

    try {
      const repoRoot = path.join(tempRoot, "milady");
      const cachedCoreDir = path.join(
        repoRoot,
        "node_modules",
        ".bun",
        "@elizaos+core@2.0.0-alpha.113+example",
        "node_modules",
        "@elizaos",
        "core",
      );

      mkdirSync(path.join(repoRoot, "apps", "app"), { recursive: true });
      mkdirSync(path.join(repoRoot, "apps", "home"), { recursive: true });
      mkdirSync(cachedCoreDir, { recursive: true });
      writeFileSync(
        path.join(repoRoot, "package.json"),
        JSON.stringify({
          dependencies: {
            "@elizaos/core": "2.0.0-alpha.113",
          },
        }),
        "utf8",
      );
      writeFileSync(
        path.join(cachedCoreDir, "package.json"),
        JSON.stringify({ name: "@elizaos/core" }),
        "utf8",
      );

      expect(ensurePublishedElizaPackageLinks(repoRoot)).toBe(3);
      expect(
        realpathSync(path.join(repoRoot, "node_modules", "@elizaos", "core")),
      ).toBe(realpathSync(cachedCoreDir));
      expect(
        realpathSync(
          path.join(
            repoRoot,
            "apps",
            "app",
            "node_modules",
            "@elizaos",
            "core",
          ),
        ),
      ).toBe(realpathSync(cachedCoreDir));
      expect(
        realpathSync(
          path.join(
            repoRoot,
            "apps",
            "home",
            "node_modules",
            "@elizaos",
            "core",
          ),
        ),
      ).toBe(realpathSync(cachedCoreDir));
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});

describe("createPackageLink", () => {
  it("creates and updates local package symlinks", () => {
    const tempRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-setup-upstreams-"),
    );

    try {
      const targetOne = path.join(tempRoot, "eliza", "packages", "app-core");
      const targetTwo = path.join(tempRoot, "eliza", "packages", "ui");
      const linkPath = path.join(
        tempRoot,
        "milady",
        "node_modules",
        "@elizaos",
        "app-core",
      );

      mkdirSync(targetOne, { recursive: true });
      mkdirSync(targetTwo, { recursive: true });
      writeFileSync(path.join(targetOne, "package.json"), "{}\n", "utf8");
      writeFileSync(path.join(targetTwo, "package.json"), "{}\n", "utf8");

      expect(createPackageLink(linkPath, targetOne)).toBe(true);
      expect(isPackageLinkCurrent(linkPath, targetOne)).toBe(true);
      expect(realpathSync(linkPath)).toBe(realpathSync(targetOne));

      expect(createPackageLink(linkPath, targetOne)).toBe(false);
      expect(createPackageLink(linkPath, targetTwo)).toBe(true);
      expect(isPackageLinkCurrent(linkPath, targetTwo)).toBe(true);
      expect(realpathSync(linkPath)).toBe(realpathSync(targetTwo));
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});
