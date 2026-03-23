/**
 * Dev-only localhost server so tools can fetch a PNG without talking to WKWebView APIs.
 *
 * **Why separate HTTP in Electrobun:** the Milady API process cannot capture the desktop; capture
 * runs in the shell process via ScreenCaptureManager → OS tools (e.g. macOS `screencapture`).
 *
 * **Why full screen (for now):** reuses battle-tested `takeScreenshot()`; window-ID capture is
 * platform-specific and not wired here yet.
 *
 * **Why loopback + optional token:** reduces accidental exposure on shared machines; dev-platform
 * generates a session token and the API proxy adds a single URL on the familiar API port.
 *
 * Enable with MILADY_DESKTOP_SCREENSHOT_SERVER=`1` / `true` / `yes` (dev-platform sets `1` by default
 * for `dev:desktop:*`). Port: MILADY_SCREENSHOT_SERVER_PORT (default 31339). Auth: MILADY_SCREENSHOT_SERVER_TOKEN
 * as Bearer or ?token=.
 *
 * **Why 503 with no PNG on macOS:** `takeScreenshot()` runs `screencapture`; without **Screen Recording**
 * for this app (or the parent terminal), TCC blocks capture and no file is produced—indistinguishable
 * from other failures here, so we return JSON `{ error: … }` and rely on docs + API proxy `hint`.
 */

import http from "node:http";
import { getScreenCaptureManager } from "./native/screencapture";

function isLoopback(addr: string | undefined): boolean {
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

/**
 * @returns Cleanup to close the server, or `undefined` when disabled.
 */
export function startScreenshotDevServer(): (() => void) | undefined {
  const raw =
    process.env.MILADY_DESKTOP_SCREENSHOT_SERVER?.trim().toLowerCase();
  const enabled = raw === "1" || raw === "true" || raw === "yes";
  if (!enabled) {
    return undefined;
  }

  const port = Number(process.env.MILADY_SCREENSHOT_SERVER_PORT) || 31339;
  const token = process.env.MILADY_SCREENSHOT_SERVER_TOKEN?.trim() ?? "";

  const server = http.createServer(async (req, res) => {
    try {
      if (!isLoopback(req.socket.remoteAddress)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("forbidden");
        return;
      }
      if (req.method !== "GET") {
        res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("method not allowed");
        return;
      }

      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      if (u.pathname !== "/cursor-screenshot.png") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }

      if (token) {
        const auth = req.headers.authorization;
        const q = u.searchParams.get("token");
        const ok = auth === `Bearer ${token}` || (q != null && q === token);
        if (!ok) {
          res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("unauthorized");
          return;
        }
      }

      const shot = await getScreenCaptureManager().takeScreenshot();
      if (!shot.available || !shot.data) {
        // WHY 503: macOS often means Screen Recording off for this process; see module doc + desktop-local-development.md
        res.writeHead(503, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(
          JSON.stringify({ error: "screen capture failed or unavailable" }),
        );
        return;
      }

      const prefix = "data:image/png;base64,";
      const b64 = shot.data.startsWith(prefix)
        ? shot.data.slice(prefix.length)
        : shot.data.replace(/^data:[^;]+;base64,/, "");
      const buf = Buffer.from(b64, "base64");
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      });
      res.end(buf);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end("error");
    }
  });

  // WHY before listen(): Node emits "error" on bind failure (e.g. EADDRINUSE).
  // Without a listener, that becomes an unhandled error and can crash Electrobun.
  server.on("error", (err: NodeJS.ErrnoException) => {
    const inUse = err.code === "EADDRINUSE";
    console.warn(
      `[ScreenshotDev] Failed to start loopback server on 127.0.0.1:${port}: ${err.message}` +
        (inUse
          ? " (port in use — set MILADY_SCREENSHOT_SERVER_PORT to a free port or stop the other process)"
          : ""),
    );
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(
      `[ScreenshotDev] http://127.0.0.1:${port}/cursor-screenshot.png (loopback only` +
        (token ? "; token required" : "") +
        ")",
    );
  });

  return () => {
    server.close();
  };
}
