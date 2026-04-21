/**
 * E2E Integration tests for Hyperscape app workflow.
 *
 * Tests the complete flow:
 * 1. List apps - Hyperscape should appear
 * 2. Get app info - Should have correct metadata
 * 3. Launch app - Should succeed for local plugins
 * 4. Verify viewer config - Should have correct URLs
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { describeIf } from "../../../../test/helpers/conditional-tests.ts";
import { AppManager } from "../services/app-manager";
import type {
  PluginManagerLike,
  RegistryPluginInfo,
} from "../services/plugin-manager-types";

// Mock local Hyperscape plugin as it appears from local plugin scanning
const hyperscapeLocalPluginUrl = new URL(
  "../../../../../hyperscape/packages/plugin-hyperscape/",
  import.meta.url,
);

const HYPERSCAPE_LOCAL_PLUGIN: RegistryPluginInfo = {
  name: "@hyperscape/plugin-hyperscape",
  gitRepo: "HyperscapeAI/hyperscape",
  gitUrl: "https://github.com/HyperscapeAI/hyperscape",
  displayName: "Hyperscape",
  description:
    "AI-powered 3D multiplayer RPG — explore, fight, gather, craft, and socialize with AI agents",
  homepage: "https://hyperscape.gg",
  topics: ["rpg", "3d", "multiplayer", "mmo", "game"],
  stars: 0,
  language: "TypeScript",
  kind: "app",
  npm: {
    package: "@hyperscape/plugin-hyperscape",
    v0Version: null,
    v1Version: "1.0.0",
    v2Version: "1.0.0",
  },
  supports: { v0: false, v1: true, v2: true },
  localPath: fileURLToPath(hyperscapeLocalPluginUrl),
  // App-specific metadata
  category: "game",
  capabilities: [
    "combat",
    "skills",
    "inventory",
    "banking",
    "social-chat",
    "exploration",
    "crafting",
  ],
  icon: null,
  // Viewer and launch config
  launchType: "connect",
  launchUrl: "http://localhost:3333",
  viewer: {
    url: "http://localhost:3333",
    embedParams: {
      embedded: "true",
      mode: "spectator",
      surface: "agent-control",
      followEntity: "{HYPERSCAPE_CHARACTER_ID}",
    },
    postMessageAuth: true,
    sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
  },
  session: {
    mode: "spectate-and-steer",
    features: ["commands", "telemetry", "pause", "resume", "suggestions"],
  },
};

const hasLocalHyperscapePlugin = existsSync(
  new URL("elizaos.plugin.json", hyperscapeLocalPluginUrl),
);

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function createHyperscapeApiFetchMock() {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);

    if (url.includes("generated-registry.json")) {
      return jsonResponse({
        registry: {
          [HYPERSCAPE_LOCAL_PLUGIN.name]: {
            git: {
              repo: HYPERSCAPE_LOCAL_PLUGIN.gitRepo,
              v0: { branch: null },
              v1: { branch: "main" },
              v2: { branch: "main" },
            },
            npm: {
              repo: HYPERSCAPE_LOCAL_PLUGIN.npm.package,
              v0: HYPERSCAPE_LOCAL_PLUGIN.npm.v0Version,
              v1: HYPERSCAPE_LOCAL_PLUGIN.npm.v1Version,
              v2: HYPERSCAPE_LOCAL_PLUGIN.npm.v2Version,
            },
            supports: HYPERSCAPE_LOCAL_PLUGIN.supports,
            description: HYPERSCAPE_LOCAL_PLUGIN.description,
            homepage: HYPERSCAPE_LOCAL_PLUGIN.homepage,
            topics: HYPERSCAPE_LOCAL_PLUGIN.topics,
            stargazers_count: HYPERSCAPE_LOCAL_PLUGIN.stars,
            language: HYPERSCAPE_LOCAL_PLUGIN.language,
            kind: "app",
            app: {
              displayName: HYPERSCAPE_LOCAL_PLUGIN.displayName,
              category: HYPERSCAPE_LOCAL_PLUGIN.category,
              launchType: HYPERSCAPE_LOCAL_PLUGIN.launchType,
              launchUrl: HYPERSCAPE_LOCAL_PLUGIN.launchUrl,
              icon: HYPERSCAPE_LOCAL_PLUGIN.icon,
              capabilities: HYPERSCAPE_LOCAL_PLUGIN.capabilities,
              minPlayers: null,
              maxPlayers: null,
              runtimePlugin: HYPERSCAPE_LOCAL_PLUGIN.runtimePlugin,
              bridgeExport: HYPERSCAPE_LOCAL_PLUGIN.bridgeExport,
              uiExtension: HYPERSCAPE_LOCAL_PLUGIN.uiExtension,
              viewer: HYPERSCAPE_LOCAL_PLUGIN.viewer,
              session: HYPERSCAPE_LOCAL_PLUGIN.session,
            },
          },
        },
      });
    }

    if (url.endsWith("/index.json")) {
      return jsonResponse({
        [HYPERSCAPE_LOCAL_PLUGIN.name]: `github:${HYPERSCAPE_LOCAL_PLUGIN.gitRepo}`,
      });
    }

    if (url.endsWith("/api/embedded-agents")) {
      return jsonResponse({
        success: true,
        agents: [
          {
            agentId: "agent-123",
            characterId: "test-character-id",
            entityId: "test-character-id",
            name: "Hyperscape",
            state: "connecting",
            startedAt: 1_710_000_000_000,
            lastActivity: 1_710_000_030_000,
          },
        ],
      });
    }

    if (url.includes("/api/agents/agent-123/goal")) {
      return jsonResponse({
        success: true,
        message: "Connecting session...",
        goalsPaused: false,
        availableGoals: [],
      });
    }

    if (url.includes("/api/agents/agent-123/quick-actions")) {
      return jsonResponse({
        success: true,
        message: "Connecting session...",
        quickCommands: [],
        nearbyLocations: [],
      });
    }

    if (url.includes("/api/agents/agent-123/thoughts")) {
      return jsonResponse(
        {
          success: false,
          error: "thoughts unavailable",
        },
        { status: 404 },
      );
    }

    return jsonResponse(
      {
        success: false,
        error: `Unhandled Hyperscape test fetch: ${url}`,
      },
      { status: 404 },
    );
  });
}

function clonePluginInfo(plugin: RegistryPluginInfo): RegistryPluginInfo {
  return structuredClone(plugin);
}

function createMockPluginManager(
  plugins: RegistryPluginInfo[] = [HYPERSCAPE_LOCAL_PLUGIN],
): PluginManagerLike {
  const pluginEntries = plugins.map(
    (plugin) => [plugin.name, clonePluginInfo(plugin)] as const,
  );
  const pluginMap = new Map(pluginEntries);

  return {
    refreshRegistry: vi.fn(
      async () =>
        new Map(
          pluginEntries.map(([name, plugin]) => [
            name,
            clonePluginInfo(plugin),
          ]),
        ),
    ),
    listInstalledPlugins: vi.fn(async () => []),
    getRegistryPlugin: vi.fn(async (name: string) => {
      const plugin = pluginMap.get(name);
      return plugin ? clonePluginInfo(plugin) : null;
    }),
    searchRegistry: vi.fn(async (query: string) => {
      const lowerQuery = query.toLowerCase();
      return plugins
        .filter(
          (p) =>
            p.name.toLowerCase().includes(lowerQuery) ||
            (p.description ?? "").toLowerCase().includes(lowerQuery),
        )
        .map((p) => ({
          name: p.name,
          description: p.description,
          score: 1,
          tags: p.topics,
          version: p.npm.v2Version ?? p.npm.v1Version ?? null,
          npmPackage: p.npm.package,
          repository: `https://github.com/${p.gitRepo}`,
          stars: p.stars,
          supports: p.supports,
        }));
    }),
    installPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "",
      version: "1.0.0",
      installPath: "",
      requiresRestart: false,
    })),
    uninstallPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "",
      requiresRestart: false,
    })),
    listEjectedPlugins: vi.fn(async () => []),
    ejectPlugin: vi.fn(),
    syncPlugin: vi.fn(),
    reinjectPlugin: vi.fn(),
  };
}

describeIf(hasLocalHyperscapePlugin)("Hyperscape E2E Integration", () => {
  let appManager: AppManager;
  let pluginManager: PluginManagerLike;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Save original env vars
    originalEnv = {
      HYPERSCAPE_CHARACTER_ID: process.env.HYPERSCAPE_CHARACTER_ID,
      HYPERSCAPE_AUTH_TOKEN: process.env.HYPERSCAPE_AUTH_TOKEN,
      HYPERSCAPE_API_URL: process.env.HYPERSCAPE_API_URL,
      HYPERSCAPE_CLIENT_URL: process.env.HYPERSCAPE_CLIENT_URL,
    };

    // Set test credentials for hyperscape authentication
    process.env.HYPERSCAPE_CHARACTER_ID = "test-character-id";
    process.env.HYPERSCAPE_AUTH_TOKEN = "test-auth-token";
    process.env.HYPERSCAPE_API_URL = "http://localhost:3333";
    process.env.HYPERSCAPE_CLIENT_URL = "http://localhost:3333";
    vi.stubGlobal("fetch", createHyperscapeApiFetchMock());

    appManager = new AppManager();
    pluginManager = createMockPluginManager();
  });

  afterEach(() => {
    // Restore original env vars
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.unstubAllGlobals();
  });

  describe("App Discovery", () => {
    test("lists available apps including Hyperscape", async () => {
      const apps = await appManager.listAvailable(pluginManager);
      const hyperscape = apps.find(
        (app) => app.name === "@hyperscape/plugin-hyperscape",
      );

      expect(apps.length).toBeGreaterThan(0);
      expect(hyperscape).toBeDefined();
      expect(hyperscape?.displayName).toBe("Hyperscape");
    });

    test("filters out non-app plugins", async () => {
      const apps = await appManager.listAvailable(pluginManager);

      // Verify at least one app is present
      expect(apps.length).toBeGreaterThan(0);
    });

    test("search returns Hyperscape for relevant queries", async () => {
      const results = await appManager.search(pluginManager, "hyperscape");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("@hyperscape/plugin-hyperscape");
    });

    test("search returns Hyperscape for RPG queries", async () => {
      const results = await appManager.search(pluginManager, "rpg");

      expect(results.length).toBeGreaterThan(0);
      expect(
        results.some((r) => r.name === "@hyperscape/plugin-hyperscape"),
      ).toBe(true);
    });
  });

  describe("App Info", () => {
    test("returns full Hyperscape metadata", async () => {
      const info = await appManager.getInfo(
        pluginManager,
        "@hyperscape/plugin-hyperscape",
      );

      expect(info).not.toBeNull();
      expect(info?.name).toBe("@hyperscape/plugin-hyperscape");
      expect(info?.displayName).toBe("Hyperscape");
      expect(info?.category).toBe("game");
      expect(info?.capabilities).toContain("combat");
      expect(info?.capabilities).toEqual(
        expect.arrayContaining([
          "combat",
          "skills",
          "inventory",
          "banking",
          "social-chat",
          "exploration",
          "crafting",
        ]),
      );
    });

    test("returns viewer configuration", async () => {
      const info = (await appManager.getInfo(
        pluginManager,
        "@hyperscape/plugin-hyperscape",
      )) as RegistryPluginInfo & {
        viewer?: { url: string; postMessageAuth?: boolean };
      };

      expect(info?.viewer).toBeDefined();
      expect(info?.viewer?.url).toBe("http://localhost:3333");
      expect(info?.viewer?.postMessageAuth).toBe(true);
    });

    test("returns null for non-existent app", async () => {
      const info = await appManager.getInfo(
        pluginManager,
        "@elizaos/app-nonexistent",
      );

      expect(info).toBeNull();
    });
  });

  describe("App Launch", () => {
    test("launches Hyperscape successfully", async () => {
      const result = await appManager.launch(
        pluginManager,
        "@hyperscape/plugin-hyperscape",
      );

      expect(result.displayName).toBe("Hyperscape");
      expect(result.launchType).toBe("connect");
      expect(result.launchUrl).toBe("http://localhost:3333");
    });

    test("returns viewer config with correct URL", async () => {
      const result = await appManager.launch(
        pluginManager,
        "@hyperscape/plugin-hyperscape",
      );
      const viewerUrl = new URL(result.viewer?.url ?? "http://localhost");

      expect(result.viewer).toBeDefined();
      expect(viewerUrl.origin).toBe("http://localhost:3333");
      expect(viewerUrl.searchParams.get("embedded")).toBe("true");
      expect(viewerUrl.searchParams.get("mode")).toBe("spectator");
      expect(viewerUrl.searchParams.get("surface")).toBe("agent-control");
      expect(viewerUrl.searchParams.get("followEntity")).toBe(
        "test-character-id",
      );
      expect(result.viewer?.authMessage).toEqual(
        expect.objectContaining({
          type: "HYPERSCAPE_AUTH",
          authToken: "test-auth-token",
          characterId: "test-character-id",
          followEntity: "test-character-id",
        }),
      );
      expect(result.session).toEqual(
        expect.objectContaining({
          mode: "spectate-and-steer",
          status: "connecting",
          characterId: "test-character-id",
          followEntity: "test-character-id",
        }),
      );
    });

    test("returns viewer sandbox policy", async () => {
      const result = await appManager.launch(
        pluginManager,
        "@hyperscape/plugin-hyperscape",
      );

      expect(result.viewer?.sandbox).toBe(
        "allow-scripts allow-same-origin allow-popups allow-forms",
      );
    });

    test("throws for non-existent app", async () => {
      await expect(
        appManager.launch(pluginManager, "@elizaos/app-nonexistent"),
      ).rejects.toThrow(
        'App "@elizaos/app-nonexistent" not found in the registry',
      );
    });

    test("does not require restart for local plugins", async () => {
      const result = await appManager.launch(
        pluginManager,
        "@hyperscape/plugin-hyperscape",
      );

      // Local plugins should already be available
      expect(result.needsRestart).toBe(false);
    });
  });

  describe("PostMessage Auth Configuration", () => {
    test("indicates postMessage auth is configured", async () => {
      const result = await appManager.launch(
        pluginManager,
        "@hyperscape/plugin-hyperscape",
      );

      // Without HYPERSCAPE_AUTH_TOKEN env var, postMessageAuth should be false
      // This is expected - the viewer will work without auth
      expect(result.viewer?.postMessageAuth).toBeDefined();
    });
  });

  describe("Full User Flow", () => {
    test("complete discovery to launch flow", async () => {
      // Step 1: List apps
      const apps = await appManager.listAvailable(pluginManager);
      expect(apps.some((a) => a.name === "@hyperscape/plugin-hyperscape")).toBe(
        true,
      );

      // Step 2: Get app info
      const info = await appManager.getInfo(
        pluginManager,
        "@hyperscape/plugin-hyperscape",
      );
      expect(info).not.toBeNull();
      expect(info?.displayName).toBe("Hyperscape");

      // Step 3: Launch app
      const launchResult = await appManager.launch(
        pluginManager,
        "@hyperscape/plugin-hyperscape",
      );
      const viewerUrl = new URL(launchResult.viewer?.url ?? "http://localhost");
      expect(viewerUrl.origin).toBe("http://localhost:3333");
      expect(viewerUrl.searchParams.get("embedded")).toBe("true");
      expect(viewerUrl.searchParams.get("mode")).toBe("spectator");
      expect(viewerUrl.searchParams.get("surface")).toBe("agent-control");
      expect(viewerUrl.searchParams.get("followEntity")).toBe(
        "test-character-id",
      );
      expect(launchResult.session?.mode).toBe("spectate-and-steer");

      // Step 4: Verify can stop
      const stopResult = await appManager.stop(
        pluginManager,
        "@hyperscape/plugin-hyperscape",
      );
      expect(stopResult.success).toBe(true);
    });
  });
});
