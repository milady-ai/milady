import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MiladyClient, ApiError } from "../api/client";

describe("QA: Plugins, Skills & MCP", () => {
  let client: MiladyClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    client = new MiladyClient("http://localhost:3000", "test-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Plugin management ---

  it("BTN-ADV001: getPlugins returns installed plugin list", async () => {
    const plugins = [
      { id: "plugin-telegram", name: "Telegram", version: "1.2.0", enabled: true },
      { id: "plugin-discord", name: "Discord", version: "0.9.1", enabled: false },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ plugins }),
    });

    const result = await client.getPlugins();

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain("/api/plugins");
    expect(result.plugins).toHaveLength(2);
    expect(result.plugins[0].id).toBe("plugin-telegram");
    expect(result.plugins[1].enabled).toBe(false);
  });

  it("BTN-ADV002: toggleCorePlugin sends toggle request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, restarting: false, message: "Plugin disabled" }),
    });

    const result = await client.toggleCorePlugin("plugin-telegram", false);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/plugins/core/toggle");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.npmName).toBe("plugin-telegram");
    expect(body.enabled).toBe(false);
    expect(result.ok).toBe(true);
  });

  it("BTN-ADV003: installRegistryPlugin installs from registry", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        ok: true,
        pluginName: "@milady/plugin-web3",
        version: "2.0.0",
      }),
    });

    const result = await client.installRegistryPlugin("@milady/plugin-web3");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/plugins/install");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.name).toBe("@milady/plugin-web3");
    expect(result.ok).toBe(true);
  });

  // --- Skills marketplace ---

  it("BTN-ADV004: searchSkillsMarketplace returns results", async () => {
    const results = [
      { id: "skill-summarize", name: "Summarize", rating: 4.8 },
      { id: "skill-translate", name: "Translate", rating: 4.5 },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results }),
    });

    const result = await client.searchSkillsMarketplace("translate", false, 10);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/skills/marketplace/search");
    expect(url).toContain("q=translate");
    expect(result.results).toHaveLength(2);
  });

  it("BTN-ADV005: installMarketplaceSkill installs skill", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({}),
    });

    await client.installMarketplaceSkill({ slug: "skill-summarize", source: "marketplace" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/skills/marketplace/install");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.slug).toBe("skill-summarize");
    expect(body.source).toBe("marketplace");
  });

  // --- MCP config ---

  it("BTN-ADV010: getMcpConfig returns server map", async () => {
    const servers = {
      "Local Filesystem": { transport: "stdio", command: "fs-server" },
      "Web Search": { transport: "sse", url: "http://localhost:8080" },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ servers }),
    });

    const result = await client.getMcpConfig();

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain("/api/mcp/config");
    expect(result.servers["Local Filesystem"].transport).toBe("stdio");
    expect(result.servers["Web Search"].transport).toBe("sse");
  });

  it("BTN-ADV010: addMcpServer adds server", async () => {
    const serverConfig = {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({}),
    });

    await client.addMcpServer("Custom MCP", serverConfig);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/mcp/servers");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.name).toBe("Custom MCP");
    expect(body.config).toBeDefined();
  });

  it("BTN-ADV010: removeMcpServer removes server", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await client.removeMcpServer("mcp-2");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/mcp/servers/mcp-2");
    expect(options.method).toBe("DELETE");
  });

  // --- E2E-style integration ---

  it("E2E-PL001: install + verify plugin appears in list", async () => {
    // Step 1: Install plugin
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        ok: true,
        pluginName: "@milady/plugin-analytics",
      }),
    });

    const installResult = await client.installRegistryPlugin(
      "@milady/plugin-analytics",
    );
    expect(installResult.ok).toBe(true);

    // Step 2: Verify it appears in the plugin list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        plugins: [
          { id: "plugin-analytics", name: "Analytics", enabled: true },
        ],
      }),
    });

    const listResult = await client.getPlugins();
    const found = listResult.plugins.find(
      (p: { id: string }) => p.id === "plugin-analytics",
    );
    expect(found).toBeDefined();
    expect(found.name).toBe("Analytics");
  });

  it("E2E-PL002: uninstall removes plugin from list", async () => {
    // Step 1: List plugins — plugin exists
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        plugins: [
          { id: "plugin-analytics", name: "Analytics", enabled: true },
        ],
      }),
    });

    const beforeList = await client.getPlugins();
    expect(beforeList.plugins).toHaveLength(1);

    // Step 2: Uninstall
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, pluginName: "plugin-analytics", message: "Uninstalled" }),
    });

    await client.uninstallRegistryPlugin("plugin-analytics");

    // Step 3: Verify gone
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ plugins: [] }),
    });

    const afterList = await client.getPlugins();
    expect(afterList.plugins).toHaveLength(0);
  });

  // --- Error handling ---

  it("Error: installRegistryPlugin with invalid package returns 400", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid package name" }),
    });

    await expect(
      client.installRegistryPlugin("not-a-valid-package!!!"),
    ).rejects.toThrow(ApiError);
  });
});
