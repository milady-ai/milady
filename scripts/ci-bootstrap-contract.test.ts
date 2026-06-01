import fs from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = (name: string) =>
  fs.readFileSync(`.github/workflows/${name}`, "utf8");

const githubExpression = (value: string) => `\${{ ${value} }}`;

describe("CI bootstrap contract", () => {
  it("declares the local upstream postinstall skip before CI uses it", () => {
    const ci = workflow("ci.yml");
    const setupAction = fs.readFileSync(
      ".github/actions/setup-bun-workspace/action.yml",
      "utf8",
    );

    expect(setupAction).toContain("skip-local-upstreams-postinstall:");
    expect(ci.match(/skip-local-upstreams-postinstall: "true"/g)).toHaveLength(
      4,
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
    const packageModeCompatibility =
      "- name: Prepare package-mode eliza runtime compatibility";

    expect(setupAction).toContain(generateProtobuf);
    expect(setupAction).toContain(
      "inputs.prepare-local-eliza-runtime == 'true'",
    );
    expect(setupAction).toContain("bunx @bufbuild/buf@1.67.0 generate");
    expect(setupAction).toContain(packageModeCompatibility);
    expect(setupAction).toContain(
      "inputs.skip-local-upstreams-postinstall == 'true'",
    );
    expect(setupAction).toContain("eliza/packages/core/dist/index.node.js");
    expect(setupAction.indexOf(installDependencies)).toBeLessThan(
      setupAction.indexOf(generateProtobuf),
    );
    expect(setupAction.indexOf(generateProtobuf)).toBeLessThan(
      setupAction.indexOf(postinstallPatches),
    );
    expect(setupAction.indexOf(postinstallPatches)).toBeLessThan(
      setupAction.indexOf(packageModeCompatibility),
    );
  });

  it("builds local runtime plugins after auth package alignment", () => {
    const agentReview = workflow("agent-review.yml");
    const align = "- name: Align nested eliza package resolution";
    const buildPlugins = "- name: Build local eliza runtime plugins";
    const localElizaGuard =
      "if [ ! -f eliza/packages/core/package.json ]; then";
    const coreBuild = "(cd eliza/packages/core && bun run build)";
    const pluginBuild =
      "(cd eliza/plugins/plugin-agent-skills && bun run build)";
    const runAuthSuite = "- name: Run auth test suite";

    expect(agentReview).toContain(buildPlugins);
    expect(agentReview).toContain(localElizaGuard);
    expect(agentReview).toContain(
      "eliza core source absent; skipping local runtime plugin build",
    );
    expect(agentReview).toContain(coreBuild);
    expect(agentReview).toContain(pluginBuild);
    expect(agentReview.indexOf(align)).toBeLessThan(
      agentReview.indexOf(buildPlugins),
    );
    expect(agentReview.indexOf(coreBuild)).toBeLessThan(
      agentReview.indexOf(pluginBuild),
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

  it("soft-skips review verdicts when the AI reviewer is unavailable", () => {
    const agentReview = workflow("agent-review.yml");

    expect(agentReview).toContain("const serviceUnavailablePattern");
    expect(agentReview).toContain("credit balance is too low");
    expect(agentReview).toContain("allowServiceUnavailable");
    expect(agentReview).toContain("decision = 'SKIPPED (service unavailable)'");
    expect(agentReview).toContain("'service-unavailable': 'neutral'");
  });

  it("only forces local upstreams in CI build when eliza source exists", () => {
    const ci = workflow("ci.yml");

    expect(ci).toContain(
      "if: $" + "{{ hashFiles('eliza/packages/app-core/package.json') != '' }}",
    );
    expect(ci).toContain(
      "MILADY_FORCE_LOCAL_UPSTREAMS: $" +
        "{{ hashFiles('eliza/packages/app-core/package.json') != '' && '1' || '' }}",
    );
  });

  it("runs gitleaks without the licensed org action", () => {
    const gitleaks = workflow("gitleaks.yml");
    const prRange =
      `gitleaks git . --log-opts="${githubExpression("github.event.pull_request.base.sha")}..` +
      `${githubExpression("github.event.pull_request.head.sha")}" --config .gitleaks.toml --redact --no-banner --verbose`;
    const pushRange =
      `gitleaks git . --log-opts="${githubExpression("github.event.before")}..` +
      `${githubExpression("github.sha")}" --config .gitleaks.toml --redact --no-banner --verbose`;

    expect(gitleaks).toContain('GITLEAKS_VERSION: "8.30.1"');
    expect(gitleaks).toContain(prRange);
    expect(gitleaks).toContain(pushRange);
    expect(gitleaks).toContain(
      "gitleaks dir . --config .gitleaks.toml --redact --no-banner --verbose",
    );
    expect(gitleaks).not.toContain("gitleaks/gitleaks-action");
  });
});
