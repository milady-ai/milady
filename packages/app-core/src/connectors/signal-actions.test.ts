import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeIf } from "../../../../test/helpers/conditional-tests.ts";

type SignalSendMessageAction = {
  name: string;
  similes?: string[];
  examples?: unknown[];
  validate: (
    runtime: unknown,
    message: unknown,
    state?: unknown,
    options?: unknown,
  ) => Promise<boolean>;
  handler: (
    runtime: unknown,
    message: unknown,
    state: unknown,
    options: unknown,
    callback: (response: unknown) => Promise<unknown>,
  ) => Promise<{ success: boolean; error?: string } | undefined>;
};

const signalActionsModuleUrl = new URL(
  "../../../../../plugins/plugin-signal/typescript/src/actions/sendMessage.ts",
  import.meta.url,
);
const hasSignalActionsModule = existsSync(signalActionsModuleUrl);
const signalActionsModule = hasSignalActionsModule
  ? ((await import(signalActionsModuleUrl.href)) as {
      sendMessage: SignalSendMessageAction;
    })
  : null;

function requireSignalSendMessage(): SignalSendMessageAction {
  if (!signalActionsModule) {
    throw new Error("Signal action source is unavailable in this checkout.");
  }

  return signalActionsModule.sendMessage;
}

type SignalServiceLike = {
  isServiceConnected: () => boolean;
  sendMessage: (recipient: string, text: string) => Promise<unknown>;
  sendGroupMessage: (groupId: string, text: string) => Promise<unknown>;
};

function createRuntime(overrides: Record<string, unknown> = {}) {
  const signalService: SignalServiceLike = {
    isServiceConnected: () => true,
    sendMessage: vi.fn().mockResolvedValue({ timestamp: 123 }),
    sendGroupMessage: vi.fn().mockResolvedValue({ timestamp: 456 }),
  };

  return {
    getService: vi.fn().mockReturnValue(signalService),
    useModel: vi
      .fn()
      .mockResolvedValue('{"text":"hello from signal","recipient":"current"}'),
    getRoom: vi.fn().mockResolvedValue({
      id: "room-1",
      channelId: "+14155551234",
      metadata: { isGroup: false },
    }),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  };
}

function createMessage(overrides: Record<string, unknown> = {}) {
  return {
    roomId: "00000000-0000-0000-0000-000000000010",
    content: {
      text: "send a signal message saying hello",
      source: "signal",
    },
    ...overrides,
  };
}

describeIf(hasSignalActionsModule)("signal sendMessage action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates only signal-sourced send-message intents", async () => {
    const sendMessage = requireSignalSendMessage();
    const runtime = createRuntime();

    await expect(sendMessage.validate(runtime, createMessage())).resolves.toBe(
      true,
    );

    await expect(
      sendMessage.validate(
        runtime,
        createMessage({
          content: {
            text: "hello there",
            source: "discord",
          },
        }),
      ),
    ).resolves.toBe(false);
  });

  it("returns an error when the signal service is unavailable", async () => {
    const sendMessage = requireSignalSendMessage();
    const runtime = createRuntime({
      getService: vi.fn().mockReturnValue(null),
    });
    const callback = vi.fn().mockResolvedValue([]);

    const result = await sendMessage.handler(
      runtime,
      createMessage(),
      undefined,
      undefined,
      callback,
    );

    expect(result).toEqual({
      success: false,
      error: "Signal service not available",
    });
    expect(callback).toHaveBeenCalledWith({
      text: "Signal service is not available.",
      source: "signal",
    });
  });

  it("returns an error when the model cannot extract message parameters", async () => {
    const sendMessage = requireSignalSendMessage();
    const runtime = createRuntime({
      useModel: vi.fn().mockResolvedValue("{}"),
    });
    const callback = vi.fn().mockResolvedValue([]);

    const result = await sendMessage.handler(
      runtime,
      createMessage(),
      undefined,
      undefined,
      callback,
    );

    expect(result).toEqual({
      success: false,
      error: "Could not extract message parameters",
    });
    expect(callback).toHaveBeenCalledWith({
      text: "I couldn't understand what message you want me to send. Please try again with a clearer request.",
      source: "signal",
    });
  });

  it("sends a direct message via the signal service", async () => {
    const sendMessage = requireSignalSendMessage();
    const runtime = createRuntime();
    const callback = vi.fn().mockResolvedValue([]);

    const result = await sendMessage.handler(
      runtime,
      createMessage(),
      {
        data: {
          room: {
            id: "room-1",
            channelId: "+14155551234",
            metadata: { isGroup: false },
          },
        },
      },
      undefined,
      callback,
    );

    const signalService = runtime.getService("signal") as SignalServiceLike;

    expect(result).toEqual({
      success: true,
      data: {
        timestamp: 123,
        recipient: "+14155551234",
      },
    });
    expect(signalService.sendMessage).toHaveBeenCalledWith(
      "+14155551234",
      "hello from signal",
    );
    expect(callback).toHaveBeenCalledWith({
      text: "Message sent successfully.",
      source: "signal",
    });
  });

  it("sends a group message when the current room is a Signal group", async () => {
    const sendMessage = requireSignalSendMessage();
    const runtime = createRuntime();
    const callback = vi.fn().mockResolvedValue([]);

    const result = await sendMessage.handler(
      runtime,
      createMessage(),
      {
        data: {
          room: {
            id: "room-group",
            channelId: "group-123",
            metadata: { isGroup: true },
          },
        },
      },
      undefined,
      callback,
    );

    const signalService = runtime.getService("signal") as SignalServiceLike;

    expect(result).toEqual({
      success: true,
      data: {
        timestamp: 456,
        recipient: "group-123",
      },
    });
    expect(signalService.sendGroupMessage).toHaveBeenCalledWith(
      "group-123",
      "hello from signal",
    );
    expect(sendMessage.name).toBe("SIGNAL_SEND_MESSAGE");
    expect(sendMessage.similes).toContain("SEND_SIGNAL_MESSAGE");
    expect(sendMessage.examples).toHaveLength(1);
  });
});
