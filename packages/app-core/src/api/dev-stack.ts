/**
 * Dev stack snapshot for tools and agents (Cursor, scripts).
 *
 * **Why this module:** IDEs do not auto-discover localhost or the Electrobun window. A single JSON
 * shape from `GET /api/dev/stack` gives ports, renderer URL, and which optional hooks (screenshot,
 * console tail) are configured — without scraping terminal output or launcher logs.
 *
 * Env is set by `scripts/dev-platform.mjs` when using `dev:desktop` / `dev:desktop:watch`; the API
 * handler may override `api.listenPort` / `api.baseUrl` from the bound socket so the JSON matches
 * the **accepted** TCP port (WHY: env can lag or describe intent; the socket is authoritative when
 * the request hits this server). Orchestrator-side `allocate-loopback-port` reduces mismatch for
 * desktop dev; embedded Electrobun also syncs env after bind.
 */

import {
  resolveDesktopApiPort,
  resolveDesktopUiPort,
} from "@miladyai/shared/runtime-env";

export const MILADY_DEV_STACK_SCHEMA = "milady.dev.stack/v1" as const;

export type MiladyDevStackPayload = {
  schema: typeof MILADY_DEV_STACK_SCHEMA;
  api: {
    /** Intended listen port (from MILADY_API_PORT / ELIZA_PORT). */
    listenPort: number;
    baseUrl: string;
  };
  desktop: {
    /** Vite or static renderer URL when desktop dev set MILADY_RENDERER_URL. */
    rendererUrl: string | null;
    /** Dashboard UI port when MILADY_PORT is set (desktop / Vite). */
    uiPort: number | null;
    /** Same base the Electrobun shell uses for API calls, when set. */
    desktopApiBase: string | null;
  };
  /**
   * When desktop dev enables MILADY_DESKTOP_SCREENSHOT_SERVER, the API proxies
   * a PNG from Electrobun (`GET …/api/dev/cursor-screenshot`, loopback only).
   */
  cursorScreenshot: {
    available: boolean;
    path: string | null;
  };
  /** Aggregated desktop dev child logs when dev-platform writes MILADY_DESKTOP_DEV_LOG_PATH. */
  desktopDevLog: {
    filePath: string | null;
    apiTailPath: string | null;
  };
  hints: string[];
};

function parsePositivePort(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : null;
}

/**
 * Build the JSON body for `GET /api/dev/stack`.
 */
export function resolveDevStackFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MiladyDevStackPayload {
  const apiPort = resolveDesktopApiPort(env);
  const uiPort =
    parsePositivePort(env.MILADY_PORT) ?? resolveDesktopUiPort(env);

  const rendererUrl = env.MILADY_RENDERER_URL?.trim() || null;
  const desktopApiBase = env.MILADY_DESKTOP_API_BASE?.trim() || null;
  const screenshotUpstream =
    env.MILADY_ELECTROBUN_SCREENSHOT_URL?.trim() || null;
  const devLogPath = env.MILADY_DESKTOP_DEV_LOG_PATH?.trim() || null;

  return {
    schema: MILADY_DEV_STACK_SCHEMA,
    api: {
      listenPort: apiPort,
      baseUrl: `http://127.0.0.1:${apiPort}`,
    },
    desktop: {
      rendererUrl,
      uiPort,
      desktopApiBase,
    },
    cursorScreenshot: {
      available: Boolean(screenshotUpstream),
      path: screenshotUpstream ? "/api/dev/cursor-screenshot" : null,
    },
    desktopDevLog: {
      filePath: devLogPath,
      apiTailPath: devLogPath ? "/api/dev/console-log" : null,
    },
    hints: [
      'Electrobun also binds an ephemeral localhost port for its own RPC (see launcher logs: "Server started at http://localhost:…"). That channel is not this API.',
      "With dev:desktop:watch, open desktop.rendererUrl in a browser or Browser MCP for UI parity when native-only bridges are not required.",
      "Full-screen PNG for agents: with desktop dev (screenshot server on by default), GET /api/dev/cursor-screenshot on the API (loopback). Capture uses OS screen APIs, not webview-only pixels.",
      "Aggregated vite/api/electrobun lines: GET /api/dev/console-log?maxLines=400&maxBytes=256000 (loopback) or read desktopDevLog.filePath.",
    ],
  };
}
