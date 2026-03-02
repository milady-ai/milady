/**
 * WebSocket IPC Server
 *
 * Replaces Electron's ipcMain with a local WebSocket server.
 * The BrowserWindow's preload shim connects here and routes all
 * window.electron.ipcRenderer.invoke / .on calls through this bridge.
 *
 * Ports:
 *   18999 — desktop app dev server (HTTP + WS on the same port)
 */

import fs from "node:fs";
import path from "node:path";

export type IpcHandler = (args: unknown[]) => Promise<unknown> | unknown;

const handlers = new Map<string, IpcHandler>();
const wsClients = new Set<import("bun").ServerWebSocket<unknown>>();

let server: ReturnType<typeof Bun.serve> | null = null;
let resolvedPort: number | null = null;

/** The dist directory of the React app */
let webDistDir = "";

/** The JavaScript shim injected into the served HTML */
let shimScript = "";

/**
 * Register a handler for the given IPC channel.
 * Replaces ipcMain.handle(channel, handler).
 */
export function handle(channel: string, fn: IpcHandler): void {
  handlers.set(channel, fn);
}

/**
 * Push an event to all connected webviews.
 * Replaces mainWindow.webContents.send(channel, data).
 */
export function pushToRenderer(channel: string, data: unknown): void {
  const msg = JSON.stringify({ type: "push", channel, data });
  for (const ws of wsClients) {
    try {
      ws.send(msg);
    } catch {
      wsClients.delete(ws);
    }
  }
}

/**
 * Execute JavaScript in all connected webviews.
 * Used for API base injection and share-target payloads.
 */
export function executeJavascript(script: string): void {
  // Wrap in a push message that the shim will eval
  const msg = JSON.stringify({ type: "eval", script });
  for (const ws of wsClients) {
    try {
      ws.send(msg);
    } catch {
      wsClients.delete(ws);
    }
  }
}

async function handleRequest(
  channel: string,
  args: unknown[],
): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`No IPC handler registered for channel: ${channel}`);
  }
  return handler(args);
}

function buildHtml(distDir: string, port: number): string {
  const indexPath = path.join(distDir, "index.html");
  let html = "";
  try {
    html = fs.readFileSync(indexPath, "utf-8");
  } catch {
    html = `<!DOCTYPE html><html><head></head><body>
      <p style="font-family:sans-serif;padding:24px">
        Milady failed to load — dist/index.html not found at ${indexPath}.
        Run <code>bun run build</code> from apps/app first.
      </p>
    </body></html>`;
  }

  // Inject the shim before any other scripts
  const shim = buildShim(port);
  return html.replace("<head>", `<head>\n<script>\n${shim}\n</script>`);
}

