import { createServer } from "node:net";

function tryBindOnce(
  port: number,
  host: string,
): Promise<{ ok: true } | { ok: false }> {
  return new Promise((resolve) => {
    const server = createServer();
    // Timeout prevents hanging on Windows when firewall silently blocks
    const timer = setTimeout(() => {
      server.removeAllListeners();
      try {
        server.close();
      } catch {
        /* already closed */
      }
      resolve({ ok: false });
    }, 3000);
    const fail = () => {
      clearTimeout(timer);
      server.removeAllListeners();
      resolve({ ok: false });
    };
    server.once("error", fail);
    server.listen({ port, host }, () => {
      clearTimeout(timer);
      server.close(() => resolve({ ok: true }));
    });
  });
}

/**
 * Returns the first port in `[preferred, preferred+1, …)` that can be bound
 * on `host`, or throws if none found within `maxHops` attempts.
 */
export async function findFirstAvailableLoopbackPort(
  preferred: number,
  options?: { host?: string; maxHops?: number },
): Promise<number> {
  const host = options?.host ?? "127.0.0.1";
  const maxHops = options?.maxHops ?? 64;
  if (!Number.isFinite(preferred) || preferred < 1 || preferred > 65535) {
    throw new Error(`Invalid preferred port: ${preferred}`);
  }
  for (let i = 0; i < maxHops; i++) {
    const port = preferred + i;
    if (port > 65535) break;
    const result = await tryBindOnce(port, host);
    if (result.ok) {
      return port;
    }
  }
  throw new Error(
    `No free TCP port on ${host} in range ${preferred}–${preferred + maxHops - 1}`,
  );
}
