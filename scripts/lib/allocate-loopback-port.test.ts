import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { allocateFirstFreeLoopbackPort } from "./allocate-loopback-port.mjs";

describe("allocateFirstFreeLoopbackPort", () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(() => {
    for (const s of servers.splice(0)) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
  });

  it("returns preferred when free", async () => {
    const p = await allocateFirstFreeLoopbackPort(45_200);
    expect(p).toBe(45_200);
  });

  it("advances when preferred is held", async () => {
    const server = createServer();
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ port: 45_210, host: "127.0.0.1" }, () => resolve());
    });
    const p = await allocateFirstFreeLoopbackPort(45_210, { maxHops: 5 });
    expect(p).toBe(45_211);
  });

  it("throws when no free port exists within maxHops", async () => {
    const serverA = createServer();
    const serverB = createServer();
    servers.push(serverA, serverB);
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        serverA.once("error", reject);
        serverA.listen({ port: 45_220, host: "127.0.0.1" }, () => resolve());
      }),
      new Promise<void>((resolve, reject) => {
        serverB.once("error", reject);
        serverB.listen({ port: 45_221, host: "127.0.0.1" }, () => resolve());
      }),
    ]);

    await expect(
      allocateFirstFreeLoopbackPort(45_220, { maxHops: 2 }),
    ).rejects.toThrow(/No free TCP port/);
  });
});
