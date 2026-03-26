/**
 * Verifies that switching to ElizaCloud inference configures coding agent
 * CLI credentials to proxy through ElizaCloud's API endpoints, and that
 * switching away clears the proxy base URLs.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
	path.resolve(import.meta.dirname, "..", "server.ts"),
	"utf-8",
);

describe("ElizaCloud coding agent credentials", () => {
	it("sets ANTHROPIC_BASE_URL when switching to elizacloud", () => {
		const cloudSection = serverSource.slice(
			serverSource.indexOf('normalizedProvider === "elizacloud"'),
			serverSource.indexOf("else if", serverSource.indexOf('normalizedProvider === "elizacloud"') + 50),
		);
		expect(cloudSection).toContain("ANTHROPIC_BASE_URL");
		expect(cloudSection).toContain("ANTHROPIC_API_KEY");
		expect(cloudSection).toContain("/api/v1");
	});

	it("sets OPENAI_BASE_URL when switching to elizacloud", () => {
		const cloudSection = serverSource.slice(
			serverSource.indexOf('normalizedProvider === "elizacloud"'),
			serverSource.indexOf("else if", serverSource.indexOf('normalizedProvider === "elizacloud"') + 50),
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

	it("clears proxy base URLs when switching away from elizacloud", () => {
		const disableSection = serverSource.slice(
			serverSource.indexOf("const disableCloudInference"),
			serverSource.indexOf("const enableCloudInference"),
		);
		expect(disableSection).toContain("delete process.env.ANTHROPIC_BASE_URL");
		expect(disableSection).toContain("delete process.env.OPENAI_BASE_URL");
	});

	it("documents that Gemini/Aider are unavailable through ElizaCloud", () => {
		const cloudSection = serverSource.slice(
			serverSource.indexOf('normalizedProvider === "elizacloud"'),
			serverSource.indexOf("else if", serverSource.indexOf('normalizedProvider === "elizacloud"') + 50),
		);
		expect(cloudSection).toContain("Gemini CLI and Aider");
		expect(cloudSection).toContain("no");
	});
});
