import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPluginInfo } from "./registry-client-types.js";

const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const mkdirMock = vi.fn();
const unlinkMock = vi.fn();
const fetchFromNetworkMock = vi.fn();
const applyLocalWorkspaceAppsMock = vi.fn();
const applyNodeModulePluginsMock = vi.fn();
const mergeCustomEndpointsMock = vi.fn();
const loadElizaConfigMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: readFileMock,
    writeFile: writeFileMock,
    mkdir: mkdirMock,
    unlink: unlinkMock,
  },
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../config/config.js", () => ({
  loadElizaConfig: loadElizaConfigMock,
  saveElizaConfig: vi.fn(),
}));

vi.mock("./registry-client-network.js", () => ({
  fetchFromNetwork: fetchFromNetworkMock,
}));

vi.mock("./registry-client-local.js", () => ({
  applyLocalWorkspaceApps: applyLocalWorkspaceAppsMock,
  applyNodeModulePlugins: applyNodeModulePluginsMock,
}));

vi.mock("./registry-client-endpoints.js", () => ({
  mergeCustomEndpoints: mergeCustomEndpointsMock,
  normaliseEndpointUrl: (url: string) => url.replace(/\/+$/, ""),
  parseRegistryEndpointUrl: (url: string) => new URL(url),
  isDefaultEndpoint: (url: string, defaultUrl: string) =>
    url.replace(/\/+$/, "") === defaultUrl.replace(/\/+$/, ""),
}));

function createPluginInfo(
  name: string,
  options: {
    displayName?: string;
    gitRepo?: string;
  } = {},
): RegistryPluginInfo {
  return {
    name,
    gitRepo:
      options.gitRepo ??
      `elizaos-plugins/${name.split("/").at(-1) ?? "plugin"}`,
    gitUrl: `https://github.com/${options.gitRepo ?? `elizaos-plugins/${name.split("/").at(-1) ?? "plugin"}`}.git`,
    description: "",
    homepage: null,
    topics: [],
    stars: 0,
    language: "TypeScript",
    npm: {
      package: name,
      v0Version: null,
      v1Version: null,
      v2Version: "1.0.0",
    },
    git: {
      v0Branch: null,
      v1Branch: null,
      v2Branch: "main",
    },
    supports: {
      v0: false,
      v1: false,
      v2: true,
    },
    kind: "app",
    appMeta: {
      displayName: options.displayName ?? name,
      category: "game",
      launchType: "url",
      launchUrl: null,
      icon: null,
      capabilities: [],
      minPlayers: null,
      maxPlayers: null,
    },
  };
}

describe("registry-client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    delete process.env.MILADY_STATE_DIR;
    delete process.env.ELIZA_STATE_DIR;
    delete process.env.MILADY_NAMESPACE;
    delete process.env.ELIZA_NAMESPACE;

    readFileMock.mockRejectedValue(new Error("ENOENT"));
    writeFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    unlinkMock.mockResolvedValue(undefined);
    fetchFromNetworkMock.mockResolvedValue(new Map());
    applyLocalWorkspaceAppsMock.mockResolvedValue(undefined);
    applyNodeModulePluginsMock.mockResolvedValue(undefined);
    mergeCustomEndpointsMock.mockResolvedValue(undefined);
    loadElizaConfigMock.mockReturnValue({});
  });

  it("stores the registry cache under the Milady state dir", async () => {
    process.env.MILADY_STATE_DIR = "/tmp/milady-state";
    fetchFromNetworkMock.mockResolvedValue(
      new Map([
        [
          "@elizaos/app-2004scape",
          createPluginInfo("@elizaos/app-2004scape", {
            displayName: "2004scape",
          }),
        ],
      ]),
    );

    const { getRegistryPlugins } = await import("./registry-client.js");
    const plugins = await getRegistryPlugins();

    expect(plugins.has("@elizaos/app-2004scape")).toBe(true);
    expect(readFileMock).toHaveBeenCalledWith(
      "/tmp/milady-state/cache/registry.json",
      "utf-8",
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      "/tmp/milady-state/cache/registry.json",
      expect.any(String),
      "utf-8",
    );
  });

  it("filters removed apps from cache, local discovery, and custom endpoint merges", async () => {
    process.env.MILADY_STATE_DIR = "/tmp/milady-state";

    readFileMock.mockResolvedValue(
      JSON.stringify({
        fetchedAt: Date.now(),
        plugins: [
          [
            "@elizaos/app-agent-town",
            createPluginInfo("@elizaos/app-agent-town", {
              displayName: "Agent Town",
              gitRepo: "Agent-Town/agent-town",
            }),
          ],
          [
            "@elizaos/app-2004scape",
            createPluginInfo("@elizaos/app-2004scape", {
              displayName: "2004scape",
            }),
          ],
        ],
      }),
    );

    applyLocalWorkspaceAppsMock.mockImplementation(
      async (plugins: Map<string, RegistryPluginInfo>) => {
        plugins.set(
          "@elizaos/app-dungeons",
          createPluginInfo("@elizaos/app-dungeons", {
            displayName: "Dungeons",
            gitRepo: "lalalune/dungeons",
          }),
        );
        plugins.set(
          "@elizaos/app-babylon",
          createPluginInfo("@elizaos/app-babylon", {
            displayName: "Babylon",
          }),
        );
      },
    );

    mergeCustomEndpointsMock.mockImplementation(
      async (plugins: Map<string, RegistryPluginInfo>) => {
        plugins.set(
          "@elizaos/app-dungeons-and-daemons",
          createPluginInfo("@elizaos/app-dungeons-and-daemons", {
            displayName: "Dungeons and Daemons",
            gitRepo: "lalalune/dungeons-and-daemons",
          }),
        );
      },
    );

    const { getRegistryPlugins } = await import("./registry-client.js");
    const plugins = await getRegistryPlugins();

    expect([...plugins.keys()].sort()).toEqual([
      "@elizaos/app-2004scape",
      "@elizaos/app-babylon",
    ]);

    expect(writeFileMock).toHaveBeenCalledWith(
      "/tmp/milady-state/cache/registry.json",
      expect.any(String),
      "utf-8",
    );
    const cachePayload = JSON.parse(
      writeFileMock.mock.calls[0][1] as string,
    ) as {
      plugins: Array<[string, RegistryPluginInfo]>;
    };
    expect(cachePayload.plugins.map(([name]) => name)).toEqual([
      "@elizaos/app-2004scape",
    ]);
  });
});
