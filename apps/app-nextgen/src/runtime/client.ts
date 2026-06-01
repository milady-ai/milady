import type { AgentStatus, AuthStatus, HealthStatus } from "./types";

/**
 * Thin client for the eliza runtime HTTP API — the entire coupling surface
 * between Milady's renderer and the agent. One origin, bearer + client-id auth,
 * loopback needs no token. (Contract: docs/milady-nextgen-architecture.md §4.)
 */

const CLIENT_ID_KEY = "milady_nextgen_client_id";
const API_BASE_KEY = "milady_nextgen_api_base";
const TOKEN_KEY = "milady_nextgen_token";

declare global {
  interface Window {
    /** Injected by the Electrobun shell with the local agent origin. */
    __ELIZA_API_BASE__?: string;
    __ELIZA_API_TOKEN__?: string;
  }
}

function resolveApiBase(): string {
  const injected =
    typeof window !== "undefined" ? window.__ELIZA_API_BASE__ : undefined;
  if (injected) return injected.replace(/\/+$/, "");
  const stored =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(API_BASE_KEY)
      : null;
  if (stored) return stored.replace(/\/+$/, "");
  const env = import.meta.env.VITE_MILADY_API_BASE as string | undefined;
  if (env) return env.replace(/\/+$/, "");
  if (import.meta.env.DEV) return "http://127.0.0.1:31337";
  return ""; // prod: same-origin (the shell's static server proxies /api)
}

function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export class RuntimeError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
  ) {
    super(`runtime ${path} → HTTP ${status}`);
    this.name = "RuntimeError";
  }
}

class RuntimeClient {
  readonly base = resolveApiBase();
  private token =
    (typeof window !== "undefined" && window.__ELIZA_API_TOKEN__) ||
    (typeof localStorage !== "undefined" && localStorage.getItem(TOKEN_KEY)) ||
    null;

  setToken(token: string | null): void {
    this.token = token;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "X-ElizaOS-Client-Id": getClientId() };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: this.headers(),
      signal,
    });
    if (!res.ok) throw new RuntimeError(path, res.status);
    return (await res.json()) as T;
  }

  getAuthStatus(signal?: AbortSignal): Promise<AuthStatus> {
    return this.get<AuthStatus>("/api/auth/status", signal);
  }
  getStatus(signal?: AbortSignal): Promise<AgentStatus> {
    return this.get<AgentStatus>("/api/status", signal);
  }
  getHealth(signal?: AbortSignal): Promise<HealthStatus> {
    return this.get<HealthStatus>("/api/health", signal);
  }
}

export const runtime = new RuntimeClient();
