import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installPluginAction } from "../../actions/install-plugin";

const ensurePluginManagerAllowedMock = vi.fn(() => "already-enabled");

vi.mock("../../runtime/plugin-manager-guard", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../runtime/plugin-manager-guard")>();

  return {
    ...actual,
    ensurePluginManagerAllowed: (...args: unknown[]) =>
      ensurePluginManagerAllowedMock(...args),
  };
});

function mockJsonResponse(response: {
  ok: boolean;
  status: number;
  body: unknown;
  jsonThrows?: boolean;
}): Response {
  return {
    ok: response.ok,
    status: response.status,
    json: response.jsonThrows
      ? vi.fn(async () => {
          throw new Error("invalid json");
        })
      : vi.fn(async () => response.body),
  } as Partial<Response> as Response;
}

describe("installPluginAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ensurePluginManagerAllowedMock.mockReturnValue("already-enabled");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires a plugin ID", async () => {
    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("I need a plugin ID to install");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("prefixes short plugin IDs with @elizaos/plugin-", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        ok: true,
        status: 200,
        body: { ok: true },
      }),
    );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "telegram" } },
    );

    expect(result.success).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://localhost:2138/api/plugins/install",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "@elizaos/plugin-telegram",
          autoRestart: true,
        }),
      }),
    );
  });

  it("returns API error message when response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        ok: false,
        status: 500,
        body: { error: "failed to install" },
      }),
    );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "discord" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain(
      "Failed to install discord: failed to install",
    );
  });

  it("falls back to HTTP status when error body is not parseable", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        ok: false,
        status: 502,
        body: null,
        jsonThrows: true,
      }),
    );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "discord" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toBe(
      "Failed to install discord: Invalid install response",
    );
  });

  it("returns a failure message when install service reports ok:false", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        ok: true,
        status: 200,
        body: { ok: false, error: "service rejected plugin" },
      }),
    );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "@elizaos/plugin-telegram" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain(
      "Failed to install @elizaos/plugin-telegram: service rejected plugin",
    );
  });

  it("uses plugin service response message when provided", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        ok: true,
        status: 200,
        body: {
          ok: true,
          message: "plugin-telegram installed and restart scheduled",
        },
      }),
    );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "@elizaos/plugin-telegram" } },
    );

    expect(result.success).toBe(true);
    expect(result.text).toBe("plugin-telegram installed and restart scheduled");
  });

  it("restarts first when plugin-manager was just auto-enabled", async () => {
    ensurePluginManagerAllowedMock.mockReturnValue("enabled");
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          status: 200,
          body: { ok: true },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          status: 200,
          body: { ok: true },
        }),
      );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "telegram" } },
    );

    expect(result.success).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      1,
      "http://localhost:2138/api/agent/restart",
      expect.objectContaining({ method: "POST" }),
    );
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      2,
      "http://localhost:2138/api/plugins/install",
      expect.objectContaining({
        body: JSON.stringify({
          name: "@elizaos/plugin-telegram",
          autoRestart: true,
        }),
      }),
    );
  });

  it("retries after plugin-manager service missing by restarting the agent", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: false,
          status: 503,
          body: { error: "Plugin manager service not found" },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          status: 200,
          body: { ok: true },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          status: 200,
          body: { ok: true, message: "installed after restart" },
        }),
      );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "telegram" } },
    );

    expect(result.success).toBe(true);
    expect(result.text).toBe("installed after restart");
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      2,
      "http://localhost:2138/api/agent/restart",
      expect.objectContaining({ method: "POST" }),
    );
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      3,
      "http://localhost:2138/api/plugins/install",
      expect.objectContaining({
        body: JSON.stringify({
          name: "@elizaos/plugin-telegram",
          autoRestart: true,
        }),
      }),
    );
  });

  it("does not restart twice when plugin-manager was already auto-enabled", async () => {
    ensurePluginManagerAllowedMock.mockReturnValue("enabled");
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          status: 200,
          body: { ok: true },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: false,
          status: 503,
          body: { error: "Plugin manager service not found" },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          status: 200,
          body: { ok: true, message: "installed after existing restart" },
        }),
      );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "telegram" } },
    );

    expect(result.success).toBe(true);
    expect(result.text).toBe("installed after existing restart");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      1,
      "http://localhost:2138/api/agent/restart",
      expect.objectContaining({ method: "POST" }),
    );
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      2,
      "http://localhost:2138/api/plugins/install",
      expect.objectContaining({
        body: JSON.stringify({
          name: "@elizaos/plugin-telegram",
          autoRestart: true,
        }),
      }),
    );
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      3,
      "http://localhost:2138/api/plugins/install",
      expect.objectContaining({
        body: JSON.stringify({
          name: "@elizaos/plugin-telegram",
          autoRestart: true,
        }),
      }),
    );
  });

  it("fails fast when env disables plugin-manager auto-enable", async () => {
    ensurePluginManagerAllowedMock.mockReturnValue("disabled-by-env");

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "telegram" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toBe(
      "Failed to install telegram: plugin-manager auto-enable is disabled by MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE=1",
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
