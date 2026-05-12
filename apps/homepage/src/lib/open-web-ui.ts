import { getToken } from "./auth";
import {
  CLOUD_BASE,
  getCloudAgentApiPath,
  rewriteAgentUiUrl,
} from "./runtime-config";

const PAIRING_POLL_MAX_ATTEMPTS = 60;
const PAIRING_POLL_MAX_WALL_MS = 120_000;
const PAIRING_POLL_DEFAULT_RETRY_MS = 1000;

type PairingPollResult =
  | { kind: "ready"; redirectUrl: string }
  | { kind: "pending"; retryAfterMs: number };

function readRetryAfterMs(res: Response, body: unknown): number {
  if (
    body &&
    typeof body === "object" &&
    "retryAfterMs" in body &&
    typeof (body as { retryAfterMs?: unknown }).retryAfterMs === "number"
  ) {
    return Math.max(0, (body as { retryAfterMs: number }).retryAfterMs);
  }
  const header = res.headers.get("Retry-After");
  if (header) {
    const sec = Number(header);
    if (Number.isFinite(sec) && sec >= 0) return sec * 1000;
  }
  return PAIRING_POLL_DEFAULT_RETRY_MS;
}

async function requestPairingToken(
  agentId: string,
  apiKey: string,
): Promise<PairingPollResult> {
  const res = await fetch(
    `${CLOUD_BASE}${getCloudAgentApiPath(agentId, "pairing-token")}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Api-Key": apiKey,
      },
    },
  );

  if (res.status === 202) {
    const body = await res.json().catch(() => ({}));
    const data =
      body && typeof body === "object" && "data" in body
        ? (body as { data?: unknown }).data
        : body;
    return { kind: "pending", retryAfterMs: readRetryAfterMs(res, data) };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pairing token ${res.status}: ${text}`);
  }

  const json = await res.json();
  const redirectUrl: string | undefined =
    json?.data?.redirectUrl ?? json?.redirectUrl;

  if (!redirectUrl) {
    throw new Error("No redirectUrl in pairing-token response");
  }

  return { kind: "ready", redirectUrl: rewriteAgentUiUrl(redirectUrl) };
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drives the pairing-token flow: POST → if 200, redirect; if 202, wait and
 * retry until ready (or popup closes, or polling cap is hit).
 */
export async function redirectPopupToCloudAgent(
  popup: Window,
  agentId: string,
  apiKey: string,
): Promise<void> {
  const startedAt = Date.now();

  for (let attempt = 0; attempt < PAIRING_POLL_MAX_ATTEMPTS; attempt++) {
    if (popup.closed) return;

    const result = await requestPairingToken(agentId, apiKey);

    if (popup.closed) return;

    if (result.kind === "ready") {
      popup.location.href = result.redirectUrl;
      return;
    }

    if (
      Date.now() - startedAt + result.retryAfterMs >
      PAIRING_POLL_MAX_WALL_MS
    ) {
      throw new Error("Pairing token polling timed out");
    }

    await delay(result.retryAfterMs);
  }

  throw new Error("Pairing token polling exceeded max attempts");
}

/**
 * Extract the sandbox UUID from an agent URL like https://<uuid>.milady.ai
 */
function extractUuidFromUrl(url: string): string | null {
  const match = url.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return match ? match[1] : null;
}

export function renderPopupConnectingState(
  popup: Window,
  message: string = "Connecting to agent…",
): void {
  const { document } = popup;
  const { body } = document;
  if (!body) return;

  document.title = "Connecting…";
  body.style.margin = "0";
  body.replaceChildren();

  const container = document.createElement("div");
  container.style.cssText =
    "font-family:system-ui,-apple-system,sans-serif;background:#09090b;color:#a1a1aa;min-height:100vh;display:flex;align-items:center;justify-content:center";

  const content = document.createElement("div");
  content.style.textAlign = "center";

  const spinner = document.createElement("div");
  spinner.setAttribute("aria-hidden", "true");
  spinner.style.cssText =
    "width:24px;height:24px;border:2px solid #27272a;border-top-color:#a1a1aa;border-radius:50%;margin:0 auto 16px;animation:milady-popup-spinner 0.8s linear infinite";

  const messageEl = document.createElement("div");
  messageEl.id = "milady-popup-message";
  messageEl.style.cssText = "font-size:14px;letter-spacing:0.02em";
  messageEl.textContent = message;

  content.append(spinner, messageEl);
  container.append(content);
  body.append(container);

  if (!document.getElementById("milady-popup-spinner-style")) {
    const style = document.createElement("style");
    style.id = "milady-popup-spinner-style";
    style.textContent =
      "@keyframes milady-popup-spinner{to{transform:rotate(360deg)}}";
    (document.head ?? body).append(style);
  }
}

export function updatePopupMessage(popup: Window, message: string): void {
  if (popup.closed) return;
  const el = popup.document.getElementById("milady-popup-message");
  if (el) {
    el.textContent = message;
  }
}

/**
 * Opens the Web UI for a remote/cloud agent with automatic authentication.
 *
 * Flow:
 *   1. Opens a popup immediately (must be in click handler for popup blockers)
 *   2. Calls the cloud backend pairing-token endpoint, polling through 202s
 *   3. Redirects the popup to the returned URL (with token in path)
 *
 * The pairing token is exchanged by the agent's nginx Lua router or
 * /pair page for a real API key stored in sessionStorage.
 */
async function openWebUIWithPairingToken(
  agentUrl: string,
  cloudApiKey: string,
  agentId?: string,
): Promise<void> {
  const popup = window.open("", "_blank");
  if (!popup) {
    showToast("Popup blocked. Please allow popups and try again.");
    return;
  }

  try {
    renderPopupConnectingState(popup);
  } catch {
    // cross-origin write may fail
  }

  const pairingAgentId = agentId ?? extractUuidFromUrl(agentUrl);
  if (!pairingAgentId) {
    popup.location.href = rewriteAgentUiUrl(agentUrl);
    return;
  }

  try {
    await redirectPopupToCloudAgent(popup, pairingAgentId, cloudApiKey);
  } catch (err) {
    console.error("[open-web-ui] pairing token failed, falling back:", err);
    if (!popup.closed) {
      popup.location.href = rewriteAgentUiUrl(agentUrl);
    }
  }
}

/**
 * Opens the Web UI directly without authentication.
 * Used for local agents or when the user is not logged in.
 */
export function openWebUIDirect(url: string): void {
  window.open(rewriteAgentUiUrl(url), "_blank", "noopener,noreferrer");
}

/**
 * Main entry point: opens the Web UI for any agent.
 * If the user is authenticated and the agent is non-local, requests a
 * pairing token for seamless auth handoff.  Otherwise opens directly.
 */
export function openWebUI(
  agentUrl: string,
  source: "local" | "remote" | "cloud",
  agentId?: string,
): void {
  const cloudToken = getToken();
  if (source !== "local" && cloudToken) {
    openWebUIWithPairingToken(agentUrl, cloudToken, agentId);
  } else {
    openWebUIDirect(agentUrl);
  }
}

/** Simple toast — uses a temporary DOM element as fallback */
function showToast(message: string): void {
  console.error("[open-web-ui]", message);
  if (typeof window === "undefined") return;
  const div = document.createElement("div");
  div.textContent = message;
  Object.assign(div.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1a1a1a",
    color: "#ef4444",
    padding: "12px 24px",
    borderRadius: "12px",
    border: "1px solid #333",
    fontSize: "14px",
    fontFamily: "system-ui, sans-serif",
    zIndex: "99999",
    boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
    transition: "opacity 0.3s",
  });
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 300);
  }, 4000);
}
