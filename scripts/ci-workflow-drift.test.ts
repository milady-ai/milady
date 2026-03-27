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
});
