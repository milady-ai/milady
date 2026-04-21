import {
  createMessageMemory,
  stringToUuid,
  type AgentRuntime,
  type Content,
  type ContentValue,
  type UUID,
} from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockStartTrajectoryStepInDatabase } = vi.hoisted(() => ({
  mockStartTrajectoryStepInDatabase: vi.fn(),
}));

vi.mock("../../runtime/trajectory-storage.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../runtime/trajectory-storage.js")
  >("../../runtime/trajectory-storage.js");
  return {
    ...actual,
    startTrajectoryStepInDatabase: mockStartTrajectoryStepInDatabase,
  };
});

import { generateChatResponse } from "../chat-routes";

type TestRuntimeOptions = {
  handleMessage?: (
    runtime: AgentRuntime,
    message: object,
    onResponse: (content: Content) => Promise<object[]>,
    messageOptions?: {
      onStreamChunk?: (chunk: string, messageId?: string) => Promise<void>;
    },
  ) => Promise<{
    responseContent?: {
      text?: string;
      actions?: string[];
    };
    responseMessages?: Array<{
      id?: string;
      content?: Content;
    }>;
    mode?: string;
  }>;
  emitEvent?: AgentRuntime["emitEvent"];
  logger?: AgentRuntime["logger"];
};

function createRuntimeForTrajectoryChatTests(
  options: TestRuntimeOptions = {},
): AgentRuntime {
  const runtimeLogger =
    options.logger ??
    ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as AgentRuntime["logger"]);

  return {
    agentId: stringToUuid("chat-route-trajectory-agent"),
    character: {
      name: "ChatTrajectoryAgent",
      postExamples: ["Hello there"],
    } as AgentRuntime["character"],
    messageService: {
      handleMessage: async (
        runtime: AgentRuntime,
        message: object,
        onResponse: (content: Content) => Promise<object[]>,
        messageOptions?: {
          onStreamChunk?: (chunk: string, messageId?: string) => Promise<void>;
        },
      ) =>
        options.handleMessage?.(runtime, message, onResponse, messageOptions) ?? {
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
    emitEvent: async (...args: Parameters<AgentRuntime["emitEvent"]>) => {
      await options.emitEvent?.(...args);
    },
    getMemoriesByRoomIds: async () => [],
    getRoomsByWorld: async () => [],
    getMemories: async () => [],
    deleteManyMemories: async () => {},
    deleteRoom: async () => {},
    getCache: async () => null,
    setCache: async () => {},
    actions: [],
    logger: runtimeLogger,
  } as unknown as AgentRuntime;
}

function createTrajectoryMessage(text: string, overrides: {
  source?: string;
  metadata?: Record<string, unknown>;
  contentMetadata?: Record<string, ContentValue>;
} = {}) {
  const message = createMessageMemory({
    entityId: stringToUuid("chat-route-trajectory-user"),
    roomId: stringToUuid("chat-route-trajectory-room"),
    content: {
      text,
      source: overrides.source ?? "client_chat",
      ...(overrides.contentMetadata
        ? { metadata: overrides.contentMetadata }
        : {}),
    },
  });
  if (overrides.metadata) {
    Object.assign(message.metadata, overrides.metadata);
  }
  return message;
}

describe("generateChatResponse trajectory runtime behavior", () => {
  beforeEach(() => {
    mockStartTrajectoryStepInDatabase.mockReset();
    mockStartTrajectoryStepInDatabase.mockResolvedValue(true);
  });

  it("emits a fallback MESSAGE_SENT event with the original trajectory step metadata", async () => {
    const emittedEvents: Array<{
      eventName: string;
      payload: Record<string, unknown>;
    }> = [];
    const runtime = createRuntimeForTrajectoryChatTests({
      emitEvent: async (event, payload) => {
        const eventName = Array.isArray(event) ? event[0] : event;
        emittedEvents.push({
          eventName,
          payload: (payload ?? {}) as Record<string, unknown>,
        });
      },
      handleMessage: async (_runtime, message) => {
        const metadata =
          message && typeof message === "object" && "metadata" in message
            ? (message.metadata as { trajectoryStepId?: string } | undefined)
            : undefined;
        expect(metadata?.trajectoryStepId).toBe("trajectory-step-123");
        return {
          responseContent: {
            text: "Trajectory fallback reply",
          },
        };
      },
    });

    const message = createTrajectoryMessage("show the trajectory output", {
      metadata: { trajectoryStepId: "trajectory-step-123" },
      contentMetadata: {
        eval: {
          scenarioId: "scenario-fallback",
          batchId: "batch-fallback",
        },
      },
    });

    const result = await generateChatResponse(
      runtime,
      message,
      "ChatTrajectoryAgent",
    );

    expect(result.text).toBe("Trajectory fallback reply");
    expect(emittedEvents.map((entry) => entry.eventName)).toEqual([
      "MESSAGE_RECEIVED",
      "MESSAGE_SENT",
    ]);
    const sentPayload = emittedEvents[1]?.payload ?? {};
    const sentMessage = sentPayload.message as {
      content?: { text?: string };
      metadata?: { trajectoryStepId?: string };
    };
    expect(sentMessage.content?.text).toBe("Trajectory fallback reply");
    expect(sentMessage.metadata?.trajectoryStepId).toBe("trajectory-step-123");
    expect(mockStartTrajectoryStepInDatabase).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime,
        stepId: "trajectory-step-123",
        source: "client_chat",
        metadata: {
          scenarioId: "scenario-fallback",
          batchId: "batch-fallback",
        },
      }),
    );
  });

  it("emits MESSAGE_SENT for explicit responseMessages with preserved metadata", async () => {
    const emittedEvents: Array<{
      eventName: string;
      payload: Record<string, unknown>;
    }> = [];
    const runtime = createRuntimeForTrajectoryChatTests({
      emitEvent: async (event, payload) => {
        emittedEvents.push({
          eventName: Array.isArray(event) ? event[0] : event,
          payload: (payload ?? {}) as Record<string, unknown>,
        });
      },
      handleMessage: async () => ({
        responseContent: {
          text: "ignored fallback text",
        },
        responseMessages: [
          {
            id: "response-message-1",
            content: { text: "explicit response message" },
          },
        ],
      }),
    });

    const message = createTrajectoryMessage("use explicit response messages", {
      metadata: {
        trajectoryStepId: "trajectory-step-explicit",
        scenarioId: "scenario-explicit",
      },
    });

    const result = await generateChatResponse(
      runtime,
      message,
      "ChatTrajectoryAgent",
    );

    expect(result.text).toBe("ignored fallback text");
    expect(emittedEvents.map((entry) => entry.eventName)).toEqual([
      "MESSAGE_RECEIVED",
      "MESSAGE_SENT",
    ]);
    const sentPayload = emittedEvents[1]?.payload ?? {};
    const sentMessage = sentPayload.message as {
      id?: string;
      content?: { text?: string };
      metadata?: { trajectoryStepId?: string; scenarioId?: string };
    };
    expect(sentMessage.id).toBe("response-message-1");
    expect(sentMessage.content?.text).toBe("explicit response message");
    expect(sentMessage.metadata?.trajectoryStepId).toBe(
      "trajectory-step-explicit",
    );
    expect(sentMessage.metadata?.scenarioId).toBe("scenario-explicit");
  });

  it("does not persist trajectory grouping without a trajectory step id", async () => {
    const runtime = createRuntimeForTrajectoryChatTests();
    const message = createTrajectoryMessage("no step id means no backfill", {
      contentMetadata: {
        eval: {
          scenarioId: "scenario-without-step",
          batchId: "batch-without-step",
        },
      },
    });

    const result = await generateChatResponse(
      runtime,
      message,
      "ChatTrajectoryAgent",
    );

    expect(result.text).toBe("Hello world");
    expect(mockStartTrajectoryStepInDatabase).not.toHaveBeenCalled();
  });

  it("does not persist trajectory grouping when no scenario or batch metadata exists", async () => {
    const runtime = createRuntimeForTrajectoryChatTests();
    const message = createTrajectoryMessage("step without grouping metadata", {
      metadata: { trajectoryStepId: "trajectory-step-no-grouping" },
    });

    const result = await generateChatResponse(
      runtime,
      message,
      "ChatTrajectoryAgent",
    );

    expect(result.text).toBe("Hello world");
    expect(mockStartTrajectoryStepInDatabase).not.toHaveBeenCalled();
  });

  it("warns and still returns when trajectory grouping persistence fails", async () => {
    mockStartTrajectoryStepInDatabase.mockRejectedValue(
      new Error("grouping write failed"),
    );
    const warn = vi.fn();
    const runtimeLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
    } as unknown as AgentRuntime["logger"];
    const runtime = createRuntimeForTrajectoryChatTests({
      logger: runtimeLogger,
      handleMessage: async () => ({
        responseContent: {
          text: "Response survives grouping failure",
        },
      }),
    });

    const message = createTrajectoryMessage("persist grouping warning path", {
      metadata: { trajectoryStepId: "trajectory-step-warning" },
      contentMetadata: {
        eval: {
          scenarioId: "scenario-warning",
        },
      },
    });

    const result = await generateChatResponse(
      runtime,
      message,
      "ChatTrajectoryAgent",
    );

    expect(result.text).toBe("Response survives grouping failure");
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        src: "eliza-api",
      }),
      "Failed to persist trajectory grouping metadata",
    );
  });

  it("warns and still returns when MESSAGE_SENT emission fails", async () => {
    const warn = vi.fn();
    const runtimeLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
    } as unknown as AgentRuntime["logger"];
    const runtime = createRuntimeForTrajectoryChatTests({
      logger: runtimeLogger,
      emitEvent: async (event) => {
        const eventName = Array.isArray(event) ? event[0] : event;
        if (eventName === "MESSAGE_SENT") {
          throw new Error("emit sent failed");
        }
      },
      handleMessage: async () => ({
        responseContent: {
          text: "Message sent warning still returns text",
        },
      }),
    });

    const message = createTrajectoryMessage("message sent warning path", {
      metadata: {
        trajectoryStepId: "trajectory-step-message-sent-warning",
        scenarioId: "scenario-message-sent-warning",
      },
    });

    const result = await generateChatResponse(
      runtime,
      message,
      "ChatTrajectoryAgent",
    );

    expect(result.text).toBe("Message sent warning still returns text");
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        src: "eliza-api",
      }),
      "Failed to emit MESSAGE_SENT event",
    );
    expect(mockStartTrajectoryStepInDatabase).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: "trajectory-step-message-sent-warning",
        metadata: {
          scenarioId: "scenario-message-sent-warning",
        },
      }),
    );
  });
});
