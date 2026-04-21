// @vitest-environment jsdom

import {
  AGENT_READY_EVENT,
  COMMAND_PALETTE_EVENT,
  dispatchMiladyEvent,
  dispatchWindowEvent,
  type ElizaDocumentEventName,
  type ElizaWindowEventName,
  SELF_STATUS_SYNC_EVENT,
  VOICE_CONFIG_UPDATED_EVENT,
} from "@miladyai/app-core/events";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

describe("dispatchMiladyEvent", () => {
  it("accepts only known document event names", () => {
    expectTypeOf(dispatchMiladyEvent)
      .parameter(0)
      .toEqualTypeOf<ElizaDocumentEventName>();
  });

  it("dispatches a CustomEvent on document", () => {
    const handler = vi.fn();
    document.addEventListener(COMMAND_PALETTE_EVENT, handler);
    dispatchMiladyEvent(COMMAND_PALETTE_EVENT);
    expect(handler).toHaveBeenCalledTimes(1);
    document.removeEventListener(COMMAND_PALETTE_EVENT, handler);
  });

  it("includes detail when provided", () => {
    const handler = vi.fn();
    document.addEventListener(AGENT_READY_EVENT, handler);
    dispatchMiladyEvent(AGENT_READY_EVENT, { state: "running" });
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ state: "running" });
    document.removeEventListener(AGENT_READY_EVENT, handler);
  });
});

describe("dispatchWindowEvent", () => {
  it("accepts only known window event names", () => {
    expectTypeOf(dispatchWindowEvent)
      .parameter(0)
      .toEqualTypeOf<ElizaWindowEventName>();
  });

  it("dispatches a CustomEvent on window", () => {
    const handler = vi.fn();
    window.addEventListener(VOICE_CONFIG_UPDATED_EVENT, handler);
    dispatchWindowEvent(VOICE_CONFIG_UPDATED_EVENT, { provider: "test" });
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ provider: "test" });
    window.removeEventListener(VOICE_CONFIG_UPDATED_EVENT, handler);
  });

  it("dispatches sidebar refresh events on window", () => {
    const handler = vi.fn();
    window.addEventListener(SELF_STATUS_SYNC_EVENT, handler);
    dispatchWindowEvent(SELF_STATUS_SYNC_EVENT);
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(SELF_STATUS_SYNC_EVENT, handler);
  });
});
