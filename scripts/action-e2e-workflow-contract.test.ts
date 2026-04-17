import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRepoRoot } from "./lib/repo-root.mjs";

const repoRoot = resolveRepoRoot(import.meta.url);
const workflowPath = path.join(repoRoot, ".github", "workflows", "test.yml");

function workflowText() {
  return fs.readFileSync(workflowPath, "utf8");
}

describe("action e2e workflow contract", () => {
  it("prefers non-OpenAI providers and falls back to Eliza Cloud before raw OpenAI", () => {
    const workflow = workflowText();

    expect(workflow).toContain('name: "Action Invocation E2E"');
    expect(workflow).toContain(
      "GOOGLE_GENERATIVE_AI_API_KEY: ${{ secrets.GOOGLE_GENERATIVE_AI_API_KEY }}",
    );
    expect(workflow).toContain(
      "OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}",
    );
    expect(workflow).toContain(
      "ELIZAOS_CLOUD_API_KEY: ${{ secrets.ELIZAOS_CLOUD_API_KEY }}",
    );
    expect(workflow).toContain(
      "OPENAI_API_KEY: ${{ secrets.ELIZAOS_CLOUD_API_KEY != '' && secrets.ELIZAOS_CLOUD_API_KEY || secrets.OPENAI_API_KEY }}",
    );
    expect(workflow).toContain(
      "OPENAI_BASE_URL: ${{ secrets.ELIZAOS_CLOUD_API_KEY != '' && 'https://elizacloud.ai/api/v1' || 'https://api.openai.com/v1' }}",
    );
    expect(workflow).toContain(
      "Action Invocation E2E skipped because the configured live provider is unavailable.",
    );
    expect(workflow).toContain(
      "grep -Eiq 'exceeded your current quota|insufficient[_ -]?quota|billing details|credit balance|invalid api key|unauthorized|authentication|status code: 429|too many requests' \"$log_file\"",
    );
  });
});
