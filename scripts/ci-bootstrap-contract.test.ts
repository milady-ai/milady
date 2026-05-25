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

  it("builds local runtime plugins after auth package alignment", () => {
    const agentReview = workflow("agent-review.yml");
    const align = "- name: Align nested eliza package resolution";
    const buildPlugins = "- name: Build local eliza runtime plugins";
    const localElizaGuard =
      "if: $" + "{{ hashFiles('eliza/package.json') != '' }}";
    const coreBuild = "(cd eliza/packages/core && bun run build)";
    const pluginBuild =
      "(cd eliza/plugins/plugin-agent-skills && bun run build)";
    const runAuthSuite = "- name: Run auth test suite";

    expect(agentReview).toContain(buildPlugins);
    expect(agentReview).toContain(localElizaGuard);
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

    expect(gitleaks).toContain('GITLEAKS_VERSION: "8.30.1"');
    expect(gitleaks).toContain(
      "gitleaks detect --source . --config .gitleaks.toml --redact --no-banner --verbose",
    );
    expect(gitleaks).not.toContain("gitleaks/gitleaks-action");
  });

  it("hydrates eliza source before SOC2 verification", () => {
    const soc2 = workflow("soc2-verify.yml");
    const clone = "git clone --depth=1 --branch";
    const install = "- name: Install dependencies (eliza/)";
    const verify = "- name: Run SOC2 verification";

    expect(soc2).toContain("Initialize eliza source checkout");
    expect(soc2).toContain("https://github.com/elizaOS/eliza.git eliza");
    expect(soc2.indexOf(clone)).toBeLessThan(soc2.indexOf(install));
    expect(soc2.indexOf(install)).toBeLessThan(soc2.indexOf(verify));
  });

  it("lets elizaCloud patch version drift skip cleanly", () => {
    const output = execFileSync(process.execPath, [
      "scripts/patch-elizacloud.mjs",
    ]).toString();

    expect(output).toMatch(/\[patch-elizacloud\].*skipping/);
  });
});
