/**
 * Cloud API routes for Milaidy — handles /api/cloud/* endpoints.
 */

import http from "node:http";
import type { CloudManager } from "../cloud/cloud-manager.js";
import type { MilaidyConfig } from "../config/config.js";
import { saveMilaidyConfig } from "../config/config.js";

export interface CloudRouteState {
  config: MilaidyConfig;
  cloudManager: CloudManager | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractAgentId(pathname: string): string | null {
  const id = pathname.split("/")[4];
  return id && UUID_RE.test(id) ? id : null;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > 1_048_576) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function err(res: http.ServerResponse, message: string, status = 400): void {
  json(res, { error: message }, status);
}

/**
 * Returns true if the request was handled, false if path didn't match.
 */
export async function handleCloudRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: CloudRouteState,
): Promise<boolean> {
  // POST /api/cloud/login
  if (method === "POST" && pathname === "/api/cloud/login") {
    const baseUrl = state.config.cloud?.baseUrl ?? "https://www.elizacloud.ai";
    const sessionId = crypto.randomUUID();

    const createRes = await fetch(`${baseUrl}/api/auth/cli-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    if (!createRes.ok) {
      err(res, "Failed to create auth session with ELIZA Cloud", 502);
      return true;
    }

    json(res, {
      ok: true,
      sessionId,
      browserUrl: `${baseUrl}/auth/cli-login?session=${encodeURIComponent(sessionId)}`,
    });
    return true;
  }

  // GET /api/cloud/login/status?sessionId=...
  if (method === "GET" && pathname.startsWith("/api/cloud/login/status")) {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      err(res, "sessionId query parameter is required");
      return true;
    }

    const baseUrl = state.config.cloud?.baseUrl ?? "https://www.elizacloud.ai";
    const pollRes = await fetch(
      `${baseUrl}/api/auth/cli-session/${encodeURIComponent(sessionId)}`,
    );

    if (!pollRes.ok) {
      json(
        res,
        pollRes.status === 404
          ? { status: "expired", error: "Session not found or expired" }
          : {
              status: "error",
              error: `ELIZA Cloud returned HTTP ${pollRes.status}`,
            },
      );
      return true;
    }

    const data = (await pollRes.json()) as {
      status: string;
      apiKey?: string;
      keyPrefix?: string;
    };

    if (data.status === "authenticated" && data.apiKey) {
      const cloud = (state.config.cloud ?? {}) as NonNullable<
        typeof state.config.cloud
      >;
      cloud.enabled = true;
      cloud.apiKey = data.apiKey;
      (state.config as Record<string, unknown>).cloud = cloud;
      saveMilaidyConfig(state.config);

      if (state.cloudManager && !state.cloudManager.getClient())
        state.cloudManager.init();

      json(res, { status: "authenticated", keyPrefix: data.keyPrefix });
    } else {
      json(res, { status: data.status });
    }
    return true;
  }

  // GET /api/cloud/agents
  if (method === "GET" && pathname === "/api/cloud/agents") {
    const client = state.cloudManager?.getClient();
    if (!client) {
      err(res, "Not connected to ELIZA Cloud", 401);
      return true;
    }
    json(res, { ok: true, agents: await client.listAgents() });
    return true;
  }

  // POST /api/cloud/agents
  if (method === "POST" && pathname === "/api/cloud/agents") {
    const client = state.cloudManager?.getClient();
    if (!client) {
      err(res, "Not connected to ELIZA Cloud", 401);
      return true;
    }

    const raw = await readBody(req);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      err(res, "Request body must be a JSON object");
      return true;
    }
    const body = parsed as {
      agentName?: string;
      agentConfig?: Record<string, unknown>;
      environmentVars?: Record<string, string>;
    };
    if (!body.agentName?.trim()) {
      err(res, "agentName is required");
      return true;
    }

    const agent = await client.createAgent({
      agentName: body.agentName,
      agentConfig: body.agentConfig,
      environmentVars: body.environmentVars,
    });
    json(res, { ok: true, agent }, 201);
    return true;
  }

  // POST /api/cloud/agents/:id/provision
  if (
    method === "POST" &&
    pathname.startsWith("/api/cloud/agents/") &&
    pathname.endsWith("/provision")
  ) {
    const agentId = extractAgentId(pathname);
    if (!agentId || !state.cloudManager) {
      err(res, "Invalid agent ID or cloud not connected", 400);
      return true;
    }
    const proxy = await state.cloudManager.connect(agentId);
    json(res, {
      ok: true,
      agentId,
      agentName: proxy.agentName,
      status: state.cloudManager.getStatus(),
    });
    return true;
  }

  // POST /api/cloud/agents/:id/shutdown
  if (
    method === "POST" &&
    pathname.startsWith("/api/cloud/agents/") &&
    pathname.endsWith("/shutdown")
  ) {
    const agentId = extractAgentId(pathname);
    if (!agentId || !state.cloudManager) {
      err(res, "Invalid agent ID or cloud not connected", 400);
      return true;
    }
    const client = state.cloudManager.getClient();
    if (!client) {
      err(res, "Not connected to ELIZA Cloud", 401);
      return true;
    }
    if (state.cloudManager.getActiveAgentId() === agentId)
      await state.cloudManager.disconnect();
    await client.deleteAgent(agentId);
    json(res, { ok: true, agentId, status: "stopped" });
    return true;
  }

  // POST /api/cloud/agents/:id/connect
  if (
    method === "POST" &&
    pathname.startsWith("/api/cloud/agents/") &&
    pathname.endsWith("/connect")
  ) {
    const agentId = extractAgentId(pathname);
    if (!agentId || !state.cloudManager) {
      err(res, "Invalid agent ID or cloud not connected", 400);
      return true;
    }
    if (state.cloudManager.getActiveAgentId())
      await state.cloudManager.disconnect();
    const proxy = await state.cloudManager.connect(agentId);
    json(res, {
      ok: true,
      agentId,
      agentName: proxy.agentName,
      status: state.cloudManager.getStatus(),
    });
    return true;
  }

  // POST /api/cloud/disconnect
  if (method === "POST" && pathname === "/api/cloud/disconnect") {
    if (state.cloudManager) await state.cloudManager.disconnect();
    json(res, { ok: true, status: "disconnected" });
    return true;
  }

  // GET /api/cloud/status
  if (method === "GET" && pathname === "/api/cloud/status") {
    json(res, {
      enabled: Boolean(state.config.cloud?.enabled),
      hasApiKey: Boolean(state.config.cloud?.apiKey),
      connectionStatus: state.cloudManager?.getStatus() ?? "disconnected",
      activeAgentId: state.cloudManager?.getActiveAgentId() ?? null,
    });
    return true;
  }

  return false;
}
