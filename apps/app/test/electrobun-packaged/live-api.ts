import http from "node:http";
import type { AddressInfo } from "node:net";

export interface TestApiServerOptions {
  port?: number;
  onboardingComplete?: boolean;
}

export interface TestApiServer {
  baseUrl: string;
  requests: string[];
  close: () => Promise<void>;
}

async function readBody(
  req: http.IncomingMessage,
): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return Buffer.concat(chunks);
}

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function jsonResponse(res: http.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader(
    "access-control-allow-methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.setHeader("access-control-allow-headers", "content-type,authorization");
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function responseBodyFor(pathname: string, method: string): unknown {
  if (method === "OPTIONS") {
    return {};
  }
  if (pathname === "/api/status") {
    return {
      ok: true,
      status: "ok",
      onboardingComplete: true,
      agent: { name: "PackagedDesktopTest" },
    };
  }
  if (pathname === "/api/config") {
    return {
      onboardingComplete: true,
      api: { status: "ok" },
      agent: { name: "PackagedDesktopTest" },
    };
  }
  if (pathname === "/api/onboarding" && method === "POST") {
    return { success: true, onboardingComplete: true };
  }
  if (pathname === "/api/triggers") {
    return { triggers: [] };
  }
  if (pathname === "/api/drop/status") {
    return { ok: true, running: false };
  }
  if (pathname === "/api/stream/settings") {
    return { enabled: false };
  }
  return { ok: true };
}

export async function startLiveApiServer(
  options: TestApiServerOptions = {},
): Promise<TestApiServer> {
  let proxy: http.Server | null = null;

  try {
    const requests: string[] = [];
    proxy = http.createServer(async (req, res) => {
      const method = (req.method ?? "GET").toUpperCase();
      const targetUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      requests.push(`${method} ${targetUrl.pathname}`);

      if (method !== "GET" && method !== "HEAD") {
        await readBody(req);
      }
      if (method === "HEAD") {
        res.statusCode = 200;
        res.setHeader("access-control-allow-origin", "*");
        res.end();
        return;
      }
      jsonResponse(res, 200, responseBodyFor(targetUrl.pathname, method));
    });

    await listen(proxy, options.port ?? 0);
    const address = proxy.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve packaged live API proxy address.");
    }
    const server = proxy;

    return {
      baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
      requests,
      close: async () => {
        await closeServer(server).catch(() => undefined);
      },
    };
  } catch (error) {
    if (proxy) {
      await closeServer(proxy).catch(() => undefined);
    }
    throw error;
  }
}
