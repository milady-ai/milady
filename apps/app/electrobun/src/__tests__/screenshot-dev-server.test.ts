import http from "node:http";
import { createServer as createNetServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

const takeScreenshot = vi.fn();

vi.mock("../native/screencapture", () => ({
  getScreenCaptureManager: () => ({ takeScreenshot }),
}));

async function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const port = typeof a === "object" && a && "port" in a ? a.port : 0;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function httpGet(
  port: number,
  path: string,
  headers?: http.OutgoingHttpHeaders,
): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET", headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("screenshot-dev-server", () => {
  const saved = { ...process.env };

  afterEach(() => {
    vi.resetModules();
    takeScreenshot.mockReset();
    process.env = { ...saved };
  });

  it("returns undefined when MILADY_DESKTOP_SCREENSHOT_SERVER is off", async () => {
    process.env.MILADY_DESKTOP_SCREENSHOT_SERVER = "0";
    const { startScreenshotDevServer } = await import(
      "../screenshot-dev-server.js"
    );
    expect(startScreenshotDevServer()).toBeUndefined();
  });

  it("returns 401 when token is configured but Authorization is missing", async () => {
    const port = await reserveLoopbackPort();
    process.env.MILADY_DESKTOP_SCREENSHOT_SERVER = "1";
    process.env.MILADY_SCREENSHOT_SERVER_PORT = String(port);
    process.env.MILADY_SCREENSHOT_SERVER_TOKEN = "dev-token-xyz";
    takeScreenshot.mockResolvedValue({
      available: true,
      data: "data:image/png;base64,AAAA",
    });
    const { startScreenshotDevServer } = await import(
      "../screenshot-dev-server.js"
    );
    const stop = startScreenshotDevServer();
    expect(stop).toBeTypeOf("function");
    await new Promise((r) => setTimeout(r, 80));
    const res = await httpGet(port, "/cursor-screenshot.png");
    expect(res.status).toBe(401);
    stop?.();
  });

  it("returns 200 PNG when Bearer token matches", async () => {
    const port = await reserveLoopbackPort();
    process.env.MILADY_DESKTOP_SCREENSHOT_SERVER = "true";
    process.env.MILADY_SCREENSHOT_SERVER_PORT = String(port);
    process.env.MILADY_SCREENSHOT_SERVER_TOKEN = "ok-token";
    takeScreenshot.mockResolvedValue({
      available: true,
      data: "data:image/png;base64,Zm9v",
    });
    const { startScreenshotDevServer } = await import(
      "../screenshot-dev-server.js"
    );
    const stop = startScreenshotDevServer();
    if (stop === undefined) throw new Error("expected screenshot server");
    await new Promise((r) => setTimeout(r, 80));
    const res = await httpGet(port, "/cursor-screenshot.png", {
      Authorization: "Bearer ok-token",
    });
    expect(res.status).toBe(200);
    expect(res.body.equals(Buffer.from("foo", "utf8"))).toBe(true);
    stop();
  });

  it("returns 405 for non-GET", async () => {
    const port = await reserveLoopbackPort();
    process.env.MILADY_DESKTOP_SCREENSHOT_SERVER = "yes";
    process.env.MILADY_SCREENSHOT_SERVER_PORT = String(port);
    const { startScreenshotDevServer } = await import(
      "../screenshot-dev-server.js"
    );
    const stop = startScreenshotDevServer();
    if (stop === undefined) throw new Error("expected screenshot server");
    await new Promise((r) => setTimeout(r, 80));
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/cursor-screenshot.png",
          method: "POST",
        },
        (r) => {
          resolve(r.statusCode ?? 0);
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(405);
    stop();
  });

  it("returns 404 for wrong path", async () => {
    const port = await reserveLoopbackPort();
    process.env.MILADY_DESKTOP_SCREENSHOT_SERVER = "1";
    process.env.MILADY_SCREENSHOT_SERVER_PORT = String(port);
    const { startScreenshotDevServer } = await import(
      "../screenshot-dev-server.js"
    );
    const stop = startScreenshotDevServer();
    if (stop === undefined) throw new Error("expected screenshot server");
    await new Promise((r) => setTimeout(r, 80));
    const res = await httpGet(port, "/nope.png");
    expect(res.status).toBe(404);
    stop();
  });
});
