import type {
  CreateLifeOpsCalendarEventRequest,
  LifeOpsConnectorSide,
  LifeOpsGoogleCapability,
  LifeOpsGoogleConnectorReason,
  StartLifeOpsGoogleConnectorResponse,
} from "@miladyai/shared/contracts/lifeops";
import {
  normalizeCloudSiteUrl,
  resolveCloudApiBaseUrl,
} from "../cloud/base-url.js";
import { loadElizaConfig } from "../config/config.js";
import type { SyncedGoogleCalendarEvent } from "./google-calendar.js";
import type { SyncedGoogleGmailMessageSummary } from "./google-gmail.js";

const MANAGED_GOOGLE_REQUEST_TIMEOUT_MS = 20_000;

export class ManagedGoogleClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ManagedGoogleClientError";
  }
}

export interface ResolvedManagedGoogleCloudConfig {
  configured: boolean;
  apiKey: string | null;
  apiBaseUrl: string;
  siteUrl: string;
}

export interface ManagedGoogleConnectorStatusResponse {
  provider: "google";
  side: LifeOpsConnectorSide;
  mode: "cloud_managed";
  configured: boolean;
  connected: boolean;
  reason: LifeOpsGoogleConnectorReason;
  identity: Record<string, unknown> | null;
  grantedCapabilities: LifeOpsGoogleCapability[];
  grantedScopes: string[];
  expiresAt: string | null;
  hasRefreshToken: boolean;
  connectionId: string | null;
  linkedAt: string | null;
  lastUsedAt: string | null;
}

export interface ManagedGoogleCalendarFeedResponse {
  calendarId: string;
  events: SyncedGoogleCalendarEvent[];
  syncedAt: string;
}

export interface ManagedGoogleCalendarEventResponse {
  event: SyncedGoogleCalendarEvent;
}

export interface ManagedGoogleGmailTriageResponse {
  messages: SyncedGoogleGmailMessageSummary[];
  syncedAt: string;
}

export interface ManagedGoogleGmailSearchResponse {
  messages: SyncedGoogleGmailMessageSummary[];
  syncedAt: string;
}

export interface ManagedGoogleGmailReadResponse {
  message: SyncedGoogleGmailMessageSummary;
  bodyText: string;
}

export interface ManagedGoogleReplySendRequest {
  side?: LifeOpsConnectorSide;
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  inReplyTo?: string | null;
  references?: string | null;
}

interface GenericOAuthInitiateResponse {
  authUrl: string;
  state?: string;
  provider?: {
    id?: string;
    name?: string;
  };
}

const DEFAULT_MANAGED_GOOGLE_CAPABILITIES: readonly LifeOpsGoogleCapability[] = [
  "google.basic_identity",
  "google.calendar.read",
  "google.gmail.triage",
  "google.gmail.send",
] as const;

function normalizeManagedGoogleCapabilities(
  capabilities?: readonly LifeOpsGoogleCapability[],
): LifeOpsGoogleCapability[] {
  const source = capabilities ?? DEFAULT_MANAGED_GOOGLE_CAPABILITIES;
  const normalized = [...new Set(source)];
  return normalized.includes("google.basic_identity")
    ? normalized
    : ["google.basic_identity", ...normalized];
}

function managedGoogleCapabilitiesToScopes(
  capabilities: readonly LifeOpsGoogleCapability[],
): string[] {
  const scopes = new Set<string>([
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ]);

  for (const capability of normalizeManagedGoogleCapabilities(capabilities)) {
    if (capability === "google.calendar.read") {
      scopes.add("https://www.googleapis.com/auth/calendar.readonly");
    }
    if (capability === "google.calendar.write") {
      scopes.add("https://www.googleapis.com/auth/calendar.events");
    }
    if (capability === "google.gmail.triage") {
      scopes.add("https://www.googleapis.com/auth/gmail.readonly");
    }
    if (capability === "google.gmail.send") {
      scopes.add("https://www.googleapis.com/auth/gmail.send");
    }
  }

  return [...scopes];
}

