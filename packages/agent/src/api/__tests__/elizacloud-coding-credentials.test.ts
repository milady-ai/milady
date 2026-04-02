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

const providerSwitchRouteSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "provider-switch-routes.ts"),
  "utf-8",
);

const providerSwitchSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "provider-switch-config.ts"),
  "utf-8",
);

function sliceSection(
  source: string,
  startNeedle: string,
  endNeedle: string,
): string {
  const start = source.indexOf(startNeedle);
  if (start === -1) return "";
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

describe("ElizaCloud coding agent credentials", () => {
  const cloudSwitchSection = sliceSection(
    providerSwitchRouteSource,
    'if (normalizedProvider === "elizacloud")',
    "} else if",
  );

  it("sets ANTHROPIC_BASE_URL when switching to elizacloud", () => {
    expect(cloudSwitchSection).toContain("ANTHROPIC_BASE_URL");
    expect(cloudSwitchSection).toContain("ANTHROPIC_API_KEY");
    expect(cloudSwitchSection).toContain("/api/v1");
  });

  it("sets OPENAI_BASE_URL when switching to elizacloud", () => {
    expect(cloudSwitchSection).toContain("OPENAI_BASE_URL");
    expect(cloudSwitchSection).toContain("OPENAI_API_KEY");
  });

  it("uses the cloud API key for both Anthropic and OpenAI proxying", () => {
    expect(cloudSwitchSection).toContain("ANTHROPIC_API_KEY = cloudApiKey");
    expect(cloudSwitchSection).toContain("OPENAI_API_KEY = cloudApiKey");
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

  it("only provisions Anthropic and OpenAI proxy env vars for ElizaCloud", () => {
    expect(cloudSwitchSection).not.toContain("GEMINI_BASE_URL");
    expect(cloudSwitchSection).not.toContain("GEMINI_API_KEY");
    expect(cloudSwitchSection).not.toContain("AIDER_API_KEY");
  });
});
