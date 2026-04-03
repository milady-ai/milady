import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

function readDoc(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("docs command regressions", () => {
  it("keeps beginner user guidance aligned with supported CLI commands", () => {
    const beginnerGuide = readDoc("docs/guides/beginners-user-guide.md");

    expect(beginnerGuide).toContain("milady start");
    expect(beginnerGuide).not.toContain("milady start --headless");
    expect(beginnerGuide).not.toContain("milady doctor");
    expect(beginnerGuide).toContain("milady plugins install <name>");
    expect(beginnerGuide).toContain("milady plugins uninstall <name>");
    expect(beginnerGuide).not.toContain("milady plugins add <name>");
    expect(beginnerGuide).not.toContain("milady plugins remove <name>");
  });

  it("does not present unsupported first-run commands in quickstart docs", () => {
    const quickstart = readDoc("docs/quickstart.mdx");

    expect(quickstart).not.toContain("milady start --headless");
    expect(quickstart).not.toContain("milady doctor");
  });

  it("documents canonical runtime routing instead of root connection state", () => {
    const onboarding = readDoc("docs/rest/onboarding.md");
    const system = readDoc("docs/rest/system.md");
    const apiReference = readDoc("docs/api-reference.mdx");
    const configuration = readDoc("docs/configuration.mdx");

    expect(onboarding).toContain("deploymentTarget");
    expect(onboarding).toContain("linkedAccounts");
    expect(onboarding).toContain("serviceRouting");
    expect(onboarding).toContain("credentialInputs");
    expect(onboarding).not.toContain(
      "authoritative active-provider record persisted at the config root",
    );
    expect(system).not.toContain(
      "The root `connection` field is the authoritative active-provider record.",
    );
    expect(system).toContain("credentialInputs");
    expect(apiReference).toContain("canonical routing state");
    expect(apiReference).not.toContain("canonical `connection` state");
    expect(configuration).toContain(
      "root `connection` field is no longer part of the",
    );
  });

  it("describes chooser-first startup in consumer docs", () => {
    const quickstart = readDoc("docs/quickstart.mdx");
    const beginnerGuide = readDoc("docs/guides/beginners-user-guide.md");
    const dashboard = readDoc("docs/apps/dashboard.md");
    const onboardingFlow = readDoc("docs/guides/onboarding-ui-flow.md");

    expect(quickstart).toContain("Choose a server");
    expect(quickstart).toContain("Create one");
    expect(beginnerGuide).toContain("chooser-first flow");
    expect(beginnerGuide).toContain("server target");
    expect(dashboard).toContain("server chooser / startup flow");
    expect(onboardingFlow).toContain("Startup chooser");
    expect(onboardingFlow).toContain("serviceRouting.llmText");
    expect(onboardingFlow).not.toContain("full local setup path");
    expect(onboardingFlow).not.toContain("cloud path (`welcome`");
  });

  it("keeps developer docs and consumer docs on separate published surfaces", () => {
    const index = readDoc("docs/index.mdx");
    const quickstart = readDoc("docs/quickstart.mdx");
    const beginnerGuide = readDoc("docs/guides/beginners-user-guide.md");

    expect(index).toContain("https://docs.milady.ai");
    expect(index).toContain("https://milady.ai/docs");
    expect(quickstart).toContain("https://docs.milady.ai");
    expect(quickstart).toContain("https://milady.ai/docs");
    expect(beginnerGuide).toContain("https://docs.milady.ai");
    expect(beginnerGuide).toContain("https://milady.ai/docs");
  });

  it("documents the published npm package name as miladyai", () => {
    const installation = readDoc("docs/installation.mdx");
    const configuration = readDoc("docs/configuration.mdx");
    const architecture = readDoc("docs/architecture.mdx");
    const cliOverview = readDoc("docs/cli/overview.md");

    expect(installation).toContain("npm install -g miladyai");

    expect(configuration).toContain("npm package name is `miladyai`");

    expect(architecture).toContain("the `miladyai` npm package");

    expect(cliOverview).toContain("bun install -g miladyai");
    expect(cliOverview).toContain("bunx miladyai");
  });
});
