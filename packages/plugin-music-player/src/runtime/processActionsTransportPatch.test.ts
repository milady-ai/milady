import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { installProcessActionsTransportPatch } from "./processActionsTransportPatch.js";

function createRuntimeWithProcessActions(
  impl: (
    message: unknown,
    responses: unknown,
    state: unknown,
    callback: unknown,
    opts?: unknown,
  ) => Promise<unknown>,
): IAgentRuntime & { processActions: typeof impl } {
  return { processActions: impl } as IAgentRuntime & {
    processActions: typeof impl;
  };
}

describe("installProcessActionsTransportPatch", () => {
  it("rewrites PLAY_AUDIO to PAUSE_MUSIC when user text is transport-only pause", async () => {
    const inner = vi.fn(async () => ({ ok: true }));
    const runtime = createRuntimeWithProcessActions(inner);
    installProcessActionsTransportPatch(runtime);

    const responses = [
      { content: { text: "ok", actions: ["REPLY", "PLAY_AUDIO"] } },
    ];
    await runtime.processActions(
      { content: { text: "pause" } },
      responses,
      {},
      null,
    );

    expect(responses[0].content.actions).toEqual(["REPLY", "PAUSE_MUSIC"]);
    expect(inner).toHaveBeenCalledTimes(1);
    const passedResponses = inner.mock.calls[0][1] as typeof responses;
    expect(passedResponses[0].content.actions).toEqual(["REPLY", "PAUSE_MUSIC"]);
  });

  it("rewrites each PLAY_AUDIO in actions to SKIP_TRACK for skip intent", async () => {
    const inner = vi.fn(async () => ({}));
    const runtime = createRuntimeWithProcessActions(inner);
    installProcessActionsTransportPatch(runtime);

    const responses = [
      { content: { actions: ["PLAY_AUDIO", "PLAY_AUDIO"] } },
    ];
    await runtime.processActions({ content: { text: "skip" } }, responses, {}, null);

    expect(responses[0].content.actions).toEqual(["SKIP_TRACK", "SKIP_TRACK"]);
  });

  it("does not rewrite when PLAY_AUDIO is absent", async () => {
    const inner = vi.fn(async () => ({}));
    const runtime = createRuntimeWithProcessActions(inner);
    installProcessActionsTransportPatch(runtime);

    const responses = [{ content: { actions: ["REPLY", "PAUSE_MUSIC"] } }];
    await runtime.processActions({ content: { text: "pause" } }, responses, {}, null);

    expect(responses[0].content.actions).toEqual(["REPLY", "PAUSE_MUSIC"]);
  });

  it("does not rewrite when text is a play request", async () => {
    const inner = vi.fn(async () => ({}));
    const runtime = createRuntimeWithProcessActions(inner);
    installProcessActionsTransportPatch(runtime);

    const responses = [{ content: { actions: ["PLAY_AUDIO"] } }];
    await runtime.processActions(
      { content: { text: "play bohemian rhapsody" } },
      responses,
      {},
      null,
    );

    expect(responses[0].content.actions).toEqual(["PLAY_AUDIO"]);
  });

  it("is idempotent on the same runtime", async () => {
    const inner = vi.fn(async () => ({}));
    const runtime = createRuntimeWithProcessActions(inner);
    installProcessActionsTransportPatch(runtime);
    installProcessActionsTransportPatch(runtime);

    const responses = [{ content: { actions: ["PLAY_AUDIO"] } }];
    await runtime.processActions({ content: { text: "stop the music" } }, responses, {}, null);

    expect(responses[0].content.actions).toEqual(["STOP_MUSIC"]);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});
