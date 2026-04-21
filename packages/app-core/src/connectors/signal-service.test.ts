import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeIf } from "../../../../test/helpers/conditional-tests.ts";

type SignalServiceInstance = {
  stop: () => Promise<void>;
  sendMessage: (
    recipient: string,
    text: string,
  ) => Promise<{ timestamp: number }>;
  sendGroupMessage: (
    groupId: string,
    text: string,
  ) => Promise<{ timestamp: number }>;
  isServiceConnected: () => boolean;
};

type SignalPluginModule = {
  default: {
    name?: string;
    description?: string;
    actions?: Array<{ name: string }>;
    services?: unknown[];
    init?: unknown;
  };
  SignalService: {
    new (runtime?: unknown): SignalServiceInstance;
    start: (runtime: unknown) => Promise<SignalServiceInstance>;
  };
};

type SignalTypesModule = {
  SIGNAL_SERVICE_NAME: string;
  SignalEventTypes: {
    MESSAGE_RECEIVED: string;
    MESSAGE_SENT: string;
  };
};

const signalPluginModuleUrl = new URL(
  "../../../../../plugins/plugin-signal/typescript/src/index.ts",
  import.meta.url,
);
const signalTypesModuleUrl = new URL(
  "../../../../../plugins/plugin-signal/typescript/src/types.ts",
  import.meta.url,
);
const hasSignalPluginSource =
  existsSync(signalPluginModuleUrl) && existsSync(signalTypesModuleUrl);
const signalPluginModule = hasSignalPluginSource
  ? ((await import(signalPluginModuleUrl.href)) as SignalPluginModule)
  : null;
const signalTypesModule = hasSignalPluginSource
  ? ((await import(signalTypesModuleUrl.href)) as SignalTypesModule)
  : null;

function requireSignalPluginModule(): SignalPluginModule {
  if (!signalPluginModule) {
    throw new Error("Signal plugin source is unavailable in this checkout.");
  }

  return signalPluginModule;
}

function requireSignalTypesModule(): SignalTypesModule {
  if (!signalTypesModule) {
    throw new Error("Signal plugin types are unavailable in this checkout.");
  }

  return signalTypesModule;
}

