import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const SETUP_ACTION_PATH = path.join(
  ROOT,
  ".github/actions/setup-bun-workspace/action.yml",
);
const CI_WORKFLOW_PATH = path.join(ROOT, ".github/workflows/ci.yml");
const CI_FORK_WORKFLOW_PATH = path.join(ROOT, ".github/workflows/ci-fork.yml");
const TEST_WORKFLOW_PATH = path.join(ROOT, ".github/workflows/test.yml");
const BUILD_DOCKER_WORKFLOW_PATH = path.join(
  ROOT,
  ".github/workflows/build-docker.yml",
);
const BUILD_CLOUD_IMAGE_WORKFLOW_PATH = path.join(
  ROOT,
  ".github/workflows/build-cloud-image.yml",
);
const DEPLOY_WEB_WORKFLOW_PATH = path.join(
  ROOT,
  ".github/workflows/deploy-web.yml",
);
const DOCKER_SMOKE_WORKFLOW_PATH = path.join(
  ROOT,
  ".github/workflows/docker-ci-smoke.yml",
);
const DOCKER_SMOKE_SCRIPT_PATH = path.join(ROOT, "scripts/docker-ci-smoke.sh");
const ADDITIONAL_SUBMODULE_WORKFLOW_PATHS = [
  ".github/workflows/agent-fix-ci.yml",
  ".github/workflows/agent-implement.yml",
  ".github/workflows/agent-release.yml",
  ".github/workflows/apple-store-release.yml",
  ".github/workflows/nightly.yml",
  ".github/workflows/release-electrobun-build-linux-x64-testbox.yml",
  ".github/workflows/release-electrobun-build-windows-x64-testbox.yml",
  ".github/workflows/release-electrobun.yml",
  ".github/workflows/reusable-npm-publish.yml",
  ".github/workflows/test-electrobun-release.yml",
  ".github/workflows/windows-desktop-preload-smoke.yml",
].map((workflowPath) => path.join(ROOT, workflowPath));

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("CI workflow drift", () => {
  it("defines a shared workspace setup action for Bun-based jobs", () => {
    const action = read(SETUP_ACTION_PATH);

    expect(action).toContain('name: "Setup Bun Workspace"');
    expect(action).toContain("uses: actions/setup-python@v5");
    expect(action).toContain("uses: oven-sh/setup-bun@v2");
    expect(action).toContain("uses: actions/cache@v4");
    expect(action).toContain("run: bun run postinstall");
  });

  it("keeps same-repo PRs and pushes out of the fork workflow", () => {
    const workflow = read(CI_FORK_WORKFLOW_PATH);
    const forkGate =
      "if: github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.fork == true)";

    expect(workflow).not.toContain("push:");
    expect(countOccurrences(workflow, forkGate)).toBe(4);
    expect(
      countOccurrences(workflow, "uses: ./.github/actions/setup-bun-workspace"),
    ).toBe(4);
  });

  it("routes core CI jobs through the shared setup action", () => {
    const workflow = read(CI_WORKFLOW_PATH);

    expect(
      countOccurrences(workflow, "uses: ./.github/actions/setup-bun-workspace"),
    ).toBe(5);
    expect(workflow).toContain('skip-avatar-clone: "true"');
    expect(workflow).toContain('no-vision-deps: "true"');
    expect(workflow).not.toContain(
      "Run repository postinstall patches\n        run: bun run postinstall",
    );
  });

  it("suppresses expected Vitest node warning noise in CI test lanes", () => {
    expect(read(CI_WORKFLOW_PATH)).toContain('NODE_NO_WARNINGS: "1"');
    expect(read(CI_FORK_WORKFLOW_PATH)).toContain('NODE_NO_WARNINGS: "1"');
    expect(read(TEST_WORKFLOW_PATH)).toContain('NODE_NO_WARNINGS: "1"');
  });

  it("uses the shared setup action in test jobs without reintroducing double postinstall", () => {
    const workflow = read(TEST_WORKFLOW_PATH);

    expect(
      countOccurrences(workflow, "uses: ./.github/actions/setup-bun-workspace"),
    ).toBe(6);
    expect(workflow).toContain('run-postinstall: "false"');
    expect(workflow).toContain("install-command: bun install");
    expect(workflow).toContain(
      "install-command: bun install --frozen-lockfile --ignore-scripts",
    );
  });

  it("checks out recursive submodules before root workspace installs", () => {
    // CI uses submodules: false + MILADY_SKIP_LOCAL_UPSTREAMS=1 to avoid
    // fetching the eliza submodule (which may have dangling refs). Non-eliza
    // submodules are restored during postinstall.
    expect(countOccurrences(read(CI_WORKFLOW_PATH), "submodules: false")).toBe(
      5,
    );
    // test.yml also uses submodules: false (13 jobs)
    expect(
      countOccurrences(read(TEST_WORKFLOW_PATH), "submodules: false"),
    ).toBe(13);
    expect(read(BUILD_DOCKER_WORKFLOW_PATH)).toContain("submodules: false");
    expect(read(BUILD_CLOUD_IMAGE_WORKFLOW_PATH)).toContain(
      "submodules: recursive",
    );
    expect(read(DEPLOY_WEB_WORKFLOW_PATH)).toContain("submodules: false");
    expect(read(DOCKER_SMOKE_WORKFLOW_PATH)).toContain("submodules: false");
    for (const workflowPath of ADDITIONAL_SUBMODULE_WORKFLOW_PATHS) {
      expect(read(workflowPath)).toContain("submodules:");
    }
  });

  it("re-initializes tracked non-eliza submodules after published-only checkout", () => {
    expect(read(SETUP_ACTION_PATH)).toContain(
      "run: node scripts/init-submodules.mjs",
    );
    expect(
      countOccurrences(
        read(TEST_WORKFLOW_PATH),
        "run: node scripts/init-submodules.mjs",
      ),
    ).toBe(6);
    expect(read(BUILD_DOCKER_WORKFLOW_PATH)).toContain(
      "run: node scripts/init-submodules.mjs",
    );
    expect(read(DEPLOY_WEB_WORKFLOW_PATH)).toContain(
      "run: node scripts/init-submodules.mjs",
    );
    expect(read(DOCKER_SMOKE_SCRIPT_PATH)).toContain(
      "node scripts/init-submodules.mjs",
    );
  });

  it("builds the bundled orchestrator workspace before Docker image packaging", () => {
    const dockerWorkflow = read(BUILD_DOCKER_WORKFLOW_PATH);
    const cloudWorkflow = read(BUILD_CLOUD_IMAGE_WORKFLOW_PATH);

    expect(dockerWorkflow).toContain("Build bundled orchestrator workspace");
    expect(dockerWorkflow).toContain("cd plugins/plugin-agent-orchestrator");
    expect(dockerWorkflow).toContain("bun run build");

    expect(cloudWorkflow).toContain("Build bundled orchestrator workspace");
    expect(cloudWorkflow).toContain("cd plugins/plugin-agent-orchestrator");
    expect(cloudWorkflow).toContain("bun run build");
  });
});
