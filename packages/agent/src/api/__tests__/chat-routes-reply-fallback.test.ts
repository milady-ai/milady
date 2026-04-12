import {
  createMessageMemory,
  stringToUuid,
  type AgentRuntime,
  type Content,
  type UUID,
} from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { generateChatResponse } from "../chat-routes";

function createRuntimeForChatRouteTests(options?: {
  handleMessage?: (
    runtime: AgentRuntime,
    message: object,
    onResponse: (content: Content) => Promise<object[]>,
    messageOptions?: {
      onStreamChunk?: (chunk: string, messageId?: string) => Promise<void>;
      timeoutDuration?: number;
      keepExistingResponses?: boolean;
    },
  ) => Promise<{
    didRespond?: boolean;
    responseContent?: {
      text?: string;
      actions?: string[];
    };
    responseMessages?: Content[];
    mode?: string;
  }>;
  actions?: Array<{
    name: string;
    similes?: string[];
    validate?: (...args: unknown[]) => unknown;
    handler?: (...args: unknown[]) => unknown;
  }>;
  logger?: AgentRuntime["logger"];
}): AgentRuntime {
  const runtimeLogger =
    options?.logger ??
    ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as AgentRuntime["logger"]);

  return {
    agentId: stringToUuid("chat-route-agent"),
    character: {
      name: "ChatRouteAgent",
      postExamples: ["Hello there"],
    } as AgentRuntime["character"],
    messageService: {
      handleMessage: async (
        runtime: AgentRuntime,
        message: object,
        onResponse: (content: Content) => Promise<object[]>,
        messageOptions?: {
          onStreamChunk?: (chunk: string, messageId?: string) => Promise<void>;
          timeoutDuration?: number;
          keepExistingResponses?: boolean;
        },
      ) =>
        options?.handleMessage?.(
          runtime,
          message,
          onResponse,
          messageOptions,
        ) ?? {
          responseContent: {
            text: "Hello world",
          },
        },
    } as AgentRuntime["messageService"],
    ensureConnection: async () => {},
    getWorld: async () => null,
    getRoom: async (roomId: UUID) => ({ id: roomId }),
    updateWorld: async () => {},
    createMemory: async () => {},
    getService: () => null,
    getServicesByType: () => [],
    emitEvent: async () => {},
    getMemoriesByRoomIds: async () => [],
    getRoomsByWorld: async () => [],
    getMemories: async () => [],
    deleteManyMemories: async () => {},
    deleteRoom: async () => {},
    getCache: async () => null,
    setCache: async () => {},
    actions: options?.actions ?? [],
    logger: runtimeLogger,
  } as unknown as AgentRuntime;
}

function createUserMessage(text: string) {
  return createMessageMemory({
    entityId: stringToUuid("chat-route-user"),
    roomId: stringToUuid("chat-route-room"),
    content: {
      text,
      source: "api",
    },
  });
}

describe("generateChatResponse fallback recovery", () => {
  it("does not warn about unexecuted fallback recovery for REPLY-only payloads", async () => {
    const warn = vi.fn();
    const runtimeLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
    } as unknown as AgentRuntime["logger"];
    const runtime = createRuntimeForChatRouteTests({
      logger: runtimeLogger,
      handleMessage: async () => ({
        responseContent: {
          text: "hello there",
          actions: ["REPLY"],
        },
      }),
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage("hello"),
      "ChatRouteAgent",
    );

    expect(result.text).toBe("hello there");
    const warnedMessages = warn.mock.calls.map((args) =>
      String(args[1] ?? args[0] ?? ""),
    );
    expect(warnedMessages).not.toContain(
      "[eliza-api] Recovering from unexecuted action payload",
    );
  });

  it("still recovers executable fallback actions for balance intents", async () => {
    const warn = vi.fn();
    const runtimeLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
    } as unknown as AgentRuntime["logger"];
    const runtime = createRuntimeForChatRouteTests({
      logger: runtimeLogger,
      handleMessage: async () => ({
        responseContent: {
          text: "let me check that for you",
        },
      }),
      actions: [
        {
          name: "CHECK_BALANCE",
          validate: async () => true,
          handler: async (
            _runtime: unknown,
            _message: unknown,
            _state: unknown,
            _options: unknown,
            callback?: (content: Content) => void,
          ) => {
            callback?.({
              text: "Wallet Balances:\n\nBSC:\n  BNB: 0.1000 ($0.00)",
              action: "CHECK_BALANCE_RESPONSE",
            } as Content);
            return {
              text: "Wallet Balances:\n\nBSC:\n  BNB: 0.1000 ($0.00)",
              success: true,
            };
          },
        },
      ],
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage("what is my wallet balance?"),
      "ChatRouteAgent",
    );

    expect(result.text).toContain("Wallet Balances:");
    expect(result.text).toContain("BNB: 0.1000");
    const warnedMessages = warn.mock.calls.map((args) =>
      String(args[1] ?? args[0] ?? ""),
    );
    expect(warnedMessages).toContain(
      "[eliza-api] Recovering from unexecuted action payload",
    );
  });

  it("marks action-callback-driven turns so conversation routes can avoid mirroring them", async () => {
    const runtime = createRuntimeForChatRouteTests({
      handleMessage: async (_runtime, _message, onResponse) => {
        await onResponse({
          text: "I updated that preference.",
          action: "MODIFY_CHARACTER",
        } as Content);

        return {
          didRespond: true,
          responseContent: {
            text: "I updated that preference.",
            actions: ["MODIFY_CHARACTER"],
          },
          responseMessages: [],
          mode: "actions",
        };
      },
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage("change your personality"),
      "ChatRouteAgent",
    );

    expect(result.text).toBe("I updated that preference.");
    expect(result.usedActionCallbacks).toBe(true);
  });

  it("fails fast when generation exceeds the configured timeout", async () => {
    const runtime = createRuntimeForChatRouteTests({
      handleMessage: async () =>
        await new Promise<never>(() => {
          // Intentionally never resolves.
        }),
    });

    await expect(
      generateChatResponse(runtime, createUserMessage("hello"), "ChatRouteAgent", {
        timeoutDuration: 1_000,
      }),
    ).rejects.toThrow("Chat generation timed out after 1000ms");
  });

  it("treats pure IGNORE outcomes as an intentional no-response", async () => {
    const runtime = createRuntimeForChatRouteTests({
      handleMessage: async () => ({
        didRespond: true,
        responseContent: {
          text: "",
          actions: ["IGNORE"],
        },
        responseMessages: [],
        mode: "actions",
      }),
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage("hello"),
      "ChatRouteAgent",
      {
        resolveNoResponseText: () => "Sorry, I'm having a provider issue",
      },
    );

    expect(result.text).toBe("");
    expect(result.noResponseReason).toBe("ignored");
  });

  it("opts chat generations into keeping superseded responses", async () => {
    let receivedOptions:
      | {
          onStreamChunk?: (chunk: string, messageId?: string) => Promise<void>;
          timeoutDuration?: number;
          keepExistingResponses?: boolean;
        }
      | undefined;

    const runtime = createRuntimeForChatRouteTests({
      handleMessage: async (_runtime, _message, _onResponse, messageOptions) => {
        receivedOptions = messageOptions;
        return {
          didRespond: true,
          responseContent: {
            text: "Hello world",
            actions: ["REPLY"],
          },
          responseMessages: [],
          mode: "simple",
        };
      },
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage("hello"),
      "ChatRouteAgent",
    );

    expect(result.text).toBe("Hello world");
    expect(receivedOptions?.keepExistingResponses).toBe(true);
  });
});
