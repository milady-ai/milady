/**
 * Verifies that switching to ElizaCloud inference configures coding agent
 * CLI credentials to proxy through ElizaCloud's API endpoints (server.ts),
 * and that switching to a local provider clears ElizaCloud proxy base URLs
 * plus the paired OPENAI_/ANTHROPIC_ API keys when those URLs pointed at
 * ElizaCloud (provider-switch-config clearElizaCloudCliProxyEnv).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "server.ts"),
  "utf-8",
);

const providerSwitchSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "provider-switch-config.ts"),
  "utf-8",
);

describe("ElizaCloud coding agent credentials", () => {
  it("sets ANTHROPIC_BASE_URL when switching to elizacloud", () => {
    const cloudSection = serverSource.slice(
      serverSource.indexOf('normalizedProvider === "elizacloud"'),
      serverSource.indexOf(
        "else if",
        serverSource.indexOf('normalizedProvider === "elizacloud"') + 50,
      ),
    );
    expect(cloudSection).toContain("ANTHROPIC_BASE_URL");
    expect(cloudSection).toContain("ANTHROPIC_API_KEY");
    expect(cloudSection).toContain("/api/v1");
  });

  it("sets OPENAI_BASE_URL when switching to elizacloud", () => {
    const cloudSection = serverSource.slice(
      serverSource.indexOf('normalizedProvider === "elizacloud"'),
      serverSource.indexOf(
        "else if",
        serverSource.indexOf('normalizedProvider === "elizacloud"') + 50,
      ),
    );
    expect(cloudSection).toContain("OPENAI_BASE_URL");
    expect(cloudSection).toContain("OPENAI_API_KEY");
  });

  it("uses the cloud API key for both Anthropic and OpenAI proxying", () => {
    const cloudSection = serverSource.slice(
      serverSource.indexOf("Configure coding agent CLIs"),
      serverSource.indexOf("Gemini CLI and Aider"),
    );
    // Both should use cloudApiKey, not separate keys
    expect(cloudSection).toContain("ANTHROPIC_API_KEY = cloudApiKey");
    expect(cloudSection).toContain("OPENAI_API_KEY = cloudApiKey");
  });

  it("clears ElizaCloud CLI proxy URLs and paired API keys when applying a local provider", () => {
    const clearSection = providerSwitchSource.slice(
      providerSwitchSource.indexOf("function clearElizaCloudCliProxyEnv"),
      providerSwitchSource.indexOf(
        "function applyLocalProviderCapabilities",
        providerSwitchSource.indexOf(
          "function clearElizaCloudCliProxyEnv",
        ) + 1,
      ),
    );
    expect(clearSection).toContain("OPENAI_BASE_URL");
    expect(clearSection).toContain("OPENAI_API_KEY");
    expect(clearSection).toContain("ANTHROPIC_BASE_URL");
    expect(clearSection).toContain("ANTHROPIC_API_KEY");
    expect(clearSection).toContain("elizacloud");
    expect(clearSection).toContain("delete process.env[apiKey]");
    expect(providerSwitchSource).toContain("clearElizaCloudCliProxyEnv()");
  });

  it("documents that Gemini/Aider are unavailable through ElizaCloud", () => {
    const cloudSection = serverSource.slice(
      serverSource.indexOf('normalizedProvider === "elizacloud"'),
      serverSource.indexOf(
        "else if",
        serverSource.indexOf('normalizedProvider === "elizacloud"') + 50,
      ),
    );
    expect(cloudSection).toContain("Gemini CLI and Aider");
    expect(cloudSection).toContain("no");
  });
});
