/**
 * Managed Discord OAuth Flow Tests
 *
 * Verifies that the managed OAuth helpers for cloud Discord connections
 * send correct payloads, parse callback URLs properly, handle errors,
 * and use proper URL encoding.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeManagedDiscordCallbackUrl,
  type ManagedDiscordCallbackState,
} from "../../components/pages/cloud-dashboard-utils";

// ---------------------------------------------------------------------------
// 1. OAuth callback URL parsing
// ---------------------------------------------------------------------------

describe("managed Discord OAuth callback URL parsing", () => {
  it("extracts all fields from a complete success callback", () => {
    const { callback, cleanedUrl } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/dashboard/settings?tab=agents&discord=connected&managed=1&agentId=agent-1&guildId=guild-1&guildName=Milady%20HQ&restarted=1",
    );

    expect(callback).toEqual<ManagedDiscordCallbackState>({
      status: "connected",
      managed: true,
      agentId: "agent-1",
      guildId: "guild-1",
      guildName: "Milady HQ",
      message: null,
      restarted: true,
    });
    // Transient params should be stripped; non-transient params preserved
    expect(cleanedUrl).toBe(
      "http://localhost:4173/dashboard/settings?tab=agents",
    );
  });

  it("extracts error callback state", () => {
    const { callback, cleanedUrl } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/dashboard/settings?tab=agents&discord=error&managed=1&message=Bot%20token%20invalid",
    );

    expect(callback).not.toBeNull();
    expect(callback!.status).toBe("error");
    expect(callback!.managed).toBe(true);
    expect(callback!.message).toBe("Bot token invalid");
    expect(callback!.agentId).toBeNull();
    expect(callback!.guildId).toBeNull();
    expect(callback!.guildName).toBeNull();
    expect(callback!.restarted).toBe(false);
  });

  it("returns null for non-managed discord callback (managed=0)", () => {
    const { callback } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/dashboard/settings?discord=connected&managed=0",
    );
    // managed must be "1" for a managed callback
    expect(callback).toBeNull();
  });

  it("returns null when discord param is missing", () => {
    const { callback } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/dashboard/settings?managed=1&agentId=agent-1",
    );
    expect(callback).toBeNull();
  });

  it("returns null when discord param has unexpected value", () => {
    const { callback } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/dashboard/settings?discord=pending&managed=1",
    );
    // Only "connected" and "error" are valid status values
    expect(callback).toBeNull();
  });

  it("returns null for completely unrelated URL", () => {
    const { callback, cleanedUrl } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/dashboard/settings?tab=agents",
    );
    expect(callback).toBeNull();
    expect(cleanedUrl).toBeNull();
  });

  it("handles missing optional params gracefully", () => {
    // Minimal valid callback: only discord + managed
    const { callback } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/settings?discord=connected&managed=1",
    );

    expect(callback).not.toBeNull();
    expect(callback!.status).toBe("connected");
    expect(callback!.agentId).toBeNull();
    expect(callback!.guildId).toBeNull();
    expect(callback!.guildName).toBeNull();
    expect(callback!.message).toBeNull();
    expect(callback!.restarted).toBe(false);
  });

  it("handles invalid URL gracefully", () => {
    const { callback, cleanedUrl } =
      consumeManagedDiscordCallbackUrl("not-a-url");
    expect(callback).toBeNull();
    expect(cleanedUrl).toBeNull();
  });

  it("handles empty string gracefully", () => {
    const { callback, cleanedUrl } = consumeManagedDiscordCallbackUrl("");
    expect(callback).toBeNull();
    expect(cleanedUrl).toBeNull();
  });

  it("preserves non-discord query params in cleaned URL", () => {
    const { cleanedUrl } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/settings?tab=agents&foo=bar&discord=connected&managed=1&agentId=a1",
    );
    expect(cleanedUrl).toContain("tab=agents");
    expect(cleanedUrl).toContain("foo=bar");
    expect(cleanedUrl).not.toContain("discord=");
    expect(cleanedUrl).not.toContain("managed=");
    expect(cleanedUrl).not.toContain("agentId=");
  });

  it("handles URL-encoded special characters in agent ID", () => {
    const { callback } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/settings?discord=connected&managed=1&agentId=agent%2Fwith%20spaces",
    );
    expect(callback).not.toBeNull();
    expect(callback!.agentId).toBe("agent/with spaces");
  });

  it("handles URL-encoded guild name", () => {
    const { callback } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/settings?discord=connected&managed=1&guildName=%E3%83%9F%E3%83%A9%E3%83%87%E3%82%A3",
    );
    expect(callback).not.toBeNull();
    // Japanese characters for "Miradi" (ミラディ)
    expect(callback!.guildName).toBe("ミラディ");
  });

  it("restarted defaults to false when param is absent", () => {
    const { callback } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/settings?discord=connected&managed=1",
    );
    expect(callback!.restarted).toBe(false);
  });

  it("restarted is false for non-'1' values", () => {
    const { callback } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/settings?discord=connected&managed=1&restarted=true",
    );
    // Only "1" is truthy, not "true"
    expect(callback!.restarted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. OAuth init payload verification (via MiladyClient mock)
// ---------------------------------------------------------------------------

describe("managed Discord OAuth init", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              authorizeUrl: "https://discord.com/oauth",
              applicationId: "app-1",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends correct POST body with returnUrl and botNickname", async () => {
    // Dynamically import to pick up the mocked fetch
    const { MiladyClient } = await import("../../api/client");
    const client = new MiladyClient("http://localhost:2138", "token");

    await client.createCloudCompatAgentManagedDiscordOauth("agent-1", {
      returnUrl: "/dashboard/settings?tab=agents",
      botNickname: "Chen",
    });

    const [, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    expect(init?.method).toBe("POST");

    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({
      returnUrl: "/dashboard/settings?tab=agents",
      botNickname: "Chen",
    });
  });

  it("sends empty object body when no options provided", async () => {
    const { MiladyClient } = await import("../../api/client");
    const client = new MiladyClient("http://localhost:2138", "token");

    await client.createCloudCompatAgentManagedDiscordOauth("agent-1");

    const [, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({});
  });

  it("URL-encodes agent IDs with special characters", async () => {
    const { MiladyClient } = await import("../../api/client");
    const client = new MiladyClient("http://localhost:2138", "token");

    await client.createCloudCompatAgentManagedDiscordOauth("agent/with spaces");

    const [url] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(String(url)).toContain("agent%2Fwith%20spaces");
  });
});

// ---------------------------------------------------------------------------
// 3. Disconnect sends DELETE
// ---------------------------------------------------------------------------

describe("managed Discord disconnect", () => {
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

  it("sends DELETE to the correct endpoint", async () => {
    const { MiladyClient } = await import("../../api/client");
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

  it("URL-encodes agent ID with special chars in DELETE", async () => {
    const { MiladyClient } = await import("../../api/client");
    const client = new MiladyClient("http://localhost:2138", "token");

    await client.disconnectCloudCompatAgentManagedDiscord("my agent/test");

    const [url] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(String(url)).toContain("my%20agent%2Ftest");
  });
});

// ---------------------------------------------------------------------------
// 4. Status endpoint
// ---------------------------------------------------------------------------

describe("managed Discord status", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { connected: true, botUsername: "MiladyBot#1234" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls GET on the managed discord status endpoint", async () => {
    const { MiladyClient } = await import("../../api/client");
    const client = new MiladyClient("http://localhost:2138", "token");

    await client.getCloudCompatAgentManagedDiscord("agent-1");

    const [url, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    expect(String(url)).toBe(
      "http://localhost:2138/api/cloud/v1/milady/agents/agent-1/discord",
    );
    // GET is the default, so method should be undefined or "GET"
    expect(init?.method).toBeUndefined();
  });

  it("URL-encodes agent ID with slashes and spaces", async () => {
    const { MiladyClient } = await import("../../api/client");
    const client = new MiladyClient("http://localhost:2138", "token");

    await client.getCloudCompatAgentManagedDiscord("agent/with spaces");

    const [url] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(String(url)).toBe(
      "http://localhost:2138/api/cloud/v1/milady/agents/agent%2Fwith%20spaces/discord",
    );
  });
});
