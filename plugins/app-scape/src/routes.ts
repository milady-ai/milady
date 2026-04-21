import { decode, encode } from "@toon-format/toon";
import type { IAgentRuntime } from "@elizaos/core";
import type {
    AppLaunchDiagnostic,
    AppLaunchResult,
    AppSessionState,
} from "@miladyai/shared/contracts/apps";

import type { ScapeGameService } from "./services/game-service.js";

/**
 * HTTP route handlers for `@elizaos/app-scape`.
 *
 * PR 2 scope: serve the viewer iframe for the xRSPS React client and
 * provide the minimum `resolveLaunchSession` / `handleAppRoutes` exports
 * the milady host expects. No bot-SDK connection, no session commands,
 * no journal — those land in PR 3+.
 *
 * The viewer route (`GET /api/apps/scape/viewer`) returns a tiny HTML
 * shell whose only content is a full-page iframe pointing at the
 * configured xRSPS client URL. We set the cross-origin isolation
 * headers the xRSPS client needs (it uses WebWorkers / wasm
 * SharedArrayBuffer for `threads.js` and the sharp / xxhash-wasm
 * pipelines), and we relax `frame-ancestors` so milady can embed the
 * viewer from electrobun, capacitor, and localhost dev hosts.
 *
 * Why a wrapper HTML and not a direct `launchUrl` iframe? Two reasons:
 *
 *   1. The xRSPS client is served by the craco dev server which sets
 *      its own CSP. We want our own CSP frame-ancestors controlling
 *      where milady hosts can embed us, without mutating the client.
 *   2. Serving the wrapper from the milady host gives us a single URL
 *      to point authenticated sessions at in PR 3+ (we'll inject a
 *      postMessage bridge for auto-login).
 */

const APP_NAME = "@elizaos/app-scape";
const APP_DISPLAY_NAME = "'scape";
const VIEWER_ROUTE_PATH = "/api/apps/scape/viewer";
const DEFAULT_CLIENT_URL = "http://localhost:3000";

// Same hosts the defense plugin whitelists; covers every runtime that
// might embed the milady apps grid (browser, Electrobun native window,
// Capacitor mobile, Tauri, vscode webview, file://).
const VIEWER_FRAME_ANCESTORS_DIRECTIVE =
    "frame-ancestors 'self' http://localhost:* http://127.0.0.1:* " +
    "http://[::1]:* http://[0:0:0:0:0:0:0:1]:* https://localhost:* " +
    "https://127.0.0.1:* https://[::1]:* https://[0:0:0:0:0:0:0:1]:* " +
    "electrobun: capacitor: capacitor-electron: app: tauri: file:";

// ---------------------------------------------------------------------------
// Context types (inlined from packages/agent to keep this plugin
// free of circular deps — same pattern babylon and defense use)
// ---------------------------------------------------------------------------

interface AppLaunchSessionContext {
    appName: string;
    launchUrl: string | null;
    runtime: IAgentRuntime | null;
    viewer: AppLaunchResult["viewer"] | null;
}

interface AppRunSessionContext extends AppLaunchSessionContext {
    runId: string;
    session: AppSessionState | null;
}

// ---------------------------------------------------------------------------
// Settings resolution
// ---------------------------------------------------------------------------

interface RuntimeLike {
    character?: {
        settings?: { secrets?: Record<string, string> };
        secrets?: Record<string, string>;
    };
    getSetting?: (key: string) => string | null | undefined;
}

function asRuntimeLike(runtime: unknown | null): RuntimeLike | null {
    if (!runtime || typeof runtime !== "object") return null;
    return runtime as RuntimeLike;
}

/**
 * Read a setting from either the milady runtime (character secrets) or
 * the process env, in that order. Lets operators configure the plugin
 * per-character in a deployed milady instance or globally via env.
 */
