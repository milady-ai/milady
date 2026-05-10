import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = (name: string) =>
  fs.readFileSync(`.github/workflows/${name}`, "utf8");

describe("CI bootstrap contract", () => {
  it("declares the local upstream postinstall skip before CI uses it", () => {
    const ci = workflow("ci.yml");
    const buildDocker = workflow("build-docker.yml");
    const setupAction = fs.readFileSync(
      ".github/actions/setup-bun-workspace/action.yml",
      "utf8",
    );

    expect(setupAction).toContain("skip-local-upstreams-postinstall:");
    expect(ci.match(/skip-local-upstreams-postinstall: "true"/g)).toHaveLength(
      4,
    );
    expect(buildDocker).toContain('MILADY_SKIP_LOCAL_UPSTREAMS: "1"');
  });

  it("builds explicit local runtime packages for the agent image", () => {
    const buildDocker = workflow("build-docker.yml");
    const postinstall = "- name: Run postinstall patches";
    const sourcePatches = "- name: Apply elizaOS source CI patches";
    const coreBuild = "- name: Build @elizaos/core";
    const agentBuild = "- name: Build agent workspace";
    const sharedBuild = "- name: Build @elizaos/shared";
    const runtimeBuild = "- name: Build runtime (tsdown)";

    expect(buildDocker).toContain(sourcePatches);
    expect(buildDocker.indexOf(sourcePatches)).toBeLessThan(
      buildDocker.indexOf(coreBuild),
    );
    expect(buildDocker.indexOf(postinstall)).toBeLessThan(
      buildDocker.indexOf(coreBuild),
    );
    expect(buildDocker.indexOf(coreBuild)).toBeLessThan(
      buildDocker.indexOf(agentBuild),
    );
    expect(buildDocker.indexOf(agentBuild)).toBeLessThan(
      buildDocker.indexOf(sharedBuild),
    );
    expect(buildDocker.indexOf(sharedBuild)).toBeLessThan(
      buildDocker.indexOf(runtimeBuild),
    );
  });

  it("bounds nested eliza installs for the agent image", () => {
    const buildDocker = workflow("build-docker.yml");

    expect(buildDocker).toContain(
      "timeout 10m bun install --cwd eliza --no-frozen-lockfile --ignore-scripts",
    );
    expect(buildDocker).toContain("eliza bun install failed after");
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

  it("hydrates local eliza runtime from the canonical repo in package-mode CI", () => {
    const setupAction = fs.readFileSync(
      ".github/actions/setup-bun-workspace/action.yml",
      "utf8",
    );
    const cloneCommand =
      'git clone --depth=1 --branch "$' +
      '{MILADY_ELIZA_BRANCH:-develop}" https://github.com/elizaOS/eliza.git eliza';

    expect(setupAction).toContain(cloneCommand);
    expect(setupAction).not.toContain("git submodule sync -- eliza");
    expect(setupAction).not.toContain(
      "git submodule update --init --depth=1 eliza",
    );
  });

  it("builds local runtime plugins after auth package alignment", () => {
    const agentReview = workflow("agent-review.yml");
    const align = "- name: Align nested eliza package resolution";
    const buildPlugins = "- name: Build local eliza runtime plugins";
    const coreBuild = "(cd eliza/packages/core && bun run build)";
    const agentSkillsBuild =
      "(cd eliza/plugins/plugin-agent-skills && bun run build)";
    const pdfBuild = "(cd eliza/plugins/plugin-pdf && bun run build)";
    const sqlBuild = "(cd eliza/plugins/plugin-sql && bun run build)";
    const runAuthSuite = "- name: Run auth test suite";

    expect(agentReview).toContain(buildPlugins);
    expect(agentReview).toContain(coreBuild);
    expect(agentReview).toContain(agentSkillsBuild);
    expect(agentReview).toContain(pdfBuild);
    expect(agentReview).toContain(sqlBuild);
    expect(agentReview.indexOf(align)).toBeLessThan(
      agentReview.indexOf(buildPlugins),
    );
    expect(agentReview.indexOf(coreBuild)).toBeLessThan(
      agentReview.indexOf(agentSkillsBuild),
    );
    expect(agentReview.indexOf(agentSkillsBuild)).toBeLessThan(
      agentReview.indexOf(pdfBuild),
    );
    expect(agentReview.indexOf(pdfBuild)).toBeLessThan(
      agentReview.indexOf(sqlBuild),
    );
    expect(agentReview.indexOf(buildPlugins)).toBeLessThan(
      agentReview.indexOf(runAuthSuite),
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

  it("links elizaOS runtime plugins and ambient UI types for local eliza checks", () => {
    const alignScript = fs.readFileSync(
      "scripts/align-eliza-ci-node-modules.mjs",
      "utf8",
    );

    expect(alignScript).toContain("function resolveInstalledPackage");
    expect(alignScript).toContain("function ensureBuiltLocalPackage");
    expect(alignScript).toContain('linkRootPackage(\n  "bun-types"');
    expect(alignScript).toContain('linkRootPackage(\n  "@types/react"');
    expect(alignScript).toContain('"@elizaos/plugin-agent-skills"');
    expect(alignScript).toContain('"@elizaos/plugin-browser-bridge"');
    expect(alignScript).toContain('"@elizaos/plugin-pdf"');
    expect(alignScript).toContain('"@elizaos/plugin-sql"');
    expect(alignScript).toContain('"@elizaos/plugin-streaming"');
    expect(alignScript).toContain('"@elizaos/cloud-routing"');
    expect(alignScript).toContain('"dist/node/index.node.js"');
    expect(alignScript).toContain('"typescript/dist/index.js"');
  });

  it("lets elizaCloud patch version drift skip cleanly", () => {
    const output = execFileSync(process.execPath, [
      "scripts/patch-elizacloud.mjs",
    ]).toString();

    expect(output).toMatch(/\[patch-elizacloud\].*skipping/);
  });
});
