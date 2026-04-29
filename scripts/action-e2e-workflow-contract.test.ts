import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRepoRoot } from "./lib/repo-root.mjs";

const repoRoot = resolveRepoRoot(import.meta.url);
const workflowPath = path.join(repoRoot, ".github", "workflows", "test.yml");
const elizaPatchPath = path.join(
  repoRoot,
  "patches",
  "eliza",
  "ci-release-contracts.patch",
);

function workflowText() {
  return fs.readFileSync(workflowPath, "utf8");
}

describe("action e2e workflow contract", () => {
  it("uses non-OpenAI provider credentials for live action invocation", () => {
    const workflow = workflowText();
    const actionE2EBlock = workflow.slice(
      workflow.indexOf("  action-e2e:"),
      workflow.indexOf("  validation-e2e:"),
    );
    const elizaPatch = fs.readFileSync(elizaPatchPath, "utf8");

    expect(actionE2EBlock).toContain('name: "Action Invocation E2E"');
    expect(actionE2EBlock).toContain(
      `ELIZA_E2E_OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}`,
    );
    expect(actionE2EBlock).toContain(
      `ELIZA_E2E_ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}`,
    );
    expect(actionE2EBlock).toContain(
      `ELIZA_E2E_GOOGLE_GENERATIVE_AI_API_KEY: \${{ secrets.GOOGLE_GENERATIVE_AI_API_KEY }}`,
    );
    expect(actionE2EBlock).toContain(
      `ELIZA_E2E_GROQ_API_KEY: \${{ secrets.GROQ_API_KEY }}`,
    );
    expect(actionE2EBlock).toContain(
      `ELIZAOS_CLOUD_API_KEY: \${{ secrets.ELIZAOS_CLOUD_API_KEY != '' && secrets.ELIZAOS_CLOUD_API_KEY || secrets.ELIZACLOUD_API_KEY }}`,
    );
    expect(actionE2EBlock).toContain(
      `ELIZAOS_CLOUD_BASE_URL: \${{ secrets.ELIZAOS_CLOUD_BASE_URL }}`,
    );
    expect(actionE2EBlock).not.toContain("OPENAI_API_KEY:");
    expect(actionE2EBlock).not.toContain("OPENAI_BASE_URL:");
    expect(elizaPatch).not.toContain(
      '? (selectLiveProvider("openai") ?? selectLiveProvider())',
    );
    expect(elizaPatch).toContain('selectLiveProvider("elizacloud")');
    expect(elizaPatch).toContain('selectLiveProvider("anthropic")');
    expect(elizaPatch).toContain('selectLiveProvider("google")');
    expect(elizaPatch).toContain('selectLiveProvider("groq")');
    expect(elizaPatch).toContain('selectLiveProvider("openrouter")');
    expect(elizaPatch.indexOf('selectLiveProvider("elizacloud")')).toBeLessThan(
      elizaPatch.indexOf('selectLiveProvider("anthropic")'),
    );
    expect(elizaPatch).toContain('plugin: "@elizaos/plugin-elizacloud"');
    expect(elizaPatch).toContain(
      "ELIZAOS_CLOUD_ACTION_PLANNER_MODEL: largeModel",
    );
    expect(elizaPatch).toContain(
      [
        "  LIVE_PROVIDER_ENV_KEYS.add(provider.largeModelEnvVar);",
        "+  for (const key of provider.extraEnvVars ?? []) {",
      ].join("\n"),
    );
    expect(elizaPatch).not.toContain(
      [
        "  keyEnvVars: string[];",
        "+  for (const key of provider.extraEnvVars ?? []) {",
      ].join("\n"),
    );
    expect(actionE2EBlock).toContain(
      "Action Invocation E2E skipped because the configured external provider is unavailable.",
    );
    expect(actionE2EBlock).toContain(
      "grep -Eiq 'exceeded your current quota|quota exceeded|insufficient[_ -]?(quota|balance|funds|credits?)|billing details|credit balance|please add credits|top[_ -]?up your credits|invalid api key|unauthorized|authentication|status code: 429|too many requests|unexpected error occurred while processing the request|temporarily unavailable|service unavailable|internal server error|overloaded' \"$log_file\"",
    );
  });
});