function resolveSettingLike(
    runtime: IAgentRuntime | null,
    key: string,
): string | undefined {
    const rt = asRuntimeLike(runtime);
    if (rt?.getSetting) {
        const fromRuntime = rt.getSetting(key);
        if (typeof fromRuntime === "string" && fromRuntime.trim().length > 0) {
            return fromRuntime.trim();
        }
    }
    const fromSecrets =
        rt?.character?.settings?.secrets?.[key] ?? rt?.character?.secrets?.[key];
    if (typeof fromSecrets === "string" && fromSecrets.trim().length > 0) {
        return fromSecrets.trim();
    }
    const fromEnv = process.env[key];
    if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
        return fromEnv.trim();
    }
    return undefined;
}

function resolveClientUrl(runtime: IAgentRuntime | null): string {
    return resolveSettingLike(runtime, "SCAPE_CLIENT_URL") ?? DEFAULT_CLIENT_URL;
}

// ---------------------------------------------------------------------------
// Viewer HTML
// ---------------------------------------------------------------------------

function buildViewerHtml(clientUrl: string): string {
    // Escape the URL for use in an HTML attribute. URLs shouldn't contain
    // these chars in normal use, but we prefer being safe over being lucky.
    const escaped = clientUrl.replace(/[&<>"']/g, (ch) => {
        switch (ch) {
            case "&":
                return "&amp;";
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case '"':
                return "&quot;";
            default:
                return "&#39;";
        }
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${APP_DISPLAY_NAME}</title>
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: #000;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #ccc;
  }
  #scape-frame {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    background: #000;
  }
  #scape-fallback {
    position: fixed;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    padding: 2rem;
    text-align: center;
  }
  #scape-fallback code {
    background: #1a1a1a;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    color: #f4b942;
  }
</style>
</head>
<body>
  <iframe
    id="scape-frame"
    src="${escaped}"
    allow="autoplay; fullscreen; clipboard-read; clipboard-write"
    sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
  ></iframe>
  <div id="scape-fallback">
    <h2>xRSPS client is not reachable</h2>
    <p>The 'scape plugin is trying to embed <code>${escaped}</code>.</p>
    <p>Start the xRSPS dev stack with <code>bun run dev</code>, or set
       <code>SCAPE_CLIENT_URL</code> to your deployed client.</p>
  </div>
  <script>
    // If the iframe fails to load within 5 seconds, flip to the
    // fallback message so operators know where to look.
    (function () {
      var frame = document.getElementById("scape-frame");
      var fallback = document.getElementById("scape-fallback");
      var loaded = false;
      frame.addEventListener("load", function () { loaded = true; });
      setTimeout(function () {
        if (!loaded) {
          frame.style.display = "none";
          fallback.style.display = "flex";
        }
      }, 5000);
    })();
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Response helpers (same shape defense / babylon use)
// ---------------------------------------------------------------------------

interface MutableResponse {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    removeHeader?: (name: string) => void;
    getHeader?: (name: string) => number | string | string[] | undefined;
    end: (body?: string) => void;
}

