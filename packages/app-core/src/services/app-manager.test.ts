// biome-ignore-all lint/suspicious/noExplicitAny: extensive fake runtime stubs use `as never` for intentionally incomplete shapes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type Action,
  type Character,
  type Evaluator,
  elizaLogger,
  type IAgentRuntime,
  type IMessageService,
  type Memory,
  type Plugin,
  type Provider,
  type Route,
  type RuntimeEventStorage,
  type Service,
  type ServiceClass,
  type ServiceTypeName,
  type State,
} from "@elizaos/core";
import {
  PluginManagerService,
  pluginRegistry,
} from "@elizaos/plugin-plugin-manager";
import { AppManager } from "@miladyai/agent/services/app-manager";
import { importAppPlugin } from "@miladyai/agent/services/app-package-modules";
import * as registryClient from "@miladyai/agent/services/registry-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginManagerLike,
  RegistryPluginInfo,
} from "./plugin-manager-types";

// Fake Runtime implementation
class FakeAgentRuntime implements IAgentRuntime {
  agentId =
    "fake-agent-id" as `${string}-${string}-${string}-${string}-${string}`;
  serverUrl = "http://localhost:3000";
  token = "fake-token";
  character = {} as Character;
  databaseAdapter = {} as never;
  memoryRoots = {} as never;
  cacheManager = {} as never;
  providers: Provider[] = [];
  actions: Action[] = [];
  evaluators: Evaluator[] = [];
  plugins: Plugin[] = [];
  services: Map<ServiceTypeName, Service[]> = new Map();
  initPromise = Promise.resolve();
  enableAutonomy = false;
  messageService = {} as unknown as IMessageService;
  routes: Route[] = [];
  stateCache = new Map<string, State>();
  logLevelOverrides = new Map<string, string>();
  logger = elizaLogger;
  events: RuntimeEventStorage = {};
  private settings = new Map<string, string>();
  private registeredServiceTypes = new Set<string>();

  // IDatabaseAdapter methods (stubbed)
  db = {};
  async registerMemory(_memory: Memory): Promise<void> {}
  async getMemory(_messageId: string): Promise<Memory | null> {
    return null;
  }
  async getMemories() {
    return [];
  }
  async getMemoriesByRoomIds() {
    return [];
  }
  async getMemoryByContent() {
    return null;
  }
  async getMemoriesCount() {
    return 0;
  }
  async createLog() {}
  async getLogs() {
    return [];
  }
  async searchMemories() {
    return [];
  }
  async searchMemoriesByEmbedding() {
    return [];
  }
  async removeMemory() {}
  async removeAllMemories() {}
  async countMemories() {
    return 0;
  }
  async getGoals() {
    return [];
  }

  async getRoom() {
    return null;
  }
  async createRoom() {
    return "fake-room-id" as never;
  }
  async removeRoom() {}
  async getRoomsForParticipant() {
    return [];
  }
  async getRoomsForParticipants() {
    return [];
  }
  async addParticipant() {
    return true;
  }
  async removeParticipant() {
    return true;
  }
  async getParticipantsForRoom() {
    return [];
  }
  async getParticipantsForAccount() {
    return [];
  }
  async getParticipantUserState() {
    return null;
  }
  async setParticipantUserState() {}
  async createRelationship() {
    return true;
  }
  async getRelationship() {
    return null;
  }
  async getRelationships() {
    return [];
  }
  async getAccountById() {
    return null;
  }
  async createAccount() {
    return true;
  }
  async getActorDetails() {
    return [];
  }
  // Cache methods matching declarations
  async getCache<T>(_key: string): Promise<T | undefined> {
    return undefined;
  }
  async setCache<T>(_key: string, _value: T): Promise<boolean> {
    return true;
  }
  async deleteCache(_key: string): Promise<boolean> {
    return true;
  }

