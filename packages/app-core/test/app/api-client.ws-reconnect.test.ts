import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the WS reconnect logic in MiladyClient.
 *
 * We import and test the real MiladyClient class, mocking WebSocket
 * and browser globals so connectWs() and onWsEvent() can run in Node.
 */

// ---------------------------------------------------------------------------
// WebSocket stub — captures instances so tests can trigger onopen/onclose
// ---------------------------------------------------------------------------

let latestWs: {
  onopen: (() => void) | null;
  onclose: ((ev?: { code?: number }) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} | null = null;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  onopen: (() => void) | null = null;
  onclose: ((ev?: { code?: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = MockWebSocket.OPEN;
  send = vi.fn();
  close = vi.fn();

  constructor(_url: string) {
    latestWs = this;
  }
}

const mockStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
};

// Install global mocks before importing the client module
vi.stubGlobal("WebSocket", MockWebSocket);
vi.stubGlobal("localStorage", mockStorage);
vi.stubGlobal("sessionStorage", mockStorage);
vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
    text: async () => "",
  }),
);

// Mock contract modules that api-client.ts imports from autonomous.
vi.mock("@miladyai/agent/contracts/drop", () => ({}));
vi.mock("@miladyai/agent/contracts/onboarding", () => ({}));
vi.mock("@miladyai/agent/contracts/verification", () => ({}));
vi.mock("@miladyai/agent/contracts/wallet", () => ({}));
vi.mock("@miladyai/agent/contracts/permissions", () => ({}));

// Provide window.location so connectWs() can build a WS URL
vi.stubGlobal("window", {
  location: { protocol: "http:", host: "localhost:2138" },
  localStorage: mockStorage,
  sessionStorage: mockStorage,
  navigator: { userAgent: "" },
  __ELIZA_API_BASE__: undefined,
});

// ---------------------------------------------------------------------------
// Import the real MiladyClient
// ---------------------------------------------------------------------------

const { MiladyClient } = await import("@miladyai/app-core/api");

describe("MiladyClient WS reconnect", () => {
  let client: InstanceType<typeof MiladyClient>;

  beforeEach(() => {
    latestWs = null;
    client = new MiladyClient("http://localhost:2138");
  });

  afterEach(() => {
    client.disconnectWs();
  });

  it("does not fire ws-reconnected on first connect", () => {
    const handler = vi.fn();
    client.onWsEvent("ws-reconnected", handler);

    client.connectWs();
    // Simulate WebSocket open
    latestWs?.onopen?.();

    expect(handler).not.toHaveBeenCalled();
  });

  it("fires ws-reconnected on reconnect after first connect", () => {
    const handler = vi.fn();
    client.onWsEvent("ws-reconnected", handler);

    // First connect
    client.connectWs();
    latestWs?.onopen?.();
    expect(handler).not.toHaveBeenCalled();

    // Simulate disconnect + reconnect
    const oldWs = latestWs;
    if (oldWs) oldWs.readyState = MockWebSocket.CLOSED;
    client.connectWs();
    latestWs?.onopen?.();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ws-reconnected" }),
    );
  });

  it("fires ws-reconnected on every subsequent reconnect", () => {
    const handler = vi.fn();
    client.onWsEvent("ws-reconnected", handler);

    // First connect
    client.connectWs();
    latestWs?.onopen?.();

    // Reconnect 1
    if (latestWs) latestWs.readyState = MockWebSocket.CLOSED;
    client.connectWs();
    latestWs?.onopen?.();

    // Reconnect 2
    if (latestWs) latestWs.readyState = MockWebSocket.CLOSED;
    client.connectWs();
    latestWs?.onopen?.();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("onWsEvent returns an unsubscribe function", () => {
    const handler = vi.fn();
    const unsub = client.onWsEvent("ws-reconnected", handler);

    // First connect
    client.connectWs();
    latestWs?.onopen?.();

    // Unsubscribe before reconnect
    unsub();

    if (latestWs) latestWs.readyState = MockWebSocket.CLOSED;
    client.connectWs();
    latestWs?.onopen?.();

    expect(handler).not.toHaveBeenCalled();
  });
});
