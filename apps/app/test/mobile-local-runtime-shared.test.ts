import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLocalAgentReply,
  buildSendMessagePayload,
  dispatchLocalAgentEvent,
  getLocalAgentStatusFromPlugin,
  loadBunRuntimePlugin,
  type BunRuntimePluginBase,
} from "../src/mobile-local-runtime-shared";

describe("mobile local runtime shared helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches document events with the original payload", () => {
    const listener = vi.fn();
    const detail = { ready: true, source: "ios" };
    document.addEventListener("local-agent-ready", listener);

    dispatchLocalAgentEvent("local-agent-ready", detail);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ detail });
    document.removeEventListener("local-agent-ready", listener);
  });

  it("builds send-message payloads without leaking empty conversation ids", () => {
    expect(buildSendMessagePayload("hello")).toEqual({ message: "hello" });
    expect(buildSendMessagePayload("hello", "conversation-1")).toEqual({
      message: "hello",
      conversationId: "conversation-1",
    });
  });

  it("builds local agent replies with optional conversation ids", () => {
    expect(buildLocalAgentReply("hi")).toEqual({ reply: "hi" });
    expect(buildLocalAgentReply("hi", "conversation-1")).toEqual({
      reply: "hi",
      conversationId: "conversation-1",
    });
  });

  it("returns plugin status and falls back to not-ready on plugin failure", async () => {
    const readyPlugin = {
      getStatus: vi.fn().mockResolvedValue({
        ready: true,
        model: "local-model",
        tokensPerSecond: 42,
      }),
    } as unknown as BunRuntimePluginBase;

    await expect(getLocalAgentStatusFromPlugin(readyPlugin, "[test]")).resolves
      .toEqual({
        ready: true,
        model: "local-model",
        tokensPerSecond: 42,
      });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failingPlugin = {
      getStatus: vi.fn().mockRejectedValue(new Error("bridge down")),
    } as unknown as BunRuntimePluginBase;

    await expect(getLocalAgentStatusFromPlugin(failingPlugin, "[test]")).resolves
      .toEqual({ ready: false });
    expect(warn).toHaveBeenCalledWith("[test] getStatus() failed:", "bridge down");
  });

  it("treats an installed native module without ElizaBunRuntime as unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(loadBunRuntimePlugin("[test]")).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      "[test] plugin module loaded but ElizaBunRuntime export missing",
    );
  });
});
