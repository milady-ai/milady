import { describe, expect, it } from "bun:test";
import type { IAgentRuntime, Memory } from "@elizaos/core";
import {
  extractOnboardInput,
  moltbookOnboardAction,
} from "../actions/onboard.ts";
import { extractApiRequestInput } from "../actions/request.ts";

function makeMemory(text: string): Memory {
  return {
    id: "memory-id",
    content: {
      text,
      source: "test",
    },
  } as unknown as Memory;
}

describe("plugin-moltbook action helpers", () => {
  it("extractOnboardInput uses options when provided", () => {
    const runtime = {
      character: {
        name: "FallbackName",
        bio: "Fallback description",
      },
    } as unknown as IAgentRuntime;

    const input = extractOnboardInput(runtime, {
      name: "CustomName",
      description: "Custom description",
      saveCredentials: false,
    });

    expect(input).toEqual({
      name: "CustomName",
      description: "Custom description",
      metadata: undefined,
      saveCredentials: false,
      credentialsPath: undefined,
    });
  });

  it("extractOnboardInput falls back to runtime character fields", () => {
    const runtime = {
      character: {
        name: "RuntimeName",
        bio: ["Runtime bio line 1", "Runtime bio line 2"],
      },
    } as unknown as IAgentRuntime;

    const input = extractOnboardInput(runtime, {});

    expect(input.name).toBe("RuntimeName");
    expect(input.description).toBe("Runtime bio line 1");
  });

  it("extractApiRequestInput prefers explicit options", () => {
    const input = extractApiRequestInput(makeMemory("ignored"), {
      method: "PATCH",
      path: "/agents/me",
      body: { description: "Updated" },
      requireAuth: true,
    });

    expect(input).toEqual({
      method: "PATCH",
      path: "/agents/me",
      query: undefined,
      body: { description: "Updated" },
      requireAuth: true,
    });
  });

  it("extractApiRequestInput parses moltbook command from message text", () => {
    const input = extractApiRequestInput(
      makeMemory("moltbook GET /posts?sort=hot&limit=5"),
      {},
    );

    expect(input).toEqual({
      method: "GET",
      path: "/posts?sort=hot&limit=5",
      query: undefined,
      body: undefined,
      requireAuth: undefined,
    });
  });

  it("extractApiRequestInput returns null for unrelated text", () => {
    const input = extractApiRequestInput(makeMemory("hello world"), {});
    expect(input).toBeNull();
  });

  it("MOLTBOOK_ONBOARD action data does not expose raw api keys", async () => {
    const runtime = {
      getService: () => ({
        onboardAgent: async () => ({
          success: true,
          agentName: "MiladyAgent",
          apiKey: "moltbook_secret_key_123",
          claimUrl: "https://www.moltbook.com/claim/abc",
          verificationCode: "reef-X4B2",
          credentialsSavedPath: "/tmp/moltbook/credentials.json",
          raw: { success: true },
        }),
      }),
      character: {
        name: "MiladyAgent",
        bio: "Test bio",
      },
    } as unknown as IAgentRuntime;

    const result = await moltbookOnboardAction.handler?.(
      runtime,
      makeMemory("register"),
      undefined,
      {},
    );

    expect(result?.success).toBe(true);
    expect(result?.data).toMatchObject({
      hasApiKey: true,
      agentName: "MiladyAgent",
    });
    expect((result?.data as Record<string, unknown>).apiKey).toBeUndefined();
  });
});