function normalizeApiKey(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length === 0) {
    return null;
  }
  return trimmed.toUpperCase() === "[REDACTED]" ? null : trimmed;
}

function readConfigCloudSettings(): {
  apiKey: string | null;
  baseUrl: string | null;
} {
  try {
    const config = loadElizaConfig();
    const cloud =
      config.cloud && typeof config.cloud === "object"
        ? (config.cloud as Record<string, unknown>)
        : null;
    return {
      apiKey:
        cloud && typeof cloud.apiKey === "string"
          ? normalizeApiKey(cloud.apiKey)
          : null,
      baseUrl:
        cloud &&
        typeof cloud.baseUrl === "string" &&
        cloud.baseUrl.trim().length
          ? cloud.baseUrl.trim()
          : null,
    };
  } catch {
    return {
      apiKey: null,
      baseUrl: null,
    };
  }
}

function buildTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`.trim();
    const text = await response.text();
    const trimmed = text.trim();
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (trimmed.length > 0) {
      try {
        if (contentType.includes("text/html") && !/^[{[]/.test(trimmed)) {
          throw new Error("html response");
        }
        const parsed = JSON.parse(trimmed) as {
          error?: string;
          message?: string;
        };
        detail = parsed.message ?? parsed.error ?? trimmed;
      } catch {
        if (!contentType.includes("text/html")) {
          detail = trimmed.slice(0, 200);
        }
      }
    }
    throw new ManagedGoogleClientError(response.status, detail);
  }

  return (await response.json()) as T;
}

export function resolveManagedGoogleCloudConfig(): ResolvedManagedGoogleCloudConfig {
  const configCloud = readConfigCloudSettings();
  const apiKey =
    configCloud.apiKey ?? normalizeApiKey(process.env.ELIZAOS_CLOUD_API_KEY);
  const baseUrl = configCloud.baseUrl ?? process.env.ELIZAOS_CLOUD_BASE_URL;
  const siteUrl = normalizeCloudSiteUrl(baseUrl);
  const apiBaseUrl = resolveCloudApiBaseUrl(baseUrl);

  return {
    configured: Boolean(apiKey),
    apiKey,
    apiBaseUrl,
    siteUrl,
  };
}

export class GoogleManagedClient {
  constructor(
    private readonly configSource:
      | ResolvedManagedGoogleCloudConfig
      | (() => ResolvedManagedGoogleCloudConfig) = resolveManagedGoogleCloudConfig,
  ) {}

  private getConfig(): ResolvedManagedGoogleCloudConfig {
    return typeof this.configSource === "function"
      ? this.configSource()
      : this.configSource;
  }

  get configured(): boolean {
    return this.getConfig().configured;
  }

  private requireConfig(): ResolvedManagedGoogleCloudConfig & {
    apiKey: string;
  } {
    const config = this.getConfig();
    if (!config.apiKey) {
      throw new ManagedGoogleClientError(409, "Eliza Cloud is not connected.");
    }
    return {
      ...config,
      apiKey: config.apiKey,
    };
  }

  private async request<T>(
    pathname: string,
    init: RequestInit = {},
  ): Promise<T> {
    const config = this.requireConfig();
    const url = new URL(
      pathname.replace(/^\/+/, ""),
      `${config.apiBaseUrl.replace(/\/+$/, "")}/`,
    );
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
        ...(init.headers ?? {}),
      },
      signal:
        init.signal ?? buildTimeoutSignal(MANAGED_GOOGLE_REQUEST_TIMEOUT_MS),
    });
    return readJsonResponse<T>(response);
  }

  async getStatus(
    side: LifeOpsConnectorSide,
  ): Promise<ManagedGoogleConnectorStatusResponse> {
    const query = new URLSearchParams({ side });
    return this.request<ManagedGoogleConnectorStatusResponse>(
      `milady/google/status?${query.toString()}`,
      {
        method: "GET",
      },
    );
  }

  async startConnector(args: {
    side: LifeOpsConnectorSide;
    capabilities?: LifeOpsGoogleCapability[];
    redirectUrl?: string;
  }): Promise<StartLifeOpsGoogleConnectorResponse> {
    const redirectUri =
      args.redirectUrl ??
      new URL(
        "/auth/success?platform=google",
        `${this.requireConfig().siteUrl.replace(/\/+$/, "")}/`,
      ).toString();
    const requestedCapabilities = normalizeManagedGoogleCapabilities(
      args.capabilities,
    );
    const auth = await this.request<GenericOAuthInitiateResponse>(
      "oauth/google/initiate",
      {
        method: "POST",
        body: JSON.stringify({
          redirectUrl: redirectUri,
          scopes: managedGoogleCapabilitiesToScopes(requestedCapabilities),
          connectionRole: args.side,
        }),
      },
    );
    return {
      provider: "google",
      side: args.side,
      mode: "cloud_managed",
      requestedCapabilities,
      redirectUri,
      authUrl: auth.authUrl,
    };
  }

  async disconnectConnector(
    connectionId?: string | null,
    side?: LifeOpsConnectorSide,
  ): Promise<void> {
    await this.request<{ ok: true }>("milady/google/disconnect", {
      method: "POST",
      body: JSON.stringify({
        connectionId: connectionId ?? null,
        side: side ?? "owner",
      }),
    });
  }

  async getCalendarFeed(args: {
    side: LifeOpsConnectorSide;
    calendarId: string;
    timeMin: string;
    timeMax: string;
    timeZone: string;
  }): Promise<ManagedGoogleCalendarFeedResponse> {
    const query = new URLSearchParams({
      side: args.side,
      calendarId: args.calendarId,
      timeMin: args.timeMin,
      timeMax: args.timeMax,
      timeZone: args.timeZone,
    });
    return this.request<ManagedGoogleCalendarFeedResponse>(
      `milady/google/calendar/feed?${query.toString()}`,
      {
        method: "GET",
      },
    );
  }

  async createCalendarEvent(
    request: Omit<CreateLifeOpsCalendarEventRequest, "mode"> & {
      side: LifeOpsConnectorSide;
    },
  ): Promise<ManagedGoogleCalendarEventResponse> {
    return this.request<ManagedGoogleCalendarEventResponse>(
      "milady/google/calendar/events",
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    );
  }

  async getGmailTriage(args: {
    side: LifeOpsConnectorSide;
    maxResults: number;
  }): Promise<ManagedGoogleGmailTriageResponse> {
    const query = new URLSearchParams({
      side: args.side,
      maxResults: String(args.maxResults),
    });
    return this.request<ManagedGoogleGmailTriageResponse>(
      `milady/google/gmail/triage?${query.toString()}`,
      {
        method: "GET",
      },
    );
  }

  async getGmailSearch(args: {
    side: LifeOpsConnectorSide;
    query: string;
    maxResults: number;
  }): Promise<ManagedGoogleGmailSearchResponse> {
    const query = new URLSearchParams({
      side: args.side,
      query: args.query,
      maxResults: String(args.maxResults),
    });
    return this.request<ManagedGoogleGmailSearchResponse>(
      `milady/google/gmail/search?${query.toString()}`,
      {
        method: "GET",
      },
    );
  }

  async readGmailMessage(args: {
    side: LifeOpsConnectorSide;
    messageId: string;
  }): Promise<ManagedGoogleGmailReadResponse> {
    const query = new URLSearchParams({
      side: args.side,
      messageId: args.messageId,
    });
    return this.request<ManagedGoogleGmailReadResponse>(
      `milady/google/gmail/read?${query.toString()}`,
      {
        method: "GET",
      },
    );
  }

  async sendGmailReply(
    request: ManagedGoogleReplySendRequest,
  ): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("milady/google/gmail/reply-send", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }
}
