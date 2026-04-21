import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { findFirstAvailableLoopbackPort } from "../loopback-port";

describe("findFirstAvailableLoopbackPort", () => {
  const holders: ReturnType<typeof createServer>[] = [];

  afterEach(() => {
    for (const s of holders.splice(0)) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
  });

  it("returns preferred when it is free", async () => {
    const p = await findFirstAvailableLoopbackPort(45_000);
    expect(p).toBe(45_000);
  });

  it("skips occupied ports", async () => {
    const server = createServer();
    holders.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ port: 45_010, host: "127.0.0.1" }, () => resolve());
    });
    const p = await findFirstAvailableLoopbackPort(45_010, { maxHops: 5 });
    expect(p).toBe(45_011);
  });
});
