const ELIZA_CLOUD_HOSTS = new Set([
  "elizacloud.ai",
  "www.elizacloud.ai",
  "dev.elizacloud.ai",
]);

function normalizeCloudHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

function resolveDefaultCloudBase(): string {
  if (typeof window === "undefined") {
    return "https://www.elizacloud.ai";
  }

  const hostname = normalizeCloudHost(window.location.hostname);
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    // Default to production cloud API for local dev.
    // Override with VITE_ELIZA_CLOUD_BASE env var for local backend dev.
    return "https://www.elizacloud.ai";
  }

  if (ELIZA_CLOUD_HOSTS.has(hostname)) {
    return `${window.location.protocol}//${window.location.host}`;
  }

  // Use www to avoid bare-domain redirect dropping POST bodies
  return "https://www.elizacloud.ai";
}

const DEFAULT_CLOUD_BASE = resolveDefaultCloudBase();
const DEFAULT_LOCAL_AGENT_BASE = "http://localhost:2138";
const DEFAULT_SANDBOX_DISCOVERY_URL = "https://sandboxes.waifu.fun/agents";
const DEFAULT_AGENT_UI_BASE_DOMAIN = "milady.ai";
const DEFAULT_CLOUD_AGENT_API_BASE_PATH = "/api/v1/eliza/agents";
const CLOUD_TOKEN_STORAGE_PREFIX = "milady-cloud-token";

function normalizeUrl(
  value: string | boolean | undefined,
  fallback: string,
): string {
  const candidate = typeof value === "string" ? value.trim() : undefined;
  return (candidate && candidate.length > 0 ? candidate : fallback).replace(
    /\/+$/,
    "",
  );
}

function normalizeHostname(
  value: string | boolean | undefined,
  fallback: string,
): string {
  const candidate =
    typeof value === "string"
      ? value
          .trim()
          .replace(/^https?:\/\//, "")
          .replace(/\/+$/, "")
      : undefined;
  return candidate && candidate.length > 0 ? candidate : fallback;
}

function normalizePath(
  value: string | boolean | undefined,
  fallback: string,
): string {
  const candidate = typeof value === "string" ? value.trim() : undefined;
  const path = candidate && candidate.length > 0 ? candidate : fallback;
  return `/${path.replace(/^\/+|\/+$/g, "")}`;
}

export const CLOUD_BASE = normalizeUrl(
  import.meta.env.VITE_ELIZA_CLOUD_BASE,
  DEFAULT_CLOUD_BASE,
);

export const LOCAL_AGENT_BASE = normalizeUrl(
  import.meta.env.VITE_LOCAL_AGENT_BASE,
  DEFAULT_LOCAL_AGENT_BASE,
);

export const AGENT_UI_BASE_DOMAIN = normalizeHostname(
  import.meta.env.VITE_AGENT_UI_BASE_DOMAIN,
  DEFAULT_AGENT_UI_BASE_DOMAIN,
);

export const CLOUD_AGENT_API_BASE_PATH = normalizePath(
  import.meta.env.VITE_CLOUD_AGENT_API_BASE_PATH,
  DEFAULT_CLOUD_AGENT_API_BASE_PATH,
);

export function getCloudAgentApiPath(
  agentId?: string,
  suffix?: string,
): string {
  if (!agentId) return CLOUD_AGENT_API_BASE_PATH;
  const normalizedSuffix = suffix?.replace(/^\/+|\/+$/g, "");
  return `${CLOUD_AGENT_API_BASE_PATH}/${encodeURIComponent(agentId)}${
    normalizedSuffix ? `/${normalizedSuffix}` : ""
  }`;
}

/**
 * Public sandbox discovery is disabled everywhere.  The sandbox endpoint
 * lists ALL running agents across the cluster — unauthenticated users
 * should never see other people's agents.  Only cloud-authenticated
 * sessions use sandbox data (to enrich their own agent list).
 */
export function shouldAllowPublicSandboxDiscoveryFallback(): boolean {
  return false;
}

function parseBooleanFlag(
  value: string | boolean | undefined,
): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return undefined;
  return normalized !== "0" && normalized !== "false";
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeCloudHost(hostname).replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function isLoopbackUrl(value: string): boolean {
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function isLocalAgentAutoProbeDefaultHostname(
  hostname: string,
): boolean {
  return isLoopbackHostname(hostname);
}

export function shouldAutoProbeLocalAgentForConfig({
  pageHostname,
  explicit,
  localAgentBase = DEFAULT_LOCAL_AGENT_BASE,
}: {
  pageHostname?: string;
  explicit?: string | boolean;
  localAgentBase?: string;
}): boolean {
  if (!pageHostname) return false;

  const pageIsLoopback = isLocalAgentAutoProbeDefaultHostname(pageHostname);
  if (!pageIsLoopback && isLoopbackUrl(localAgentBase)) return false;

  const explicitValue = parseBooleanFlag(explicit);
  if (explicitValue !== undefined) return explicitValue;

  return pageIsLoopback;
}

export function shouldAutoProbeLocalAgent(): boolean {
  if (typeof window === "undefined") return false;
  return shouldAutoProbeLocalAgentForConfig({
    pageHostname: window.location.hostname,
    explicit: import.meta.env.VITE_LOCAL_AGENT_AUTO_PROBE,
    localAgentBase: LOCAL_AGENT_BASE,
  });
}

export function getCloudTokenStorageKey(): string {
  try {
    const url = new URL(CLOUD_BASE);
    const hostname = normalizeCloudHost(url.hostname);
    const storageHost =
      hostname === "www.elizacloud.ai"
        ? "elizacloud.ai"
        : url.port
          ? `${hostname}:${url.port}`
          : hostname;
    return `${CLOUD_TOKEN_STORAGE_PREFIX}:${storageHost}`;
  } catch {
    return CLOUD_TOKEN_STORAGE_PREFIX;
  }
}

export function getSandboxDiscoveryUrls(): string[] {
  const urls = [
    normalizeUrl(
      import.meta.env.VITE_SANDBOX_DISCOVERY_URL,
      DEFAULT_SANDBOX_DISCOVERY_URL,
    ),
  ];

  if (typeof window !== "undefined" && window.location?.hostname) {
    urls.push(
      `${window.location.protocol}//${window.location.hostname}:3456/agents`,
    );
  }

  return Array.from(new Set(urls.filter(Boolean)));
}

/**
 * Rewrite agent UI URLs to use the configured base domain.
 *
 * Sandbox discovery may return *.waifu.fun URLs, but the canonical
 * user-facing domain is milady.ai (or whatever VITE_AGENT_UI_BASE_DOMAIN
 * is set to). This rewrites so users always see the branded domain.
 */
export function rewriteAgentUiUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(".waifu.fun")) {
      parsed.hostname = parsed.hostname.replace(
        /\.waifu\.fun$/,
        `.${AGENT_UI_BASE_DOMAIN}`,
      );
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
