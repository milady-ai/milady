/**
 * Vincent OAuth backend routes.
 *
 * POST /api/vincent/register  — Register app with Vincent, get client_id
 * POST /api/vincent/token     — Exchange auth code + verifier for tokens
 * GET  /api/vincent/status    — Check if Vincent is connected
 * POST /api/vincent/disconnect — Clear stored Vincent tokens
 */

import type http from "node:http";
import { logger } from "@elizaos/core";
import type { ElizaConfig } from "@miladyai/agent/config/config";
import { saveElizaConfig } from "@miladyai/agent/config/config";
import { sendJson, sendJsonError } from "./response";

const VINCENT_API_BASE = "https://heyvincent.ai";

export interface VincentRouteState {
  config: ElizaConfig;
}

/**
 * Handle all /api/vincent/* routes.
 * Returns true if the route was handled, false otherwise.
 */
export async function handleVincentRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: VincentRouteState,
): Promise<boolean> {
  // ── POST /api/vincent/register ──────────────────────────────────
  if (method === "POST" && pathname === "/api/vincent/register") {
    try {
      const body = await readBody(req);
      const { appName, redirectUris } = JSON.parse(body);

      const upstream = await fetch(
        `${VINCENT_API_BASE}/api/oauth/public/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_name: appName ?? "Milady",
            redirect_uris: redirectUris ?? [],
          }),
        },
      );

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        sendJsonError(res, upstream.status, `Vincent register failed: ${text}`);
        return true;
      }

      const data = await upstream.json();
      sendJson(res, 200, data);
    } catch (err) {
      logger.error(
        `[vincent/register] ${err instanceof Error ? err.message : String(err)}`,
      );
      sendJsonError(res, 500, "Vincent registration failed");
    }
    return true;
  }

  // ── POST /api/vincent/token ─────────────────────────────────────
  if (method === "POST" && pathname === "/api/vincent/token") {
    try {
      const body = await readBody(req);
      const { code, clientId, codeVerifier } = JSON.parse(body);

      if (!code || !clientId || !codeVerifier) {
        sendJsonError(res, 400, "Missing code, clientId, or codeVerifier");
        return true;
      }

      const upstream = await fetch(
        `${VINCENT_API_BASE}/api/oauth/public/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            code_verifier: codeVerifier,
          }),
        },
      );

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        sendJsonError(
          res,
          upstream.status,
          `Vincent token exchange failed: ${text}`,
        );
        return true;
      }

      const tokens = (await upstream.json()) as {
        access_token: string;
        refresh_token?: string;
      };

      // Persist tokens to config
      const config = state.config;
      (config as any).vincent = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        clientId,
        connectedAt: Math.floor(Date.now() / 1000),
      };
      await saveElizaConfig(config);

      logger.info("[vincent/token] Vincent connected successfully");
      sendJson(res, 200, { ok: true, connected: true });
    } catch (err) {
      logger.error(
        `[vincent/token] ${err instanceof Error ? err.message : String(err)}`,
      );
      sendJsonError(res, 500, "Vincent token exchange failed");
    }
    return true;
  }

  // ── GET /api/vincent/status ─────────────────────────────────────
  if (method === "GET" && pathname === "/api/vincent/status") {
    const vincent = (state.config as any).vincent;
    const connected = Boolean(vincent?.accessToken);
    sendJson(res, 200, {
      connected,
      connectedAt: vincent?.connectedAt ?? null,
    });
    return true;
  }

  // ── POST /api/vincent/disconnect ────────────────────────────────
  if (method === "POST" && pathname === "/api/vincent/disconnect") {
    try {
      const config = state.config;
      (config as any).vincent = undefined;
      await saveElizaConfig(config);
      logger.info("[vincent/disconnect] Vincent disconnected");
      sendJson(res, 200, { ok: true });
    } catch (err) {
      logger.error(
        `[vincent/disconnect] ${err instanceof Error ? err.message : String(err)}`,
      );
      sendJsonError(res, 500, "Vincent disconnect failed");
    }
    return true;
  }

  return false;
}

// ── Helpers ───────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