  // Runtime methods
  initialize = async () => {};
  stop = async () => {};
  processActions = async () => {};
  evaluate = async () => null;
  evaluatePre = async () => ({ blocked: false, redacted: false });
  ensureConnection = async () => {};
  ensureConnections = async () => {};
  ensureParticipantInRoom = async () => {};
  ensureWorldExists = async () => {};
  ensureRoomExists = async () => {};
  composeState = async () => ({}) as State;
  useModel = async () => "fake-response";
  generateText = async () => ({}) as never;
  registerModel = () => {};
  getModel = () => undefined;
  getModelConfiguration = () => undefined;
  registerEvent = () => {};
  getEvent = () => undefined;
  emitEvent = async () => {};
  registerTaskWorker = () => {};
  getTaskWorker = () => undefined;
  dynamicPromptExecFromState = async () => null;
  addEmbeddingToMemory = async (m: Memory) => m;
  queueEmbeddingGeneration = async () => {};
  getAllMemories = async () => [];
  clearAllAgentMemories = async () => {};
  updateMemory = async () => true;
  createRunId = () => "fake-run-id" as never;
  startRun = () => "fake-run-id" as never;
  endRun = () => {};
  getCurrentRunId = () => "fake-run-id" as never;
  getEntityById = async () => null;
  createEntity = async () => true;
  getRooms = async () => [];
  registerSendHandler = () => {};
  sendMessageToTarget = async () => {};
  updateWorld = async () => {};
  redactSecrets = (t: string) => t;
  getConnection = async () => ({});
  getServiceLoadPromise = async () => ({}) as Service;
  getRegisteredServiceTypes = () =>
    Array.from(this.registeredServiceTypes) as ServiceTypeName[];
  hasService = (serviceType: ServiceTypeName | string) =>
    this.registeredServiceTypes.has(String(serviceType));
  registerDatabaseAdapter = () => {};
  setSetting = (key: string, value: string | boolean | null) => {
    if (typeof value === "string") {
      this.settings.set(key, value);
    }
  };
  getSetting = (key: string) => this.settings.get(key) ?? null;
  getConversationLength = () => 0;
  isActionPlanningEnabled = () => true;
  getLLMMode = () => "DEFAULT" as never;
  isCheckShouldRespondEnabled = () => true;
  getActionResults = () => [];
  getAllActions = () => [];
  getFilteredActions = () => [];
  isActionAllowed = () => ({ allowed: true, reason: "" });
  registerPlugin = async (plugin: Plugin) => {
    this.plugins.push(plugin);
    for (const service of plugin.services ?? []) {
      if (typeof service?.serviceType === "string") {
        this.registeredServiceTypes.add(service.serviceType);
      }
    }
  };

  // Synchronous registration methods to match interface
  registerProvider(provider: Provider): void {
    this.providers.push(provider);
  }
  registerAction(action: Action): void {
    this.actions.push(action);
  }
  registerEvaluator(evaluator: Evaluator): void {
    this.evaluators.push(evaluator);
  }

  // Service methods matched
  getService<T extends Service>(service: ServiceTypeName | string): T | null {
    const type = service as ServiceTypeName;
    const services = this.services.get(type);
    if (services && services.length > 0) {
      return services[0] as T;
    }
    return null;
  }

  getServicesByType<T extends Service>(service: ServiceTypeName | string): T[] {
    return (this.services.get(service as ServiceTypeName) || []) as T[];
  }

  getAllServices() {
    return this.services;
  }

  async registerService(serviceClass: ServiceClass): Promise<void> {
    // Instantiate the service
    const service = new serviceClass(this);
    // Initialize if needed (though runtime usually calls initialize later)
    await service.initialize(this);

    // Add to map
    const type = service.serviceType;
    if (!this.services.has(type)) {
      this.services.set(type, []);
    }
    this.services.get(type)?.push(service);
  }

  getAgent = async () => null;
  getAgents = async () => [];
  getAgentsByIds = async () => [];
  createAgent = async () => true;
  updateAgent = async () => true;
  deleteAgent = async () => true;
  ensureEmbeddingDimension = async () => {};
  getEntitiesByIds = async () => null;
  getEntitiesForRoom = async () => [];
  createEntities = async () => true;
  updateEntity = async () => {};
  getComponent = async () => null;
  getComponents = async () => [];
  createComponent = async () => true;
  updateComponent = async () => {};
  deleteComponent = async () => {};
  deleteManyMemories = async () => {};
  deleteAllMemories = async () => {};
  createWorld = async () => "fake-world-id" as never;
  getWorld = async () => null;
  removeWorld = async () => {};
  getAllWorlds = async () => [];
  getRoomsByIds = async () => null;
  createRooms = async () => [];
  deleteRoom = async () => {};
  deleteRoomsByWorldId = async () => {};
  updateRoom = async () => {};
  addParticipantsRoom = async () => true;
  updateRelationship = async () => {};
  getTasks = async () => [];
  getTask = async () => null;
  getTasksByName = async () => [];
  createTask = async () => "fake-task-id" as never;
  updateTask = async () => {};
  deleteTask = async () => {};
  getMemoriesByWorldId = async () => [];
  getPairingRequests = async () => [];
  createPairingRequest = async () => "fake-req-id" as never;
  updatePairingRequest = async () => {};
  deletePairingRequest = async () => {};
  getPairingAllowlist = async () => [];
  createPairingAllowlistEntry = async () => "fake-entry-id" as never;
  deletePairingAllowlistEntry = async () => {};
  isReady = async () => true;
  close = async () => {};
  getCachedEmbeddings = async () => [];
  log = async () => {};
  deleteLog = async () => {};
  isRoomParticipant = async () => false;
  getParticipantsForEntity = async () => [];
}

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function registerRuntimePlugin(
  runtime: FakeAgentRuntime,
  packageName: string,
): Promise<void> {
  const plugin = await importAppPlugin(packageName);
  if (!plugin) {
    throw new Error(`Failed to import runtime plugin ${packageName}`);
  }
  await runtime.registerPlugin(plugin);
}

