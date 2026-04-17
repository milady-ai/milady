import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function readWorkflow(name: string) {
  return fs.readFileSync(
    path.join(repoRoot, ".github", "workflows", name),
    "utf8",
  );
}

function readElizaScript(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, "eliza", relativePath), "utf8");
}

describe("release workflow path contract", () => {
  it("hydrates the legacy electrobun compatibility dir in release workflows", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

    expect(releaseElectrobun).toContain(
      "node scripts/ensure-legacy-electrobun-compat.mjs",
    );
  });

  it("uses the mobile build helper for release Android and iOS validation jobs", () => {
    const agentRelease = readWorkflow("agent-release.yml");
    const mobileBuildHelper = readElizaScript(
      path.join("packages", "app-core", "scripts", "run-mobile-build.mjs"),
    );

    expect(agentRelease).toContain(
      "node eliza/packages/app-core/scripts/run-mobile-build.mjs android",
    );
    expect(agentRelease).toContain(
      "node eliza/packages/app-core/scripts/run-mobile-build.mjs ios",
    );
    expect(agentRelease).not.toContain(
      "Build web assets\n        run: |\n          bun install --ignore-scripts\n          bun run postinstall\n          bun run build",
    );
    expect(mobileBuildHelper).toContain(
      'console.error("Usage: node scripts/run-mobile-build.mjs <android|ios>");',
    );
    expect(mobileBuildHelper).toContain('if (target === "android") {');
    expect(mobileBuildHelper).toContain("await buildIos();");
  });

  it("does not reinstall eliza/packages/app-core directly in the windows preload smoke job", () => {
    const workflow = readWorkflow("windows-desktop-preload-smoke.yml");

    expect(workflow).toContain(
      "node scripts/ensure-legacy-electrobun-compat.mjs",
    );
    expect(workflow).not.toContain(
      "bun install --cwd eliza/packages/app-core --ignore-scripts",
    );
    expect(workflow).toContain(
      "bun install --cwd eliza/packages/app-core/platforms/electrobun --ignore-scripts",
    );
    expect(workflow).toContain(
      "node eliza/packages/app-core/scripts/patch-workspace-plugins.mjs",
    );
    expect(workflow).toContain(
      "node eliza/packages/app-core/scripts/patch-deps.mjs",
    );
    expect(workflow).toContain(
      "node eliza/packages/app-core/scripts/ensure-type-package-aliases.mjs",
    );
    expect(workflow).toContain(
      "System git config failed; falling back to --global.",
    );
    expect(workflow).toContain(
      "node ../../scripts/build-electrobun-preload.mjs",
    );
    expect(workflow).not.toContain("run: bun run build:preload");
  });

  it("normalizes runner root ownership before snap builds", () => {
    const snapBuild = readWorkflow("snap-build-test.yml");
    const publishPackages = readWorkflow("publish-packages.yml");
    const agentRelease = readWorkflow("agent-release.yml");

    for (const workflow of [snapBuild, publishPackages, agentRelease]) {
      expect(workflow).toContain("Normalize runner root ownership for snapd");
      expect(workflow).toContain("sudo chown root:root /");
      expect(workflow).toContain('test "$(stat -c \'%u:%g\' /)" = "0:0"');
    }
  });

  it("checks out the eliza submodule before packaging workflows use submodule paths", () => {
    const testPackaging = readWorkflow("test-packaging.yml");
    const publishPackages = readWorkflow("publish-packages.yml");
    const agentRelease = readWorkflow("agent-release.yml");
    const checkoutWithRecursiveSubmodules =
      /uses: actions\/checkout@v4\s+with:\s+submodules: recursive/g;

    expect(
      Array.from(testPackaging.matchAll(checkoutWithRecursiveSubmodules))
        .length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      Array.from(publishPackages.matchAll(checkoutWithRecursiveSubmodules))
        .length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      Array.from(agentRelease.matchAll(checkoutWithRecursiveSubmodules)).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("initializes tracked workspace submodules before packing JS tarballs", () => {
    const testPackaging = readWorkflow("test-packaging.yml");

    expect(testPackaging).toContain(
      "pack-and-test-js:\n    name: Pack & Test JS Tarballs",
    );
    expect(testPackaging).toContain("run: node scripts/init-submodules.mjs");
  });

  it("hydrates eliza before nested submodule recursion in the release contract workflow", () => {
    const releaseContract = readWorkflow("test-electrobun-release.yml");
    const elizaInit = releaseContract.indexOf(
      "git submodule update --init --depth=1 eliza",
    );
    const trackedInit = releaseContract.indexOf(
      "run: node scripts/init-submodules.mjs",
    );

    expect(elizaInit).toBeGreaterThanOrEqual(0);
    expect(trackedInit).toBeGreaterThanOrEqual(0);
    expect(elizaInit).toBeLessThan(trackedInit);
  });

  it("keeps plugin-agent-orchestrator submodule init as the published release-check version source", () => {
    const releaseContract = readWorkflow("test-electrobun-release.yml");

    expect(releaseContract).toContain(
      "git -C eliza submodule update --init plugins/plugin-agent-orchestrator",
    );
    expect(releaseContract).toContain("published fallback install does not");
  });
});
