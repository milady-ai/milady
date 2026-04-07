/**
 * Validates CI workflow conventions identified in the workflow audit.
 * Guards against regression of fixes: BUN_VERSION consistency, concurrency
 * groups, runner pinning, and composite action availability.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOWS_DIR = path.resolve(__dirname, "../.github/workflows");
const ACTIONS_DIR = path.resolve(__dirname, "../.github/actions");

function readWorkflow(name: string): string {
  return fs.readFileSync(path.join(WORKFLOWS_DIR, name), "utf-8");
}

describe("CI workflow audit regressions", () => {
  it("electrobun workflows keep expected Bun pins", () => {
    const expectedPins: Record<string, string> = {
      "release-electrobun.yml": "1.3.9",
      "release-electrobun-build-linux-x64-testbox.yml": "1.3.9",
      "release-electrobun-build-windows-x64-testbox.yml": "1.3.9",
      "test-electrobun-release.yml": "1.3.9",
    };
    for (const [f, expected] of Object.entries(expectedPins)) {
      const content = readWorkflow(f);
      const match = content.match(/BUN_VERSION:\s*"([^"]+)"/);
      expect(match, `${f} should declare BUN_VERSION`).toBeTruthy();
      expect(match?.[1]).toBe(expected);
    }
  });

  it("android workflows pin Bun version", () => {
    const files = [
      "android-release.yml",
      "android-release-build-aab-testbox.yml",
    ];
    for (const f of files) {
      const content = readWorkflow(f);
      expect(content).toMatch(/bun-version:\s*["']?1\.3\.10/);
    }
  });

  it("Docker build workflows use pinned Blacksmith runners", () => {
    const files = [
      "build-docker.yml",
      "build-cloud-image.yml",
      "docker-ci-smoke.yml",
    ];
    for (const f of files) {
      const content = readWorkflow(f);
      expect(content).not.toMatch(/runs-on:\s*ubuntu-latest/);
    }
  });

  it("keeps the cloud image workflow and removes steward", () => {
    expect(
      fs.existsSync(path.join(WORKFLOWS_DIR, "build-cloud-image.yml")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(WORKFLOWS_DIR, "build-steward-image.yml")),
    ).toBe(false);
  });

  it("publish-packages.yml does not have an update-homebrew job", () => {
    const content = readWorkflow("publish-packages.yml");
    // The standalone update-homebrew.yml handles this; no duplicate job
    expect(content).not.toMatch(/^\s{2}update-homebrew:/m);
  });

  it("nightly.yml publishes npm inline with the nightly dist-tag", () => {
    const content = readWorkflow("nightly.yml");
    expect(content).toMatch(/npm publish --tag nightly/);
  });

  it("nightly and benchmark workflows suppress expected Vitest node warning noise", () => {
    expect(readWorkflow("nightly.yml")).toContain('NODE_NO_WARNINGS: "1"');
    expect(readWorkflow("benchmark-tests.yml")).toContain(
      'NODE_NO_WARNINGS: "1"',
    );
  });

  it("setup-bun-workspace composite action exists (supersedes setup-native-deps)", () => {
    expect(
      fs.existsSync(path.join(ACTIONS_DIR, "setup-bun-workspace/action.yml")),
    ).toBe(true);
  });

  it("agent-fix-ci.yml and agent-implement.yml exist with trust scoring", () => {
    const fixer = readWorkflow("agent-fix-ci.yml");
    const implementer = readWorkflow("agent-implement.yml");
    expect(fixer).toMatch(/trust-scoring\.cjs/);
    expect(implementer).toMatch(/trust-scoring\.cjs/);
  });

  it("release-orchestrator.yml exists with trust gate", () => {
    const content = readWorkflow("release-orchestrator.yml");
    expect(content).toMatch(/trust-scoring\.cjs/);
    expect(content).toMatch(/release-tracker/);
  });

  it("deploy-origin-smoke runs both origin status smoke and life-ops smoke", () => {
    const content = readWorkflow("deploy-origin-smoke.yml");
    expect(content).toContain("name: Run deploy smoke checks");
    expect(content).toContain("run: bun run smoke:api-status");
    expect(content).toContain("MILADY_DEPLOY_BASE_URLS:");
    expect(content).toContain("name: Run Life Ops smoke checks");
    expect(content).toContain("run: bun run smoke:lifeops");
    expect(content).toContain(
      `MILADY_LIFEOPS_BASE_URLS: \${{ env.APP_ORIGIN }}`,
    );
    expect(content).toContain(
      `MILADY_SMOKE_API_TOKEN: \${{ secrets.MILADY_API_TOKEN }}`,
    );
    expect(content).toContain(
      `ELIZA_SMOKE_API_TOKEN: \${{ secrets.ELIZA_API_TOKEN }}`,
    );
  });
});
