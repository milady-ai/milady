import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const WORKFLOW_PATH = path.join(ROOT, ".github/workflows/test.yml");
const PR_RELEASE_WORKFLOW_PATH = path.join(
  ROOT,
  ".github/workflows/test-electrobun-release.yml",
);

describe("Electrobun test workflow drift", () => {
  // Desktop build/packaging validation (preload bridge, diagnostics, DMG
  // smoke test) was moved to release-electrobun.yml. The old desktop-ui-e2e
  // and desktop-packaged-dmg-e2e jobs were removed from test.yml.

  it("routes PR-required suites through named scripts", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("bun run test:regression-matrix:pr");
    expect(workflow).toContain("bun run test:e2e");
    expect(workflow).toContain("bun run test:startup:contract");
    expect(workflow).toContain("bun run test:startup:e2e");
    expect(workflow).toContain("bun run test:desktop:contract");
    expect(workflow).toContain("bun run test:live:cloud");
    expect(workflow).toContain("bun run test:e2e:validation");
    expect(workflow).not.toContain(
      "--exclude packages/agent/test/anvil-contracts.e2e.test.ts",
    );
    expect(workflow).not.toContain(
      "--exclude packages/agent/test/apps-e2e.e2e.test.ts",
    );
  });

  it("does not rerun postinstall in jobs that already use plain bun install", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain(
      "name: Setup workspace dependencies\n        uses: ./.github/actions/setup-bun-workspace",
    );
    expect(workflow).toContain("install-command: bun install");
    expect(workflow).toContain('run-postinstall: "false"');
    expect(workflow).not.toContain(
      'install-command: bun install\n          run-postinstall: "true"',
    );
  });

  it("skips avatar clone and vision deps in pure test jobs", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain(
      'skip-avatar-clone: "true"\n          no-vision-deps: "true"',
    );
  });

  it("validates the Electrobun release workflow contract on pull requests without running the full release matrix", () => {
    const workflow = fs.readFileSync(PR_RELEASE_WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Validate Electrobun Release Workflow");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("branches: [main, develop]");
    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain('BUN_VERSION: "1.3.9"');
    expect(workflow).toContain('NODE_NO_WARNINGS: "1"');
    expect(workflow).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
      "runs-on: ${{ vars.RUNNER_UBUNTU || (github.repository_owner == 'milady-ai' && 'blacksmith-4vcpu-ubuntu-2404' || 'ubuntu-latest') }}",
    );
    expect(workflow).toContain("name: Release Workflow Contract");
    expect(workflow).toContain(
      "bun install --frozen-lockfile --ignore-scripts",
    );
    expect(workflow).toContain("bun run postinstall");
    expect(workflow).toContain(
      "bun run test:regression-matrix:release-contract",
    );
    expect(workflow).toContain("bun run test:release:contract");
    expect(workflow).not.toContain(
      "uses: ./.github/workflows/release-electrobun.yml",
    );
    expect(workflow).not.toContain("publish_release: false");
    expect(workflow).not.toContain("publish_docker: false");
    expect(workflow).not.toContain("secrets: inherit");
    expect(workflow).not.toContain("packages: write");
  });
});
