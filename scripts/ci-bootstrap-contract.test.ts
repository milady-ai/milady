import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = (name: string) =>
  fs.readFileSync(`.github/workflows/${name}`, "utf8");

describe("CI bootstrap contract", () => {
  it("declares the local upstream postinstall skip before CI uses it", () => {
    const ci = workflow("ci.yml");
    const setupAction = fs.readFileSync(
      ".github/actions/setup-bun-workspace/action.yml",
      "utf8",
    );

    expect(setupAction).toContain("skip-local-upstreams-postinstall:");
    expect(ci.match(/skip-local-upstreams-postinstall: "true"/g)).toHaveLength(
      3,
    );
  });

  it("does not run nested eliza workspace installs inside CI jobs", () => {
    const ci = workflow("ci.yml");

    expect(ci).not.toContain(
      "bun install --cwd eliza --no-frozen-lockfile --ignore-scripts",
    );
    expect(ci).not.toContain(
      "bun install --cwd eliza/cloud --no-frozen-lockfile --ignore-scripts",
    );
  });

  it("builds elizaOS core before bundled skills", () => {
    const ci = workflow("ci.yml");
    const coreBuild = "(cd eliza/packages/core && bun run build)";
    const skillsBuild = "(cd eliza/packages/skills && bun run build)";

    expect(ci).toContain(coreBuild);
    expect(ci).toContain(skillsBuild);
    expect(ci.indexOf(coreBuild)).toBeLessThan(ci.indexOf(skillsBuild));
  });

  it("generates protobuf types before auth tests run", () => {
    const agentReview = workflow("agent-review.yml");
    const generateProtobuf = "- name: Generate protobuf types";
    const runAuthSuite = "- name: Run auth test suite";

    expect(agentReview).toContain(generateProtobuf);
    expect(agentReview).toContain("bunx @bufbuild/buf@1.67.0 generate");
    expect(agentReview.indexOf(generateProtobuf)).toBeLessThan(
      agentReview.indexOf(runAuthSuite),
    );
  });

  it("generates protobuf types inside the shared setup action for base-workflow auth gates", () => {
    const setupAction = fs.readFileSync(
      ".github/actions/setup-bun-workspace/action.yml",
      "utf8",
    );
    const installDependencies = "- name: Install dependencies";
    const generateProtobuf = "- name: Generate local eliza protobuf types";
    const postinstallPatches = "- name: Run repository postinstall patches";

    expect(setupAction).toContain(generateProtobuf);
    expect(setupAction).toContain(
      "inputs.prepare-local-eliza-runtime == 'true'",
    );
    expect(setupAction).toContain("bunx @bufbuild/buf@1.67.0 generate");
    expect(setupAction.indexOf(installDependencies)).toBeLessThan(
      setupAction.indexOf(generateProtobuf),
    );
    expect(setupAction.indexOf(generateProtobuf)).toBeLessThan(
      setupAction.indexOf(postinstallPatches),
    );
  });

  it("aligns nested eliza package resolution before auth tests run", () => {
    const agentReview = workflow("agent-review.yml");
    const align = "- name: Align nested eliza package resolution";
    const runAuthSuite = "- name: Run auth test suite";

    expect(agentReview).toContain(align);
    expect(agentReview).toContain(
      "run: node scripts/align-eliza-ci-node-modules.mjs",
    );
    expect(agentReview.indexOf(align)).toBeLessThan(
      agentReview.indexOf(runAuthSuite),
    );
  });

  it("lets elizaCloud patch version drift skip cleanly", () => {
    const output = execFileSync(process.execPath, [
      "scripts/patch-elizacloud.mjs",
    ]).toString();

    expect(output).toMatch(/\[patch-elizacloud\].*skipping/);
  });
});
