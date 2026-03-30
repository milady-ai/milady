import { CLOUD_BASE, getCloudTokenStorageKey } from "./runtime-config";

export const CLOUD_AUTH_CHANGED_EVENT = "milady-cloud-auth-changed";

function emitAuthChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CLOUD_AUTH_CHANGED_EVENT));
}

function getActiveTokenStorageKey(): string {
  return getCloudTokenStorageKey();
}

export function getToken(): string | null {
  return localStorage.getItem(getActiveTokenStorageKey());
}

export function setToken(token: string): void {
  localStorage.setItem(getActiveTokenStorageKey(), token);
  emitAuthChanged();
}

export function clearToken(): void {
  localStorage.removeItem(getActiveTokenStorageKey());
  emitAuthChanged();
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

export async function cloudLogin(): Promise<{
  sessionId: string;
  browserUrl: string;
}> {
  const sessionId = crypto.randomUUID();
  const res = await fetch(`${CLOUD_BASE}/api/auth/cli-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`Failed to create auth session: ${res.status}`);
  return {
    sessionId,
    browserUrl: `${CLOUD_BASE}/auth/cli-login?session=${encodeURIComponent(sessionId)}`,
  };
}

export async function cloudLoginPoll(
  sessionId: string,
): Promise<{ status: string; apiKey?: string }> {
  const res = await fetch(
    `${CLOUD_BASE}/api/auth/cli-session/${encodeURIComponent(sessionId)}`,
    {
      redirect: "manual",
    },
  );
  if (res.status === 404) throw new Error("Session expired");
  if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
  return res.json();
}

export interface CloudAgent {
  id: string;
  name: string;
  agentName?: string;
  status: string;
  model?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchWithAuth(
  url: string,
  opts: RequestInit = {},
): Promise<Response> {
  const token = getToken();
  const headers = new Headers(opts.headers);
  if (token) {
    headers.set("X-Api-Key", token);
  }
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    clearToken();
  }
  return res;
}

/**
 * Extracts the API token from the URL (e.g. ?token=...) and stores it,
 * then strips it from the URL to prevent leaking in screenshots/sharing.
 */
export function consumeUrlToken(): void {
  try {
    const currentUrl = new URL(window.location.href);
    const tokenParam = currentUrl.searchParams.get("token");
    if (tokenParam) {
      setToken(tokenParam);
      currentUrl.searchParams.delete("token");
      window.history.replaceState({}, "", currentUrl.toString());
    }
  } catch {
    // ignore URL parsing errors
  }
}
