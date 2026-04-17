import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentChannel } from "../src/messaging/native-messaging.js";
import type { InboundMessage, OutboundMessage } from "../src/types.js";

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  url: string;
  sent: string[] = [];
  private listeners = new Map<string, ((ev: unknown) => void)[]>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (ev: unknown) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(listener);
    this.listeners.set(type, arr);
  }

  send(data: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error("send called on closed socket");
    }
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { code: 1000, reason: "test" });
  }

  emit(type: string, ev: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(ev);
    }
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
});

afterEach(() => {
  vi.useRealTimers();
});

function getSocket(index: number): FakeWebSocket {
  const socket = FakeWebSocket.instances[index];
  expect(socket).toBeDefined();
  if (!socket) {
    throw new Error(`expected FakeWebSocket instance at index ${index}`);
  }
  return socket;
}

describe("AgentChannel", () => {
  it("buffers messages sent before the socket opens and drains on open", () => {
    const channel = new AgentChannel({ url: "ws://127.0.0.1:31339/ext" });
    channel.start();
    const message: OutboundMessage = {
      type: "heartbeat",
      payload: { deviceId: "d1", ts: "2026-04-17T00:00:00.000Z" },
    };
    channel.send(message);

    const socket = getSocket(0);
    expect(socket.sent).toEqual([]);
    socket.open();
    expect(socket.sent).toHaveLength(1);
    const sent = socket.sent[0];
    expect(sent).toBeDefined();
    if (!sent) {
      throw new Error("expected queued message to be sent after socket open");
    }
    const parsed = JSON.parse(sent);
    expect(parsed).toEqual(message);
  });

  it("delivers inbound messages to the onMessage handler", () => {
    const received: InboundMessage[] = [];
    const channel = new AgentChannel({
      url: "ws://127.0.0.1:31339/ext",
      onMessage: (m) => received.push(m),
    });
    channel.start();
    const socket = getSocket(0);
    socket.open();
    socket.emit("message", { data: JSON.stringify({ type: "ack" }) });
    expect(received).toEqual([{ type: "ack" }]);
  });

  it("ignores unparseable inbound payloads", () => {
    const received: InboundMessage[] = [];
    const channel = new AgentChannel({
      url: "ws://127.0.0.1:31339/ext",
      onMessage: (m) => received.push(m),
    });
    channel.start();
    const socket = getSocket(0);
    socket.open();
    socket.emit("message", { data: "not json" });
    socket.emit("message", { data: JSON.stringify({ type: "unknown" }) });
    expect(received).toEqual([]);
  });

  it("reconnects after the socket closes", () => {
    vi.useFakeTimers();
    const channel = new AgentChannel({ url: "ws://127.0.0.1:31339/ext" });
    channel.start();
    const first = getSocket(0);
    first.open();
    first.close();
    vi.advanceTimersByTime(5_001);
    expect(FakeWebSocket.instances).toHaveLength(2);
    channel.stop();
  });
});
