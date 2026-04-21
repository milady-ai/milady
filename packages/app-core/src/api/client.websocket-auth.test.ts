import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOOT_CONFIG, setBootConfig } from "../config/boot-config";

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {}
}

describe("MiladyClient WebSocket auth", () => {
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    setBootConfig(DEFAULT_BOOT_CONFIG);
    MockWebSocket.instances = [];

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          protocol: "http:",
          host: "127.0.0.1:31337",
        },
        localStorage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
        sessionStorage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
        WebSocket: MockWebSocket,
      },
    });

    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: MockWebSocket,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }

    if (originalWebSocket === undefined) {
      Reflect.deleteProperty(globalThis, "WebSocket");
    } else {
      Object.defineProperty(globalThis, "WebSocket", {
        configurable: true,
        value: originalWebSocket,
      });
    }
  });

  it("keeps the token out of the WebSocket URL and sends it as the first auth message", async () => {
    const { MiladyClient } = await import("./client");

    const client = new MiladyClient("http://127.0.0.1:31337", "secret-token");
    client.connectWs();

    const ws = MockWebSocket.instances[0];
    expect(ws.url).toContain("/ws?clientId=");
    expect(ws.url).not.toContain("secret-token");
    expect(ws.url).not.toContain("token=");

    ws.onopen?.();

    expect(ws.sent[0]).toBe(
      JSON.stringify({ type: "auth", token: "secret-token" }),
    );
  });

  it("keeps retrying on a long interval after max reconnect attempts", async () => {
    const { MiladyClient } = await import("./client");

    const client = new MiladyClient("http://127.0.0.1:31337", null);
    client.connectWs();

    const firstWs = MockWebSocket.instances[0];
    (client as unknown as { reconnectAttempt: number }).reconnectAttempt = 14;

    firstWs.onclose?.();
    expect(client.getConnectionState().state).toBe("failed");
    expect(MockWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(MockWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("warns when the disconnected ws send queue drops the oldest message", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { MiladyClient } = await import("./client");

    const client = new MiladyClient("http://127.0.0.1:31337", null);
    const internals = client as unknown as {
      wsSendQueue: string[];
      wsSendQueueLimit: number;
    };
    internals.wsSendQueue = Array.from(
      { length: internals.wsSendQueueLimit },
      (_, i) => JSON.stringify({ type: `queued-${i}` }),
    );

    client.sendWsMessage({ type: "message-32" });

    expect(warnSpy).toHaveBeenCalledWith(
      "[ws] send queue full - dropping:",
      "message-32",
    );
  });
});
