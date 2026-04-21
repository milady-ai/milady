import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerMock, serverQueue } = vi.hoisted(() => ({
  createServerMock: vi.fn(),
  serverQueue: [] as Array<ReturnType<typeof createMockServer>>,
}));

vi.mock("node:net", () => ({
  createServer: createServerMock,
}));

function createMockServer(opts?: {
  errorOnListen?: boolean;
  skipCloseCallback?: boolean;
}) {
  let errorHandler: (() => void) | null = null;

  const server = {
    removeAllListeners: vi.fn(),
    unref: vi.fn(),
    once: vi.fn((event: string, handler: () => void) => {
      if (event === "error") {
        errorHandler = handler;
      }
      return server;
    }),
    listen: vi.fn((_options: unknown, onListen: () => void) => {
      setTimeout(() => {
        if (opts?.errorOnListen) {
          errorHandler?.();
          return;
        }
        onListen();
      }, 0);
      return server;
    }),
    close: vi.fn((onClose?: () => void) => {
      if (!opts?.skipCloseCallback && onClose) {
        setTimeout(() => onClose(), 0);
      }
      return server;
    }),
  };

  return server;
}

import { findFirstAvailableLoopbackPort } from "../native/loopback-port";

describe("findFirstAvailableLoopbackPort", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    serverQueue.length = 0;
    createServerMock.mockReset();
    createServerMock.mockImplementation(() => {
      const next = serverQueue.shift();
      if (!next) {
        throw new Error("No queued mock server");
      }
      return next;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the preferred port when bind and close succeed", async () => {
    serverQueue.push(createMockServer());

    const portPromise = findFirstAvailableLoopbackPort(31337);
    await vi.runAllTimersAsync();

    await expect(portPromise).resolves.toBe(31337);
  });

  it("falls forward when the preferred port errors", async () => {
    serverQueue.push(createMockServer({ errorOnListen: true }));
    serverQueue.push(createMockServer());

    const portPromise = findFirstAvailableLoopbackPort(31337);
    await vi.runAllTimersAsync();

    await expect(portPromise).resolves.toBe(31338);
  });

  it("does not hang when the close callback never fires after a successful bind", async () => {
    const hangingCloseServer = createMockServer({ skipCloseCallback: true });
    serverQueue.push(hangingCloseServer);

    let resolvedPort: number | null = null;
    const portPromise = findFirstAvailableLoopbackPort(31337).then((port) => {
      resolvedPort = port;
      return port;
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(resolvedPort).toBeNull();

    await vi.advanceTimersByTimeAsync(1);

    await expect(portPromise).resolves.toBe(31337);
    expect(hangingCloseServer.unref).toHaveBeenCalledTimes(1);
    expect(hangingCloseServer.close).toHaveBeenCalledTimes(1);
  });
});