function createRuntime(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "00000000-0000-0000-0000-000000000001",
    character: { name: "Signal Test Agent" },
    getSetting: vi.fn().mockReturnValue(undefined),
    ensureConnection: vi.fn().mockResolvedValue(undefined),
    createMemory: vi.fn().mockResolvedValue(undefined),
    emitEvent: vi.fn().mockResolvedValue(undefined),
    getRoom: vi.fn().mockResolvedValue(null),
    createRoom: vi.fn().mockResolvedValue(undefined),
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describeIf(hasSignalPluginSource)("signalPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports the expected plugin shape", () => {
    const signalPlugin = requireSignalPluginModule().default;
    const { SignalService } = requireSignalPluginModule();
    expect(signalPlugin.name).toBe("signal");
    expect(signalPlugin.description).toContain("Signal");
    expect(signalPlugin.actions?.map((action) => action.name)).toEqual([
      "SIGNAL_SEND_MESSAGE",
      "SIGNAL_SEND_REACTION",
      "SIGNAL_LIST_CONTACTS",
      "SIGNAL_LIST_GROUPS",
    ]);
    expect(signalPlugin.services).toHaveLength(1);
    expect(signalPlugin.services?.[0]).toBe(SignalService);
    expect(typeof signalPlugin.init).toBe("function");
  });

  it("does not start when SIGNAL_ACCOUNT_NUMBER is missing", async () => {
    const { SignalService } = requireSignalPluginModule();
    const runtime = createRuntime();

    const service = await SignalService.start(runtime);

    expect(service.isServiceConnected()).toBe(false);
    expect(runtime.logger.warn).toHaveBeenCalledWith(
      { src: "plugin:signal", agentId: runtime.agentId },
      "SIGNAL_ACCOUNT_NUMBER not provided, Signal service will not start",
    );
  });

  it("connects through the Signal HTTP API when account and URL are configured", async () => {
    const { SignalService } = requireSignalPluginModule();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ contacts: [] }))
      .mockResolvedValueOnce(jsonResponse([]));
    const runtime = createRuntime({
      getSetting: vi.fn((key: string) => {
        if (key === "SIGNAL_ACCOUNT_NUMBER") return "+14155551234";
        if (key === "SIGNAL_HTTP_URL") return "http://localhost:8080";
        return undefined;
      }),
    });

    const service = await SignalService.start(runtime);

    expect(service.isServiceConnected()).toBe(true);
    expect(
      (
        service as SignalServiceInstance & {
          getAccountNumber: () => string | null;
        }
      ).getAccountNumber(),
    ).toBe("+14155551234");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8080/v1/contacts/+14155551234",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8080/v1/groups/+14155551234",
      expect.objectContaining({ method: "GET" }),
    );

    await service.stop();
  });

  it("throws when sending a direct message before the client is initialized", async () => {
    const { SignalService } = requireSignalPluginModule();
    const runtime = createRuntime();
    const service = new SignalService(runtime);

    await expect(service.sendMessage("+14155551234", "hello")).rejects.toThrow(
      "Signal client not initialized",
    );
  });

  it("normalizes recipients and forwards direct messages through the API client", async () => {
    const { SignalService } = requireSignalPluginModule();
    const runtime = createRuntime();
    const service = new SignalService(runtime);
    const client = {
      sendMessage: vi.fn().mockResolvedValue({ timestamp: 123 }),
    };

    (service as SignalServiceInstance & { client: typeof client }).client =
      client;

    const result = await service.sendMessage("(415) 555-1234", "hello");

    expect(result).toEqual({ timestamp: 123 });
    expect(client.sendMessage).toHaveBeenCalledWith(
      "+14155551234",
      "hello",
      undefined,
    );
  });

  it("forwards group messages through the API client", async () => {
    const { SignalService } = requireSignalPluginModule();
    const runtime = createRuntime();
    const service = new SignalService(runtime);
    const client = {
      sendGroupMessage: vi.fn().mockResolvedValue({ timestamp: 456 }),
    };

    (service as SignalServiceInstance & { client: typeof client }).client =
      client;

    const result = await service.sendGroupMessage("group-123", "hello group");

    expect(result).toEqual({ timestamp: 456 });
    expect(client.sendGroupMessage).toHaveBeenCalledWith(
      "group-123",
      "hello group",
      undefined,
    );
  });

  it("stores inbound messages and routes replies through the message service callback", async () => {
    const { SignalService } = requireSignalPluginModule();
    const { SignalEventTypes } = requireSignalTypesModule();
    const runtime = createRuntime();
    const service = new SignalService(runtime);
    const client = {
      sendMessage: vi.fn().mockResolvedValue({ timestamp: 789 }),
    };
    const messageService = {
      handleMessage: vi.fn(
        async (
          _runtime: unknown,
          _memory: unknown,
          callback: (response: { text: string }) => Promise<unknown>,
        ) => {
          await callback({ text: "reply from agent" });
        },
      ),
    };

    (service as SignalServiceInstance & { client: typeof client }).client =
      client;
    (
      service as SignalServiceInstance & {
        contactCache: Map<string, { number: string; name?: string }>;
      }
    ).contactCache.set("+14155551234", {
      number: "+14155551234",
      name: "Alice",
    });
    Object.assign(runtime, { messageService });

    await (
      service as SignalServiceInstance & {
        handleIncomingMessage: (msg: {
          sender: string;
          senderUuid?: string;
          groupId?: string;
          message: string;
          attachments: unknown[];
          timestamp: number;
          reaction?: unknown;
          quote?: unknown;
          expiresInSeconds?: number;
          viewOnce?: boolean;
        }) => Promise<void>;
      }
    ).handleIncomingMessage({
      sender: "+14155551234",
      senderUuid: undefined,
      groupId: undefined,
      message: "hello agent",
      attachments: [],
      timestamp: 123,
      reaction: undefined,
      quote: undefined,
      expiresInSeconds: undefined,
      viewOnce: false,
    });

    expect(runtime.ensureConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: "Alice",
        source: "signal",
        channelId: "+14155551234",
        worldName: "Signal",
      }),
    );
    expect(runtime.createMemory).toHaveBeenCalledTimes(2);
    expect(runtime.emitEvent).toHaveBeenCalledWith(
      SignalEventTypes.MESSAGE_RECEIVED,
      {
        runtime,
        source: "signal",
      },
    );
    expect(runtime.emitEvent).toHaveBeenCalledWith(
      SignalEventTypes.MESSAGE_SENT,
      {
        runtime,
        source: "signal",
      },
    );
    expect(messageService.handleMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage).toHaveBeenCalledWith(
      "+14155551234",
      "reply from agent",
      undefined,
    );
  });

  it("ignores group messages when the runtime is configured to ignore them", async () => {
    const { SignalService } = requireSignalPluginModule();
    const runtime = createRuntime({
      getSetting: vi.fn((key: string) => {
        if (key === "SIGNAL_SHOULD_IGNORE_GROUP_MESSAGES") return "true";
        return undefined;
      }),
    });
    const service = new SignalService(runtime);

    await (
      service as SignalServiceInstance & {
        handleIncomingMessage: (msg: {
          sender: string;
          groupId?: string;
          message: string;
          attachments: unknown[];
          timestamp: number;
          reaction?: unknown;
          quote?: unknown;
          expiresInSeconds?: number;
          viewOnce?: boolean;
        }) => Promise<void>;
      }
    ).handleIncomingMessage({
      sender: "+14155551234",
      groupId: "group-123",
      message: "group hello",
      attachments: [],
      timestamp: 456,
      reaction: undefined,
      quote: undefined,
      expiresInSeconds: undefined,
      viewOnce: false,
    });

    expect(runtime.ensureConnection).not.toHaveBeenCalled();
    expect(runtime.createMemory).not.toHaveBeenCalled();
    expect(runtime.emitEvent).not.toHaveBeenCalled();
  });

  it("stops polling and clears connection state on shutdown", async () => {
    const { SignalService } = requireSignalPluginModule();
    const runtime = createRuntime();
    const service = new SignalService(runtime);
    const pollInterval = setInterval(() => {}, 1_000);

    (
      service as SignalServiceInstance & {
        client: Record<string, never> | null;
        isConnected: boolean;
        pollInterval: NodeJS.Timeout | null;
      }
    ).client = {};
    (
      service as SignalServiceInstance & {
        client: Record<string, never> | null;
        isConnected: boolean;
        pollInterval: NodeJS.Timeout | null;
      }
    ).isConnected = true;
    (
      service as SignalServiceInstance & {
        client: Record<string, never> | null;
        isConnected: boolean;
        pollInterval: NodeJS.Timeout | null;
      }
    ).pollInterval = pollInterval;

    await service.stop();

    expect(service.isServiceConnected()).toBe(false);
    expect(
      (
        service as SignalServiceInstance & {
          pollInterval: NodeJS.Timeout | null;
        }
      ).pollInterval,
    ).toBeNull();
    expect(runtime.logger.info).toHaveBeenCalledWith(
      { src: "plugin:signal", agentId: runtime.agentId },
      "Signal service stopped",
    );
  });

  it("exports the canonical signal service name", () => {
    const { SIGNAL_SERVICE_NAME } = requireSignalTypesModule();
    expect(SIGNAL_SERVICE_NAME).toBe("signal");
  });
});