function buildShim(port: number): string {
  return `
(function() {
  var IPC_PORT = ${port};
  var ws = null;
  var wsReady = false;
  var pending = new Map();
  var pushListeners = new Map();
  var reqId = 0;
  var connectAttempts = 0;

  function connect() {
    connectAttempts++;
    try {
      ws = new WebSocket('ws://localhost:' + IPC_PORT);
    } catch (e) {
      setTimeout(connect, 1000);
      return;
    }

    ws.onopen = function() {
      wsReady = true;
      connectAttempts = 0;
    };

    ws.onclose = function() {
      wsReady = false;
      ws = null;
      setTimeout(connect, connectAttempts < 5 ? 500 : 2000);
    };

    ws.onerror = function() {
      wsReady = false;
    };

    ws.onmessage = function(event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'response') {
        var p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error));
          else p.resolve(msg.result);
        }
      } else if (msg.type === 'push') {
        var listeners = pushListeners.get(msg.channel);
        if (listeners) {
          listeners.forEach(function(fn) {
            try { fn(msg.data); } catch (e) { console.error('[IPC shim] push listener error', e); }
          });
        }
      } else if (msg.type === 'eval') {
        try { new Function(msg.script)(); } catch (e) { console.error('[IPC shim] eval error', e); }
      }
    };
  }

  connect();

  function sendWs(payload) {
    if (wsReady && ws) {
      ws.send(JSON.stringify(payload));
    } else {
      // Retry after a short delay once the socket opens
      var interval = setInterval(function() {
        if (wsReady && ws) {
          clearInterval(interval);
          ws.send(JSON.stringify(payload));
        }
      }, 20);
    }
  }

  function invoke(channel) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function(resolve, reject) {
      var id = ++reqId;
      pending.set(id, { resolve: resolve, reject: reject });
      sendWs({ type: 'invoke', id: id, channel: channel, args: args });
    });
  }

  function onChannel(channel, listener) {
    if (!pushListeners.has(channel)) pushListeners.set(channel, []);
    pushListeners.get(channel).push(listener);
  }

  function removeListener(channel, listener) {
    var listeners = pushListeners.get(channel);
    if (!listeners) return;
    var idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  }

  window.electron = {
    ipcRenderer: {
      invoke: invoke,
      send: function(channel) {
        var args = Array.prototype.slice.call(arguments, 1);
        invoke.apply(null, [channel].concat(args)).catch(function() {});
      },
      on: onChannel,
      once: function(channel, listener) {
        var wrapper = function() {
          removeListener(channel, wrapper);
          listener.apply(null, arguments);
        };
        onChannel(channel, wrapper);
      },
      removeListener: removeListener,
      removeAllListeners: function(channel) {
        pushListeners.delete(channel);
      }
    },
    desktopCapturer: {
      getSources: function(options) {
        return invoke('screencapture:getSources').then(function(result) {
          return (result && result.sources) ? result.sources : [];
        });
      }
    },
    platform: {
      isMac: navigator.platform.indexOf('Mac') >= 0,
      isWindows: navigator.platform.indexOf('Win') >= 0,
      isLinux: navigator.platform.indexOf('Mac') < 0 && navigator.platform.indexOf('Win') < 0,
      arch: 'unknown',
      version: ''
    }
  };

  // Fetch accurate platform info once the socket is ready
  var infoInterval = setInterval(function() {
    if (wsReady) {
      clearInterval(infoInterval);
      invoke('desktop:getVersion').then(function(info) {
        if (info) {
          window.electron.platform.version = info.version || '';
          window.electron.platform.arch = info.arch || 'unknown';
        }
      }).catch(function() {});
    }
  }, 100);
})();
`;
}

/** Start the IPC server and React app dev server on the given port. */
export async function startIpcServer(opts: {
  distDir: string;
  port?: number;
}): Promise<{ port: number }> {
  webDistDir = opts.distDir;
  const preferredPort = opts.port ?? 18999;
  shimScript = buildShim(preferredPort);

  // Try preferred port, fall back if busy
  for (let p = preferredPort; p < preferredPort + 20; p++) {
    try {
      server = Bun.serve({
        port: p,
        fetch(req, srv) {
          // WebSocket upgrade
          if (req.headers.get("Upgrade")?.toLowerCase() === "websocket") {
            srv.upgrade(req, { data: null });
            return;
          }

          const url = new URL(req.url);
          const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

          // Serve HTML with shim injected
          if (pathname === "/index.html" || pathname.endsWith(".html")) {
            const html = buildHtml(webDistDir, p);
            return new Response(html, {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            });
          }

          // Serve static assets
          const filePath = path.join(webDistDir, pathname);
          const file = Bun.file(filePath);
          return new Response(file);
        },

        websocket: {
          open(ws) {
            wsClients.add(ws);
          },
          close(ws) {
            wsClients.delete(ws);
          },
          async message(ws, raw) {
            let msg: { type: string; id: number; channel: string; args: unknown[] };
            try {
              msg = JSON.parse(raw as string);
            } catch {
              return;
            }

            if (msg.type === "invoke") {
              try {
                const result = await handleRequest(msg.channel, msg.args ?? []);
                ws.send(
                  JSON.stringify({ type: "response", id: msg.id, result }),
                );
              } catch (err) {
                ws.send(
                  JSON.stringify({
                    type: "response",
                    id: msg.id,
                    error:
                      err instanceof Error ? err.message : String(err),
                  }),
                );
              }
            }
          },
        },
      });

      resolvedPort = p;
      console.info(`[IPC] WebSocket + dev server on port ${p}`);
      return { port: p };
    } catch {
      // Port busy, try next
    }
  }

  throw new Error(
    `[IPC] Could not bind to any port in range ${preferredPort}–${preferredPort + 19}`,
  );
}

export function getPort(): number | null {
  return resolvedPort;
}

export function stopIpcServer(): void {
  server?.stop();
  server = null;
  wsClients.clear();
}
