import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRepoRoot } from "./lib/repo-root.mjs";

const repoRoot = resolveRepoRoot(import.meta.url);
const mobileWorkflowPath = path.join(
  repoRoot,
  ".github",
  "workflows",
  "mobile-build-smoke.yml",
);
const appleStoreWorkflowPath = path.join(
  repoRoot,
  ".github",
  "workflows",
  "apple-store-release.yml",
);
const windowsPreloadWorkflowPath = path.join(
  repoRoot,
  ".github",
  "workflows",
  "windows-desktop-preload-smoke.yml",
);
const mobileBuildScriptPath = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "run-mobile-build.mjs",
);
const miladyOsWorkflowPath = path.join(
  repoRoot,
  ".github",
  "workflows",
  "miladyos-cuttlefish.yml",
);

function readWorkflow(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

describe("mobile platform workflow contract", () => {
  it("pins iOS simulator builds to macos-15 and verifies the Milady bundle id", () => {
    const workflow = readWorkflow(mobileWorkflowPath);

    expect(workflow).toContain("runs-on: macos-15");
    expect(workflow).not.toContain("runs-on: macos-latest");
    expect(workflow).toContain(
      "run: node --max-old-space-size=8192 eliza/packages/app-core/scripts/run-mobile-build.mjs ios",
    );
    expect(workflow).toContain(
      "run: node --max-old-space-size=8192 eliza/packages/app-core/scripts/run-mobile-build.mjs android",
    );
    expect(workflow).toContain("com.miladyai.milady|ai.elizaos.app) ;;");
  });

  it("keeps the Apple release overlay target implemented by the mobile build helper", () => {
    const workflow = readWorkflow(appleStoreWorkflowPath);
    const mobileBuildScript = readWorkflow(mobileBuildScriptPath);

    expect(workflow).toContain(
      "node eliza/packages/app-core/scripts/run-mobile-build.mjs ios-overlay",
    );
    expect(mobileBuildScript).toContain('target !== "ios-overlay"');
    expect(mobileBuildScript).toContain("prepareIosOverlay();");
  });

  it("keeps MiladyOS system-image validation wired to a Linux/KVM workflow", () => {
    const workflow = readWorkflow(miladyOsWorkflowPath);

    expect(workflow).toContain("runs-on: [self-hosted, linux, x64, kvm]");
    expect(workflow).toContain("bun run build:android:system");
    expect(workflow).toContain("bun run miladyos:validate");
    expect(workflow).toContain("node scripts/miladyos/build-aosp.mjs");
    expect(workflow).toContain("--boot-validate");
  });

  it("avoids broad package-local bun installs in the Windows preload smoke job", () => {
    const workflow = readWorkflow(windowsPreloadWorkflowPath);

    expect(workflow).not.toContain(
      "bun install --cwd eliza/packages/app-core --ignore-scripts",
    );
    expect(workflow).toContain(
      "bun install --cwd eliza/packages/app-core/platforms/electrobun --ignore-scripts",
    );
    expect(workflow).toContain(
      "System git config failed; falling back to --global.",
    );
    expect(workflow).toContain('prepare-local-eliza-runtime: "true"');
    expect(workflow).not.toContain(
      "node eliza/packages/app-core/scripts/run-repo-setup.mjs",
    );
    expect(workflow).toContain(
      "node scripts/ensure-legacy-electrobun-compat.mjs",
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
      "node ../../scripts/build-electrobun-preload.mjs",
    );
    expect(workflow).not.toContain("run: bun run build:preload");
  });
});