describe("AppManager Integration", () => {
  let appManager: AppManager;
  let pluginManager: PluginManagerService;
  let runtime: FakeAgentRuntime;
  let tempDir: string;

  const APP_NAME = "@elizaos/app-example";
  const APP_PLUGIN_NAME = "@elizaos/plugin-example";

  beforeEach(async () => {
    // Setup temp directory for plugins
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eliza-test-"));
    const pluginsDir = path.join(tempDir, "plugins");
    fs.mkdirSync(pluginsDir);

    // Mock registry response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        registry: {
          [APP_NAME]: {
            git: { repo: "elizaos/app-example", v0: {}, v1: {}, v2: {} },
            npm: { repo: APP_PLUGIN_NAME, v0: null, v1: null, v2: "1.0.0" },
            supports: { v0: true, v1: false, v2: false },
            description: "An example app",
            topics: ["app"],
            stargazers_count: 10,
            language: "TypeScript",
          },
          // Add the plugin entry so uninstallPlugin can find it
          [APP_PLUGIN_NAME]: {
            git: { repo: "elizaos/plugin-example", v0: {}, v1: {}, v2: {} },
            npm: { repo: APP_PLUGIN_NAME, v0: null, v1: null, v2: "1.0.0" },
            supports: { v0: true, v1: false, v2: false },
            description: "An example plugin",
            topics: ["plugin"],
          },
        },
      }),
    });

    runtime = new FakeAgentRuntime();
    // Initialize PluginManager with real file system path
    pluginManager = new PluginManagerService(runtime, {
      pluginDirectory: pluginsDir,
    });

    process.env.ELIZA_STATE_DIR = tempDir;

    appManager = new AppManager();
  });

  afterEach(() => {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("launches an app directly if plugin is already installed", async () => {
    // Mock listInstalledPlugins to report the plugin as already installed
    vi.spyOn(pluginManager, "listInstalledPlugins").mockResolvedValue([
      { name: APP_PLUGIN_NAME, version: "1.0.0" },
    ]);

    // Act
    const result = await appManager.launch(pluginManager, APP_NAME);

    // Assert
    expect(result.pluginInstalled).toBe(true);
    expect(result.needsRestart).toBe(false);
  });

  it("installs plugin if not installed (integration - skipping actual install via mock if possible, or failing)", async () => {
    // We spy on installPlugin to verify it is called
    const installSpy = vi.spyOn(pluginManager, "installPlugin");
    installSpy.mockResolvedValue({
      success: true,
      pluginName: APP_PLUGIN_NAME,
      version: "1.0.0",
      requiresRestart: true,
      installPath: "/tmp",
    });

    const result = await appManager.launch(
      pluginManager,
      APP_NAME,
      undefined,
      runtime,
    );

    expect(installSpy).toHaveBeenCalled();
    expect(result.pluginInstalled).toBe(true);
    expect(result.needsRestart).toBe(true);
  });

  it("stops an active app run without uninstalling its plugin", async () => {
    vi.spyOn(pluginManager, "listInstalledPlugins").mockResolvedValue([
      { name: APP_PLUGIN_NAME, version: "1.0.0" },
    ]);
    const uninstallSpy = vi.spyOn(pluginManager, "uninstallPlugin");

    const launch = await appManager.launch(pluginManager, APP_NAME);
    expect(launch.run?.appName).toBe(APP_NAME);

    const result = await appManager.stop(pluginManager, APP_NAME);

    expect(result.success).toBe(true);
    expect(result.pluginUninstalled).toBe(false);
    expect(result.stopScope).toBe("viewer-session");
    expect(uninstallSpy).not.toHaveBeenCalled();
    await expect(appManager.listRuns()).resolves.toHaveLength(0);
  });
});

