import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRepoRoot } from "./lib/repo-root.mjs";

const repoRoot = resolveRepoRoot(import.meta.url);
const workflowPath = path.join(
  repoRoot,
  ".github",
  "workflows",
  "test-electrobun-release.yml",
);

function workflowText() {
  return fs.readFileSync(workflowPath, "utf8");
}

describe("electrobun PR workflow contract", () => {
  it("hydrates the orchestrator plugin before disabling local eliza workspaces", () => {
    const workflow = workflowText();
    const elizaInitIndex = workflow.indexOf(
      "- name: Initialize eliza submodule for version resolution",
    );
    const versionSourceIndex = workflow.indexOf(
      "- name: Initialize release-check plugin version source",
    );
    const disableIndex = workflow.indexOf(
      "- name: Disable repo-local eliza workspace",
    );

    expect(elizaInitIndex).toBeGreaterThanOrEqual(0);
    expect(versionSourceIndex).toBeGreaterThanOrEqual(0);
    expect(disableIndex).toBeGreaterThanOrEqual(0);
    expect(elizaInitIndex).toBeLessThan(versionSourceIndex);
    expect(versionSourceIndex).toBeLessThan(disableIndex);
    expect(workflow).not.toContain(
      "- name: Initialize release-check plugin checkout",
    );
    expect(workflow).toContain("git submodule update --init --depth=1 eliza");
    expect(workflow).toContain(
      "git -C eliza submodule update --init plugins/plugin-agent-orchestrator",
    );
  });

  it("reuses the shared published-workspace fallback dependency installer", () => {
    const workflow = workflowText();

    expect(workflow).toContain(
      "run: bash scripts/install-published-workspace-fallback-deps.sh",
    );
    expect(workflow).not.toContain("bun add --no-save --dev");
  });
});
