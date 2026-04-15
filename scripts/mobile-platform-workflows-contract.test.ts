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
const windowsPreloadWorkflowPath = path.join(
  repoRoot,
  ".github",
  "workflows",
  "windows-desktop-preload-smoke.yml",
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
      "run: node eliza/packages/app-core/scripts/run-mobile-build.mjs ios",
    );
    expect(workflow).toContain(
      "run: node eliza/packages/app-core/scripts/run-mobile-build.mjs android",
    );
    expect(workflow).toContain(
      'if [ "$BUNDLE_ID" != "com.miladyai.milady" ]; then',
    );
  });

  it("avoids broad package-local bun installs in the Windows preload smoke job", () => {
    const workflow = readWorkflow(windowsPreloadWorkflowPath);

    expect(workflow).not.toContain(
      "bun install --cwd eliza/packages/app-core --ignore-scripts",
    );
    expect(workflow).not.toContain(
      "bun install --cwd eliza/packages/app-core/platforms/electrobun --ignore-scripts",
    );
    expect(workflow).toContain('prepare-local-eliza-runtime: "true"');
    expect(workflow).not.toContain(
      "node eliza/packages/app-core/scripts/run-repo-setup.mjs",
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
  });
});
