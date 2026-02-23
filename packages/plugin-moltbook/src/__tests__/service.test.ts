import { describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import type { MoltbookConfig } from "../config.ts";
import { MoltbookService } from "../services/moltbook-service.ts";

const mockRuntime = {} as IAgentRuntime;

function makeConfig(overrides: Partial<MoltbookConfig> = {}): MoltbookConfig {
  return {
    apiBaseUrl: "https://www.moltbook.com/api/v1",
    timeoutMs: 5_000,
    maxResponseChars: 20_000,
    credentialsPath: path.join(os.tmpdir(), "moltbook-test-creds.json"),
    ...overrides,
  };
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {
    "Content-Type": "application/json",
  },
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("MoltbookService", () => {
  it("onboards agent and saves credentials by default", async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "moltbook-onboard-"),
    );
    const credentialsPath = path.join(tmpDir, "credentials.json");

    const service = new MoltbookService(
      mockRuntime,
      makeConfig({ credentialsPath }),
      {
        fetchImpl: async () =>
          jsonResponse(200, {
            success: true,
            agent: {
              api_key: "moltbook_abc123",
              claim_url: "https://www.moltbook.com/claim/abc123",
              verification_code: "reef-X4B2",
            },
          }),
      },
    );

    const result = await service.onboardAgent({
      name: "MiladyAgent",
      description: "A test agent",
    });

    expect(result.success).toBe(true);
    expect(result.apiKey).toBe("moltbook_abc123");
    expect(result.claimUrl).toContain("/claim/");
    expect(result.credentialsSavedPath).toBe(credentialsPath);

    const saved = JSON.parse(await fs.readFile(credentialsPath, "utf8")) as {
      api_key: string;
      agent_name: string;
    };
    expect(saved.api_key).toBe("moltbook_abc123");
    expect(saved.agent_name).toBe("MiladyAgent");
  });

  it("surfaces upstream onboarding errors with status and details", async () => {
    const service = new MoltbookService(mockRuntime, makeConfig(), {
      fetchImpl: async () =>
        jsonResponse(429, {
          success: false,
          error: "rate_limited",
          hint: "Slow down and try again later.",
          retry_after_minutes: 30,
        }),
    });

    let thrown: unknown;
    try {
      await service.onboardAgent({
        name: "MiladyAgent",
        description: "A test agent",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("Moltbook onboarding failed");
    expect(message).toContain("rate_limited");
    expect(message).toContain("status 429");
    expect(message).toContain("retry after 30 minutes");
  });

  it("surfaces array-style upstream validation messages for onboarding errors", async () => {
    const service = new MoltbookService(mockRuntime, makeConfig(), {
      fetchImpl: async () =>
        jsonResponse(400, {
          success: false,
          message: [
            "property metadata should not exist",
            "name must be shorter than or equal to 80 characters",
          ],
        }),
    });

    let thrown: unknown;
    try {
      await service.onboardAgent({
        name: "MiladyAgent",
        description: "A test agent",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("Moltbook onboarding failed");
    expect(message).toContain("property metadata should not exist");
    expect(message).toContain(
      "name must be shorter than or equal to 80 characters",
    );
    expect(message).toContain("status 400");
    expect(message).not.toContain("HTTP 400");
  });

  it("uses API key from credentials file for authenticated requests", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "moltbook-creds-"));
    const credentialsPath = path.join(tmpDir, "credentials.json");
    await fs.writeFile(
      credentialsPath,
      JSON.stringify({
        api_key: "moltbook_from_file",
        agent_name: "FileAgent",
      }),
      "utf8",
    );

    let seenAuthHeader = "";

    const service = new MoltbookService(
      mockRuntime,
      makeConfig({ credentialsPath }),
      {
        fetchImpl: async (_url, init) => {
          const headers = new Headers(init?.headers);
          seenAuthHeader = headers.get("Authorization") || "";
          return jsonResponse(200, { success: true, data: { id: "123" } });
        },
      },
    );

    const result = await service.request({
      method: "GET",
      path: "/posts?sort=new",
    });

    expect(result.ok).toBe(true);
    expect(seenAuthHeader).toBe("Bearer moltbook_from_file");
  });

  it("supports unauthenticated requests when requireAuth is false", async () => {
    let seenAuthHeader = "";

    const service = new MoltbookService(mockRuntime, makeConfig(), {
      fetchImpl: async (_url, init) => {
        const headers = new Headers(init?.headers);
        seenAuthHeader = headers.get("Authorization") || "";
        return jsonResponse(200, { success: true });
      },
    });

    const result = await service.request({
      method: "POST",
      path: "/agents/register",
      body: { name: "NoAuth", description: "desc" },
      requireAuth: false,
    });

    expect(result.ok).toBe(true);
    expect(seenAuthHeader).toBe("");
  });

  it("rejects full URL path input", async () => {
    const service = new MoltbookService(
      mockRuntime,
      makeConfig({ apiKey: "moltbook_token" }),
      {
        fetchImpl: async () => jsonResponse(200, { success: true }),
      },
    );

    await expect(
      service.request({
        method: "GET",
        path: "https://evil.example/api/v1/posts",
      }),
    ).rejects.toThrow("Full URLs are not allowed");
  });

  it("fails authenticated requests when no API key is available", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "moltbook-no-key-"));
    const credentialsPath = path.join(tmpDir, "credentials.json");

    const service = new MoltbookService(
      mockRuntime,
      makeConfig({ credentialsPath }),
      {
        fetchImpl: async () => jsonResponse(200, { success: true }),
      },
    );

    await expect(
      service.request({
        method: "GET",
        path: "/agents/me",
      }),
    ).rejects.toThrow("Moltbook API key is required");
  });
});