function applyViewerEmbedHeaders(response: MutableResponse): void {
    response.removeHeader?.("X-Frame-Options");

    const existingCsp = response.getHeader?.("Content-Security-Policy");
    const normalizedExisting =
        typeof existingCsp === "string"
            ? existingCsp.trim()
            : Array.isArray(existingCsp)
                ? existingCsp.join("; ").trim()
                : "";
    const nextCsp = /\bframe-ancestors\b/i.test(normalizedExisting)
        ? normalizedExisting
        : normalizedExisting.length > 0
            ? `${normalizedExisting}; ${VIEWER_FRAME_ANCESTORS_DIRECTIVE}`
            : VIEWER_FRAME_ANCESTORS_DIRECTIVE;
    response.setHeader("Content-Security-Policy", nextCsp);

    // xRSPS client uses wasm threads.js + SharedArrayBuffer; these
    // headers opt the page into cross-origin isolation, which the
    // iframe's WebWorkers need.
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function sendHtmlResponse(res: unknown, html: string): void {
    const response = res as MutableResponse;
    response.statusCode = 200;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    applyViewerEmbedHeaders(response);
    response.end(html);
}

// ---------------------------------------------------------------------------
// Public exports — these match the shape the milady host imports from
// every curated app plugin.
// ---------------------------------------------------------------------------

/**
 * Build the session state returned by a launch. PR 2 returns a minimal
 * placeholder — the real agent lifecycle (connect, LLM loop, journal,
 * directed prompts) moves through this return type in PR 3–7.
 */
function buildPlaceholderSession(
    runtime: IAgentRuntime | null,
): AppSessionState {
    const clientUrl = resolveClientUrl(runtime);
    return {
        sessionId: `scape:${Date.now()}`,
        appName: APP_NAME,
        mode: "spectate-and-steer",
        status: "ready",
        displayName: APP_DISPLAY_NAME,
        summary: `Embedding xRSPS client at ${clientUrl}. Agent loop lands in PR 3+.`,
        canSendCommands: false,
        controls: [],
        suggestedPrompts: [
            "Connect to xRSPS and introduce yourself.",
            "Walk to the Lumbridge cows and train attack.",
            "Check the inventory and bank what's there.",
        ],
        recommendations: [],
        activity: [],
        telemetry: null,
    };
}

export async function resolveLaunchSession(
    ctx: AppLaunchSessionContext,
): Promise<AppLaunchResult["session"]> {
    return buildPlaceholderSession(ctx.runtime);
}

export async function refreshRunSession(
    ctx: AppRunSessionContext,
): Promise<AppLaunchResult["session"]> {
    return buildPlaceholderSession(ctx.runtime);
}

export async function collectLaunchDiagnostics(_ctx: {
    runtime: IAgentRuntime | null;
    session: AppSessionState | null;
}): Promise<AppLaunchDiagnostic[]> {
    // No diagnostics in PR 2 — the plugin is purely a launcher wrapper.
    return [];
}

/**
 * Main HTTP entry point for `/api/apps/scape/*`. Returns true when the
 * plugin handled the request, false to let the host dispatch it
 * elsewhere (currently there's only the viewer route to handle).
 */
export async function handleAppRoutes(ctx: {
    method: string;
    pathname: string;
    url?: URL;
    runtime: unknown | null;
    error: (response: unknown, message: string, status?: number) => void;
    json: (response: unknown, data: unknown, status?: number) => void;
    readJsonBody: () => Promise<unknown>;
    res: unknown;
}): Promise<boolean> {
    if (ctx.method === "GET" && ctx.pathname === VIEWER_ROUTE_PATH) {
        try {
            const runtime = (asRuntimeLike(ctx.runtime) as IAgentRuntime | null) ?? null;
            const clientUrl = resolveClientUrl(runtime);
            sendHtmlResponse(ctx.res, buildViewerHtml(clientUrl));
        } catch (error) {
            ctx.error(
                ctx.res,
                error instanceof Error
                    ? error.message
                    : "Failed to render 'scape viewer.",
                500,
            );
        }
        return true;
    }

    // POST /api/apps/scape/prompt — operator steering directive.
    // Request body is TOON. Accepted shapes:
    //   text: "go mine copper"
    //     OR
    //   prompt: "go mine copper"
    //     OR
    //   directive: "go mine copper"
    if (ctx.method === "POST" && ctx.pathname === PROMPT_ROUTE_PATH) {
        try {
            const runtime = (asRuntimeLike(ctx.runtime) as IAgentRuntime | null) ?? null;
            const service = runtime?.getService?.("scape_game") as unknown as ScapeGameService | null;
            if (!service) {
                sendToonResponse(ctx.res, 503, { error: "scape_game service not available" });
                return true;
            }

            const body = await ctx.readJsonBody();
            const text = extractPromptText(body);
            if (!text) {
                sendToonResponse(ctx.res, 400, {
                    error: "expected TOON body with `text`, `prompt`, or `directive`",
                });
                return true;
            }

            service.setOperatorGoal(text);
            sendToonResponse(ctx.res, 200, {
                accepted: true,
                text,
                note: "operator goal set; next LLM step will prioritize this directive",
            });
        } catch (error) {
            sendToonResponse(ctx.res, 500, {
                error: error instanceof Error ? error.message : "Failed to accept prompt",
            });
        }
        return true;
    }

    // GET /api/apps/scape/journal — return recent memories as TOON.
    if (ctx.method === "GET" && ctx.pathname === JOURNAL_ROUTE_PATH) {
        try {
            const runtime = (asRuntimeLike(ctx.runtime) as IAgentRuntime | null) ?? null;
            const service = runtime?.getService?.("scape_game") as unknown as ScapeGameService | null;
            const journal = service?.getJournalService?.();
            if (!journal) {
                sendToonResponse(ctx.res, 503, { error: "journal not available" });
                return true;
            }
            const state = journal.getState();
            sendToonResponse(ctx.res, 200, {
                agentId: state.agentId,
                displayName: state.displayName,
                sessionCount: state.sessionCount,
                memories: state.memories,
                updatedAt: state.updatedAt,
            });
        } catch (error) {
            sendToonResponse(ctx.res, 500, {
                error: error instanceof Error ? error.message : "Failed to read journal",
            });
        }
        return true;
    }

    // GET /api/apps/scape/goals — return all known goals as TOON.
    if (ctx.method === "GET" && ctx.pathname === GOALS_ROUTE_PATH) {
        try {
            const runtime = (asRuntimeLike(ctx.runtime) as IAgentRuntime | null) ?? null;
            const service = runtime?.getService?.("scape_game") as unknown as ScapeGameService | null;
            const journal = service?.getJournalService?.();
            if (!journal) {
                sendToonResponse(ctx.res, 503, { error: "journal not available" });
                return true;
            }
            const active = journal.getActiveGoal();
            const all = journal.getGoals();
            sendToonResponse(ctx.res, 200, {
                active,
                goals: all,
            });
        } catch (error) {
            sendToonResponse(ctx.res, 500, {
                error: error instanceof Error ? error.message : "Failed to read goals",
            });
        }
        return true;
    }

    return false;
}

// ─── Prompt + journal route helpers ─────────────────────────────────────

const PROMPT_ROUTE_PATH = "/api/apps/scape/prompt";
const JOURNAL_ROUTE_PATH = "/api/apps/scape/journal";
const GOALS_ROUTE_PATH = "/api/apps/scape/goals";

/**
 * Accept several request shapes. `readJsonBody` is the milady host's
 * JSON parser; if we're strict about TOON-only the host's generic
 * middleware won't know how to help us, so we try both.
 *
 *   1. String body → assume TOON, decode, look for `text`/`prompt`/`directive`
 *   2. Already an object → same keys
 *   3. String body that doesn't decode as TOON → treat as raw directive
 */
function extractPromptText(body: unknown): string | null {
    // Host parsed as JSON — check the object directly.
    if (body && typeof body === "object" && !Array.isArray(body)) {
        const obj = body as Record<string, unknown>;
        for (const key of ["text", "prompt", "directive", "message"] as const) {
            const value = obj[key];
            if (typeof value === "string" && value.trim().length > 0) {
                return value.trim();
            }
        }
    }
    // Host passed a string — try TOON decode first, then fall back.
    if (typeof body === "string" && body.trim().length > 0) {
        try {
            const decoded = decode(body);
            if (decoded && typeof decoded === "object") {
                const nested = extractPromptText(decoded);
                if (nested) return nested;
            }
        } catch {
            // Not TOON — treat as a raw text directive.
        }
        return body.trim();
    }
    return null;
}

/**
 * Send a TOON-encoded response. Mirrors `sendHtmlResponse` above but
 * for the agent-facing JSON/TOON endpoints; response body is the
 * TOON-encoded version of `payload`.
 */
function sendToonResponse(res: unknown, status: number, payload: unknown): void {
    const response = res as MutableResponse;
    response.statusCode = status;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "text/toon; charset=utf-8");
    const body = encode(payload as Record<string, unknown>);
    response.end(body);
}