describe("Hyperscape Auto-Provisioning", () => {
  let appManager: AppManager;
  let pluginManager: PluginManagerService;
  let runtime: FakeAgentRuntime;
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  const HYPERSCAPE_APP_NAME = "@hyperscape/plugin-hyperscape";
  const HYPERSCAPE_PLUGIN_NAME = "@hyperscape/plugin-hyperscape";

  beforeEach(async () => {
    // Flush any cached registry from prior test suites so fresh fetch mocks
    // installed in individual tests are honoured.
    pluginRegistry.resetRegistryCache();

    // Save original env vars
    originalEnv = {
      HYPERSCAPE_CHARACTER_ID: process.env.HYPERSCAPE_CHARACTER_ID,
      HYPERSCAPE_AUTH_TOKEN: process.env.HYPERSCAPE_AUTH_TOKEN,
      HYPERSCAPE_API_URL: process.env.HYPERSCAPE_API_URL,
      HYPERSCAPE_CLIENT_URL: process.env.HYPERSCAPE_CLIENT_URL,
      HYPERSCAPE_SERVER_URL: process.env.HYPERSCAPE_SERVER_URL,
      SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY,
      EVM_PRIVATE_KEY: process.env.EVM_PRIVATE_KEY,
      MILADY_STATE_DIR: process.env.MILADY_STATE_DIR,
      ELIZA_STATE_DIR: process.env.ELIZA_STATE_DIR,
    };

    // Clear hyperscape env vars
    delete process.env.HYPERSCAPE_CHARACTER_ID;
    delete process.env.HYPERSCAPE_AUTH_TOKEN;
    delete process.env.HYPERSCAPE_API_URL;
    delete process.env.HYPERSCAPE_CLIENT_URL;
    delete process.env.SOLANA_PRIVATE_KEY;
    delete process.env.EVM_PRIVATE_KEY;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eliza-hyperscape-test-"));
    const pluginsDir = path.join(tempDir, "plugins");
    fs.mkdirSync(pluginsDir);

    runtime = new FakeAgentRuntime();
    pluginManager = new PluginManagerService(runtime, {
      pluginDirectory: pluginsDir,
    });

    process.env.MILADY_STATE_DIR = tempDir;
    process.env.ELIZA_STATE_DIR = tempDir;
    appManager = new AppManager();
  });

  function createHyperscapeRegistryPayload() {
    return {
      registry: {
        [HYPERSCAPE_APP_NAME]: {
          git: { repo: "HyperscapeAI/hyperscape", v0: {}, v1: {}, v2: {} },
          npm: {
            repo: HYPERSCAPE_PLUGIN_NAME,
            v0: null,
            v1: null,
            v2: "1.0.0",
          },
          supports: { v0: true, v1: false, v2: false },
          description: "Hyperscape 3D world",
          topics: ["app"],
        },
        [HYPERSCAPE_PLUGIN_NAME]: {
          git: {
            repo: "elizaos/plugin-hyperscape",
            v0: {},
            v1: {},
            v2: {},
          },
          npm: {
            repo: HYPERSCAPE_PLUGIN_NAME,
            v0: null,
            v1: null,
            v2: "1.0.0",
          },
          supports: { v0: true, v1: false, v2: false },
          description: "Hyperscape plugin",
          topics: ["plugin"],
        },
      },
    };
  }

  function createHyperscapeLaunchFetchMock(options?: {
    rejectWalletAuth?: boolean;
  }) {
    return vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (
        url.includes(
          "raw.githubusercontent.com/elizaos-plugins/registry/next/generated-registry.json",
        )
      ) {
        return Promise.resolve(jsonResponse(createHyperscapeRegistryPayload()));
      }
      if (
        url.includes(
          "raw.githubusercontent.com/elizaos-plugins/registry/next/index.json",
        )
      ) {
        return Promise.resolve(jsonResponse({}));
      }
      if (url.includes("wallet-auth")) {
        if (options?.rejectWalletAuth) {
          return Promise.reject(new Error("ECONNREFUSED"));
        }
        return Promise.resolve(
          jsonResponse({
            success: true,
            authToken: "fixture-auth-token",
            characterId: "fixture-character-id",
          }),
        );
      }
      if (url.endsWith("/api/embedded-agents")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            agents: [],
          }),
        );
      }
      if (url.includes("/api/agents/mapping/")) {
        return Promise.resolve(
          jsonResponse(
            {
              success: false,
              error: "mapping not found",
            },
            { status: 404 },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected Hyperscape fetch: ${url}`));
    });
  }

  afterEach(() => {
    // Restore original env vars
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("degrades the Hyperscape viewer when wallet-auth provisioning fails", async () => {
    process.env.HYPERSCAPE_API_URL = "http://localhost:3333";
    process.env.HYPERSCAPE_CLIENT_URL = "http://localhost:3333";
    const fetchMock = createHyperscapeLaunchFetchMock({
      rejectWalletAuth: true,
    });
    global.fetch = fetchMock;

    // Mock listInstalledPlugins to report the plugin as already installed
    vi.spyOn(pluginManager, "listInstalledPlugins").mockResolvedValue([
      { name: HYPERSCAPE_PLUGIN_NAME, version: "1.0.0" },
    ]);

    const result = await appManager.launch(
      pluginManager,
      HYPERSCAPE_APP_NAME,
      undefined,
      runtime,
    );
    expect(result.pluginInstalled).toBe(true);
    expect(result.viewer?.postMessageAuth).toBe(false);
    expect(result.viewer?.authMessage).toBeUndefined();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("wallet-auth"),
      ),
    ).toBe(true);
  });

  it("uses pre-configured Hyperscape credentials without re-running wallet auth", async () => {
    process.env.HYPERSCAPE_API_URL = "http://localhost:3333";
    process.env.HYPERSCAPE_CLIENT_URL = "http://localhost:3333";
    process.env.HYPERSCAPE_CHARACTER_ID = "test-char-id";
    process.env.HYPERSCAPE_AUTH_TOKEN = "test-auth-token";
    const fetchMock = createHyperscapeLaunchFetchMock({
      rejectWalletAuth: true,
    });
    global.fetch = fetchMock;

    // Mock listInstalledPlugins to report the plugin as already installed
    vi.spyOn(pluginManager, "listInstalledPlugins").mockResolvedValue([
      { name: HYPERSCAPE_PLUGIN_NAME, version: "1.0.0" },
    ]);

    const result = await appManager.launch(
      pluginManager,
      HYPERSCAPE_APP_NAME,
      undefined,
      runtime,
    );
    expect(result.pluginInstalled).toBe(true);
    expect(result.viewer).toEqual(
      expect.objectContaining({
        postMessageAuth: true,
        authMessage: {
          type: "HYPERSCAPE_AUTH",
          authToken: "test-auth-token",
          agentId: "fake-agent-id",
          characterId: "test-char-id",
          followEntity: "test-char-id",
        },
      }),
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("wallet-auth"),
      ),
    ).toBe(false);
  });

  it("skips auto-provisioning when credentials already exist", async () => {
    process.env.HYPERSCAPE_API_URL = "http://localhost:3333";
    process.env.HYPERSCAPE_CLIENT_URL = "http://localhost:3333";
    process.env.HYPERSCAPE_CHARACTER_ID = "existing-char-id";
    process.env.HYPERSCAPE_AUTH_TOKEN = "existing-auth-token";
    const fetchMock = createHyperscapeLaunchFetchMock({
      rejectWalletAuth: true,
    });
    global.fetch = fetchMock;

    // Mock listInstalledPlugins to report the plugin as already installed
    vi.spyOn(pluginManager, "listInstalledPlugins").mockResolvedValue([
      { name: HYPERSCAPE_PLUGIN_NAME, version: "1.0.0" },
    ]);

    const result = await appManager.launch(pluginManager, HYPERSCAPE_APP_NAME);
    expect(result.pluginInstalled).toBe(true);
    expect(process.env.HYPERSCAPE_CHARACTER_ID).toBe("existing-char-id");
    expect(process.env.HYPERSCAPE_AUTH_TOKEN).toBe("existing-auth-token");
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("wallet-auth"),
      ),
    ).toBe(false);
  });
});

describe("App URL template security", () => {
  let originalEnv: Record<string, string | undefined>;

  function createRegistryApp(
    overrides: Partial<RegistryPluginInfo> = {},
  ): RegistryPluginInfo {
    return {
      name: "@elizaos/app-security-test",
      gitRepo: "elizaos/app-security-test",
      gitUrl: "https://github.com/elizaos/app-security-test",
      description: "security test app",
      topics: ["app"],
      stars: 0,
      language: "TypeScript",
      launchType: "connect",
      launchUrl: null,
      kind: "app",
      npm: {
        package: "@elizaos/plugin-security-test",
        v0Version: "1.0.0",
        v1Version: null,
        v2Version: null,
      },
      supports: { v0: true, v1: false, v2: false },
      ...overrides,
    };
  }

  function createPluginManagerStub(
    appInfo: RegistryPluginInfo,
  ): PluginManagerLike {
    const pluginName = appInfo.runtimePlugin ?? appInfo.npm.package;
    return {
      refreshRegistry: vi
        .fn()
        .mockResolvedValue(new Map<string, RegistryPluginInfo>()),
      listInstalledPlugins: vi
        .fn()
        .mockResolvedValue([{ name: pluginName, version: "1.0.0" }]),
      getRegistryPlugin: vi.fn().mockResolvedValue(appInfo),
      searchRegistry: vi.fn().mockResolvedValue([]),
      installPlugin: vi.fn().mockResolvedValue({
        success: true,
        pluginName,
        version: "1.0.0",
        installPath: "/tmp",
        requiresRestart: true,
      }),
      uninstallPlugin: vi.fn().mockResolvedValue({
        success: true,
        pluginName,
        requiresRestart: true,
      }),
      listEjectedPlugins: vi.fn().mockResolvedValue([]),
      ejectPlugin: vi.fn().mockResolvedValue({
        success: true,
        pluginName,
        ejectedPath: "/tmp",
        requiresRestart: false,
      }),
      syncPlugin: vi.fn().mockResolvedValue({
        success: true,
        pluginName,
        ejectedPath: "/tmp",
        requiresRestart: false,
      }),
      reinjectPlugin: vi.fn().mockResolvedValue({
        success: true,
        pluginName,
        removedPath: "/tmp",
        requiresRestart: false,
      }),
    };
  }

  beforeEach(() => {
    originalEnv = {
      BOT_NAME: process.env.BOT_NAME,
      ELIZA_API_TOKEN: process.env.ELIZA_API_TOKEN,
    };
    vi.spyOn(registryClient, "getPluginInfo").mockResolvedValue(null);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.restoreAllMocks();
  });

  it("does not interpolate non-allowlisted env vars into app URLs", async () => {
    process.env.BOT_NAME = "allowlisted-bot";
    process.env.ELIZA_API_TOKEN = "super-secret-token";
    const appInfo = createRegistryApp({
      launchUrl:
        "https://launch.example/?bot={BOT_NAME}&token={ELIZA_API_TOKEN}",
      viewer: {
        url: "https://viewer.example/play?bot={BOT_NAME}&token={ELIZA_API_TOKEN}",
        embedParams: { session: "{ELIZA_API_TOKEN}" },
      },
    });

    const appManager = new AppManager();
    const result = await appManager.launch(
      createPluginManagerStub(appInfo),
      appInfo.name,
    );

    expect(result.launchUrl).toBe(
      "https://launch.example/?bot=allowlisted-bot&token=",
    );
    expect(result.viewer?.url).toBeDefined();
    expect(result.viewer?.url).not.toContain("super-secret-token");
    expect(result.viewer?.embedParams).toBeUndefined();

    const viewerUrl = new URL(result.viewer?.url ?? "https://viewer.example");
    expect(viewerUrl.searchParams.get("bot")).toBe("allowlisted-bot");
    expect(viewerUrl.searchParams.get("token")).toBe("");
    expect(viewerUrl.searchParams.get("session")).toBeNull();
  });

  it("still interpolates allowlisted env vars", async () => {
    process.env.BOT_NAME = "test-agent";
    const appInfo = createRegistryApp({
      launchUrl: "https://launch.example/?bot={BOT_NAME}",
      viewer: {
        url: "https://viewer.example/play?bot={BOT_NAME}",
      },
    });

    const appManager = new AppManager();
    const result = await appManager.launch(
      createPluginManagerStub(appInfo),
      appInfo.name,
    );

    expect(result.launchUrl).toBe("https://launch.example/?bot=test-agent");
    const viewerUrl = new URL(result.viewer?.url ?? "https://viewer.example");
    expect(viewerUrl.searchParams.get("bot")).toBe("test-agent");
  });
});

describe("App session launch metadata", () => {
  function createRegistryApp(
    overrides: Partial<RegistryPluginInfo> = {},
  ): RegistryPluginInfo {
    return {
      name: "@hyperscape/plugin-hyperscape",
      gitRepo: "HyperscapeAI/hyperscape",
      gitUrl: "https://github.com/HyperscapeAI/hyperscape",
      description: "Hyperscape app",
      topics: ["app"],
      stars: 0,
      language: "TypeScript",
      launchType: "connect",
      launchUrl: "http://localhost:3333",
      kind: "app",
      runtimePlugin: "@hyperscape/plugin-hyperscape",
      npm: {
        package: "@hyperscape/plugin-hyperscape",
        v0Version: null,
        v1Version: null,
        v2Version: "1.0.0",
      },
      supports: { v0: false, v1: false, v2: true },
      ...overrides,
    };
  }

  function createPluginManagerStub(
    appInfo: RegistryPluginInfo,
  ): PluginManagerLike {
    const pluginName = appInfo.runtimePlugin ?? appInfo.npm.package;
    return {
      refreshRegistry: vi
        .fn()
        .mockResolvedValue(new Map<string, RegistryPluginInfo>()),
      listInstalledPlugins: vi
        .fn()
        .mockResolvedValue([{ name: pluginName, version: "1.0.0" }]),
      getRegistryPlugin: vi.fn().mockResolvedValue(appInfo),
      searchRegistry: vi.fn().mockResolvedValue([]),
      installPlugin: vi.fn().mockResolvedValue({
        success: true,
        pluginName,
        version: "1.0.0",
        installPath: "/tmp",
        requiresRestart: false,
      }),
      uninstallPlugin: vi.fn().mockResolvedValue({
        success: true,
        pluginName,
        requiresRestart: false,
      }),
      listEjectedPlugins: vi.fn().mockResolvedValue([]),
      ejectPlugin: vi.fn().mockResolvedValue({
        success: true,
        pluginName,
        ejectedPath: "/tmp",
        requiresRestart: false,
      }),
      syncPlugin: vi.fn().mockResolvedValue({
        success: true,
        pluginName,
        ejectedPath: "/tmp",
        requiresRestart: false,
      }),
      reinjectPlugin: vi.fn().mockResolvedValue({
        success: true,
        pluginName,
        removedPath: "/tmp",
        requiresRestart: false,
      }),
    };
  }

  async function registerHyperscapeRuntimeStub(
    runtime: FakeAgentRuntime,
    pluginName: string,
  ): Promise<void> {
    class HyperscapeServiceStub {
      static serviceType = "hyperscapeService";

      constructor(_runtime: IAgentRuntime) {}

      async initialize(_runtime: IAgentRuntime): Promise<void> {}
    }

    await runtime.registerPlugin({
      name: pluginName,
      services: [HyperscapeServiceStub as unknown as ServiceClass],
    } as Plugin);
  }

  afterEach(() => {
    delete process.env.HYPERSCAPE_CLIENT_URL;
    delete process.env.HYPERSCAPE_AUTH_TOKEN;
    delete process.env.HYPERSCAPE_CHARACTER_ID;
    vi.restoreAllMocks();
  });

  it("builds Hyperscape viewer auth and spectate session state", async () => {
    process.env.HYPERSCAPE_CLIENT_URL = "http://localhost:3333";
    global.fetch = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/api/embedded-agents")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            agents: [
              {
                agentId: "11111111-1111-1111-1111-111111111111",
                characterId: "character-456",
                entityId: "character-456",
                name: "Chen",
                state: "running",
                lastActivity: 1_710_000_000_000,
                startedAt: 1_709_999_000_000,
              },
            ],
          }),
        );
      }
      if (
        url.includes("/api/agents/11111111-1111-1111-1111-111111111111/goal")
      ) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            goal: { description: "Scout the moon gate", type: "scout" },
            availableGoals: [{ description: "Hold position", type: "idle" }],
            goalsPaused: false,
          }),
        );
      }
      if (
        url.includes(
          "/api/agents/11111111-1111-1111-1111-111111111111/quick-actions",
        )
      ) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            quickCommands: [
              { label: "Check the gate", command: "Check the moon gate" },
            ],
            nearbyLocations: [{ name: "Moon Gate" }],
            availableGoals: [
              { description: "Scout the moon gate", type: "scout" },
            ],
          }),
        );
      }
      if (
        url.includes(
          "/api/agents/11111111-1111-1111-1111-111111111111/thoughts",
        )
      ) {
        return Promise.resolve(
          jsonResponse(
            {
              success: false,
              error: "thoughts unavailable",
            },
            { status: 404 },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected Hyperscape fetch: ${url}`));
    });

    const appInfo = createRegistryApp({
      viewer: {
        url: "{HYPERSCAPE_CLIENT_URL}",
        postMessageAuth: true,
      },
      session: {
        mode: "spectate-and-steer",
        features: ["commands", "pause", "resume", "telemetry"],
      },
    });

    const runtime = new FakeAgentRuntime();
    runtime.agentId =
      "11111111-1111-1111-1111-111111111111" as FakeAgentRuntime["agentId"];
    runtime.getSetting = (key: string) => {
      if (key === "HYPERSCAPE_AUTH_TOKEN") return "token-123";
      if (key === "HYPERSCAPE_CHARACTER_ID") return "character-456";
      return null;
    };
    await registerHyperscapeRuntimeStub(
      runtime,
      appInfo.runtimePlugin ?? appInfo.name,
    );

    const appManager = new AppManager();
    const result = await appManager.launch(
      createPluginManagerStub(appInfo),
      appInfo.name,
      undefined,
      runtime,
    );

    expect(result.viewer?.url).toContain("http://localhost:3333");
    expect(result.viewer?.postMessageAuth).toBe(true);
    expect(result.viewer?.authMessage).toEqual({
      type: "HYPERSCAPE_AUTH",
      authToken: "token-123",
      agentId: "11111111-1111-1111-1111-111111111111",
      characterId: "character-456",
      followEntity: "character-456",
    });
    expect(result.diagnostics ?? []).toEqual([]);
    expect(result.session).toEqual(
      expect.objectContaining({
        sessionId: "11111111-1111-1111-1111-111111111111",
        appName: "@hyperscape/plugin-hyperscape",
        mode: "spectate-and-steer",
        agentId: "11111111-1111-1111-1111-111111111111",
        characterId: "character-456",
        followEntity: "character-456",
      }),
    );
    if (result.session?.status === "running") {
      expect(result.session).toEqual(
        expect.objectContaining({
          canSendCommands: true,
        }),
      );
    } else {
      expect(result.session).toEqual(
        expect.objectContaining({
          status: "connecting",
          canSendCommands: true,
          controls: ["pause", "resume"],
          summary: "Connecting session...",
        }),
      );
    }
  });

  it("disables Hyperscape iframe auth when no auth token exists", async () => {
    process.env.HYPERSCAPE_CLIENT_URL = "http://localhost:3333";
    global.fetch = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/api/embedded-agents")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            agents: [
              {
                agentId: "22222222-2222-2222-2222-222222222222",
                characterId: "character-789",
                entityId: "character-789",
                name: "Chen",
                state: "running",
              },
            ],
          }),
        );
      }
      if (
        url.includes("/api/agents/22222222-2222-2222-2222-222222222222/goal")
      ) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            goal: { description: "Roam freely", type: "wander" },
            availableGoals: [],
            goalsPaused: false,
          }),
        );
      }
      if (
        url.includes(
          "/api/agents/22222222-2222-2222-2222-222222222222/quick-actions",
        )
      ) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            quickCommands: [
              { label: "Report status", command: "Report status" },
            ],
            nearbyLocations: [],
            availableGoals: [],
          }),
        );
      }
      if (
        url.includes(
          "/api/agents/22222222-2222-2222-2222-222222222222/thoughts",
        )
      ) {
        return Promise.resolve(
          jsonResponse(
            {
              success: false,
              error: "thoughts unavailable",
            },
            { status: 404 },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected Hyperscape fetch: ${url}`));
    });

    const appInfo = createRegistryApp({
      viewer: {
        url: "{HYPERSCAPE_CLIENT_URL}",
        postMessageAuth: true,
      },
      session: {
        mode: "spectate-and-steer",
        features: ["commands"],
      },
    });

    const runtime = new FakeAgentRuntime();
    runtime.agentId =
      "22222222-2222-2222-2222-222222222222" as FakeAgentRuntime["agentId"];
    runtime.getSetting = (key: string) => {
      if (key === "HYPERSCAPE_CHARACTER_ID") return "character-789";
      return null;
    };
    await registerHyperscapeRuntimeStub(
      runtime,
      appInfo.runtimePlugin ?? appInfo.name,
    );

    const appManager = new AppManager();
    const result = await appManager.launch(
      createPluginManagerStub(appInfo),
      appInfo.name,
      undefined,
      runtime,
    );

    expect(result.viewer?.postMessageAuth).toBe(false);
    expect(result.viewer?.authMessage).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "hyperscape-auth-unavailable",
          severity: "error",
        }),
      ]),
    );
    expect(result.session).toEqual(
      expect.objectContaining({
        sessionId: "22222222-2222-2222-2222-222222222222",
        characterId: "character-789",
      }),
    );
  });

  it("reports Hyperscape launch diagnostics when no live agent session can be attached", async () => {
    process.env.HYPERSCAPE_CLIENT_URL = "http://localhost:3333";
    global.fetch = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (
        url.includes(
          "raw.githubusercontent.com/elizaos-plugins/registry/next/generated-registry.json",
        )
      ) {
        return Promise.resolve(jsonResponse({ registry: {} }));
      }
      if (
        url.includes(
          "raw.githubusercontent.com/elizaos-plugins/registry/next/index.json",
        )
      ) {
        return Promise.resolve(jsonResponse({}));
      }
      if (url.endsWith("/api/embedded-agents")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            agents: [],
          }),
        );
      }
      if (url.includes("/api/agents/mapping/")) {
        return Promise.resolve(
          jsonResponse(
            {
              success: false,
              error: "mapping not found",
            },
            { status: 404 },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected Hyperscape fetch: ${url}`));
    });

    const appInfo = createRegistryApp({
      viewer: {
        url: "{HYPERSCAPE_CLIENT_URL}",
        embedParams: {
          embedded: "true",
          mode: "spectator",
          surface: "agent-control",
          followEntity: "{HYPERSCAPE_CHARACTER_ID}",
        },
        postMessageAuth: true,
      },
      session: {
        mode: "spectate-and-steer",
        features: ["commands"],
      },
    });

    const runtime = new FakeAgentRuntime();
    runtime.agentId =
      "33333333-3333-3333-3333-333333333333" as FakeAgentRuntime["agentId"];
    await registerHyperscapeRuntimeStub(
      runtime,
      appInfo.runtimePlugin ?? appInfo.name,
    );

    const appManager = new AppManager();
    const result = await appManager.launch(
      createPluginManagerStub(appInfo),
      appInfo.name,
      undefined,
      runtime,
    );

    expect(result.viewer?.postMessageAuth).toBe(false);
    expect(result.viewer?.embedParams).toEqual(
      expect.objectContaining({
        embedded: "true",
        mode: "spectator",
        surface: "agent-control",
      }),
    );
    expect(result.viewer?.embedParams?.followEntity).toBeUndefined();
    if (result.session) {
      expect(result.session).toEqual(
        expect.objectContaining({
          sessionId: "33333333-3333-3333-3333-333333333333",
          appName: "@hyperscape/plugin-hyperscape",
          mode: "spectate-and-steer",
          status: "connecting",
          canSendCommands: true,
          controls: ["pause", "resume"],
          summary: "Connecting session...",
        }),
      );
    } else {
      expect(result.session).toBeNull();
    }
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "hyperscape-auth-unavailable",
          severity: "error",
        }),
      ]),
    );
  });
});
