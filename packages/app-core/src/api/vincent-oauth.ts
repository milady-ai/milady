/**
 * Vincent OAuth PKCE helpers.
 *
 * Implements the PKCE flow from the Vincent OAuth Demo:
 * - Generate code verifier + challenge
 * - Register app with Vincent
 * - Build authorization URL
 * - Exchange authorization code for tokens
 */

const VINCENT_API_BASE = "https://heyvincent.ai";

// ── PKCE Helpers ──────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(plain));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await sha256(verifier);
  return base64UrlEncode(hash);
}

// ── Storage ───────────────────────────────────────────────────────────

const VERIFIER_KEY = "milady_vincent_code_verifier";
const CLIENT_ID_KEY = "milady_vincent_client_id";

export function storeCodeVerifier(verifier: string): void {
  sessionStorage.setItem(VERIFIER_KEY, verifier);
}

export function getStoredCodeVerifier(): string | null {
  return sessionStorage.getItem(VERIFIER_KEY);
}

export function clearCodeVerifier(): void {
  sessionStorage.removeItem(VERIFIER_KEY);
}

export function storeClientId(clientId: string): void {
  sessionStorage.setItem(CLIENT_ID_KEY, clientId);
}

export function getStoredClientId(): string | null {
  return sessionStorage.getItem(CLIENT_ID_KEY);
}

// ── OAuth Flow ────────────────────────────────────────────────────────

export interface VincentRegisterResponse {
  client_id: string;
}

/**
 * Register the app with Vincent's OAuth server.
 * Returns a client_id for the authorization flow.
 */
export async function registerVincentApp(
  appName: string,
  redirectUris: string[],
): Promise<VincentRegisterResponse> {
  const res = await fetch(`${VINCENT_API_BASE}/api/oauth/public/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: appName,
      redirect_uris: redirectUris,
    }),
  });
  if (!res.ok) {
    throw new Error(`Vincent register failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Build the Vincent authorization URL with PKCE parameters.
 * Returns { url, codeVerifier } — store the verifier for the token exchange.
 */
export async function buildVincentAuthUrl(
  clientId: string,
  redirectUri: string,
): Promise<{ url: string; codeVerifier: string }> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "all",
    resource: VINCENT_API_BASE,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    url: `${VINCENT_API_BASE}/api/oauth/public/authorize?${params.toString()}`,
    codeVerifier,
  };
}

/**
 * Exchange an authorization code for access + refresh tokens.
 * This should be called from the backend (server-side) to keep the verifier secure.
 */
export async function exchangeVincentCode(
  code: string,
  clientId: string,
  codeVerifier: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(`${VINCENT_API_BASE}/api/oauth/public/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Vincent token exchange failed: ${res.status} ${res.statusText}`,
    );
  }
  return res.json();
}

/**
 * Get the redirect URI for the current environment.
 */
export function getVincentRedirectUri(): string {
  if (typeof window === "undefined")
    return "https://milady.ai/callback/vincent";
  const { protocol, hostname, port } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}${port ? `:${port}` : ""}/callback/vincent`;
  }
  return `${protocol}//${hostname}/callback/vincent`;
}
