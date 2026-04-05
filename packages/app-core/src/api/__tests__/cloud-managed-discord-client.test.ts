/**
 * Verifies the managed Discord client helpers call the cloud v1 agent routes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MiladyClient } from "../client";

describe("managed cloud Discord client helpers", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls the managed Discord status endpoint for an agent", async () => {
    const client = new MiladyClient("http://localhost:2138", "token");
    await client.getCloudCompatAgentManagedDiscord("agent/with spaces");

    const [url, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    expect(String(url)).toBe(
      "http://localhost:2138/api/cloud/v1/milady/agents/agent%2Fwith%20spaces/discord",
    );
    expect(init?.method).toBeUndefined();
  });

  it("POSTs managed Discord OAuth init requests to the cloud agent route", async () => {
    const client = new MiladyClient("http://localhost:2138", "token");
    await client.createCloudCompatAgentManagedDiscordOauth("agent-1", {
      returnUrl: "/dashboard/settings?tab=agents",
      botNickname: "Chen",
    });

    const [url, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    expect(String(url)).toBe(
      "http://localhost:2138/api/cloud/v1/milady/agents/agent-1/discord/oauth",
    );
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(
      JSON.stringify({
        returnUrl: "/dashboard/settings?tab=agents",
        botNickname: "Chen",
      }),
    );
  });

  it("DELETEs managed Discord connections from the cloud agent route", async () => {
    const client = new MiladyClient("http://localhost:2138", "token");
    await client.disconnectCloudCompatAgentManagedDiscord("agent-1");

    const [url, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    expect(String(url)).toBe(
      "http://localhost:2138/api/cloud/v1/milady/agents/agent-1/discord",
    );
    expect(init?.method).toBe("DELETE");
  });
});
