import { type AddressInfo, createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

function waitForPort(
  port: number,
  { timeout = 2000, interval = 100 } = {},
): Promise<void> {
  const { createConnection } = require("node:net");
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    let activeSocket: ReturnType<typeof createConnection> | null = null;

    function attempt() {
      if (Date.now() > deadline) {
        if (activeSocket) {
          activeSocket.destroy();
          activeSocket = null;
        }
        reject(
          new Error(
            `Timed out waiting for port ${port} after ${timeout / 1000}s`,
          ),
        );
        return;
      }
      activeSocket = createConnection({ port, host: "127.0.0.1" });
      activeSocket.once("connect", () => {
        activeSocket!.destroy();
        activeSocket = null;
        resolve();
      });
      activeSocket.once("error", () => {
        activeSocket!.destroy();
        activeSocket = null;
        setTimeout(attempt, interval);
      });
    }

    attempt();
  });
}

describe("waitForPort", () => {
  let server: ReturnType<typeof createServer> | null = null;

  afterEach(() => {
    server?.close();
    server = null;
  });

  it("resolves when port becomes available", async () => {
    server = createServer();
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    await expect(waitForPort(port, { timeout: 5000 })).resolves.toBeUndefined();
  });

  it("rejects on timeout without leaking sockets", async () => {
    await expect(
      waitForPort(1, { timeout: 300, interval: 50 }),
    ).rejects.toThrow("Timed out");
  });
});
