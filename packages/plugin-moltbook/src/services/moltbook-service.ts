import fs from "node:fs/promises";
import path from "node:path";
import { type IAgentRuntime, Service } from "@elizaos/core";
import { loadMoltbookConfig, type MoltbookConfig } from "../config.ts";

export interface MoltbookOnboardInput {
  name: string;
  description: string;
  metadata?: Record<string, unknown>;
  saveCredentials?: boolean;
  credentialsPath?: string;
}

export interface MoltbookOnboardResult {
  success: boolean;
  agentName: string;
  apiKey: string;
  claimUrl?: string;
  verificationCode?: string;
  credentialsSavedPath?: string;
  raw: unknown;
}

export interface MoltbookApiRequestInput {
  method?: string;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  requireAuth?: boolean;
}

export interface MoltbookApiResult {
  ok: boolean;
  status: number;
  method: string;
  path: string;
  data: unknown;
  error?: string;
}

export interface MoltbookStatus {
  available: boolean;
  apiBaseUrl: string;
  hasApiKey: boolean;
  credentialsPath: string;
  agentName?: string;
  timeoutMs: number;
  maxResponseChars: number;
  lastRequestAt?: number;
  lastStatus?: number;
  lastPath?: string;
  lastError?: string;
}

type CredentialsFile = {
  api_key?: unknown;
  agent_name?: unknown;
};

type FetchLike = (input: URL | string, init?: RequestInit) => Promise<Response>;

const BASE_PATH_PREFIX = "/api/v1";

function normalizeMethod(value: string | undefined): string {
  const method = (value ?? "GET").trim().toUpperCase();
  if (!method) return "GET";
  return method;
}

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Moltbook path is required");
  }
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error(
      "Moltbook path must be a relative API path. Full URLs are not allowed.",
    );
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function parseMaybeJson(rawText: string): unknown {
  if (!rawText) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function toMessageParts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => toNonEmptyString(entry))
      .filter((entry): entry is string => typeof entry === "string");
  }

  const direct = toNonEmptyString(value);
  return direct ? [direct] : [];
}

function describeApiError(status: number, data: unknown): string {
  if (typeof data === "string") {
    const raw = data.trim();
    return raw ? `${raw} (status ${status})` : `HTTP ${status}`;
  }

  const payload = asRecord(data);
  const messageParts = [
    ...toMessageParts(payload.error),
    ...toMessageParts(payload.message),
  ];
  const message = [...new Set(messageParts)].join("; ");
  const hint = toNonEmptyString(payload.hint);
  const retryAfterMinutes = toFiniteNumber(payload.retry_after_minutes);
  const retryAfterSeconds = toFiniteNumber(payload.retry_after_seconds);

  const parts: string[] = [];
  if (message) parts.push(message);
  if (hint) parts.push(`hint: ${hint}`);
  if (retryAfterMinutes !== undefined) {
    parts.push(
      `retry after ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}`,
    );
  }
  if (retryAfterSeconds !== undefined) {
    parts.push(
      `retry after ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}`,
    );
  }

  if (parts.length === 0) {
    return `HTTP ${status}`;
  }
  return `${parts.join(" | ")} (status ${status})`;
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n...[truncated by plugin-moltbook]`;
}

export class MoltbookService extends Service {
  static override serviceType = "moltbook";

  override capabilityDescription =
    "Register and interact with Moltbook using strict host-bound API safeguards.";

  private readonly runtimeConfig: MoltbookConfig;
  private readonly fetchImpl: FetchLike;

  private available = true;
  private cachedApiKey?: string;
  private cachedAgentName?: string;
  private credentialsLoaded = false;
  private lastRequestAt?: number;
  private lastStatus?: number;
  private lastPath?: string;
  private lastError?: string;

  constructor(
    runtime?: IAgentRuntime,
    config?: MoltbookConfig,
    deps?: { fetchImpl?: FetchLike },
  ) {
    super(runtime);
    this.runtimeConfig = config ?? loadMoltbookConfig(process.env);
    this.fetchImpl = deps?.fetchImpl ?? fetch.bind(globalThis);
    this.cachedApiKey = this.runtimeConfig.apiKey;
    this.cachedAgentName = this.runtimeConfig.agentName;
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    return new MoltbookService(runtime);
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(MoltbookService.serviceType);
    if (service && "stop" in service && typeof service.stop === "function") {
      await service.stop();
    }
  }

  async stop(): Promise<void> {
    this.available = false;
  }

  getStatus(): MoltbookStatus {
    return {
      available: this.available,
      apiBaseUrl: this.runtimeConfig.apiBaseUrl,
      hasApiKey: Boolean(this.cachedApiKey ?? this.runtimeConfig.apiKey),
      credentialsPath: this.runtimeConfig.credentialsPath,
      agentName: this.cachedAgentName ?? this.runtimeConfig.agentName,
      timeoutMs: this.runtimeConfig.timeoutMs,
      maxResponseChars: this.runtimeConfig.maxResponseChars,
      lastRequestAt: this.lastRequestAt,
      lastStatus: this.lastStatus,
      lastPath: this.lastPath,
      lastError: this.lastError,
    };
  }

  async onboardAgent(
    input: MoltbookOnboardInput,
  ): Promise<MoltbookOnboardResult> {
    const name = input.name.trim();
    const description = input.description.trim();

    if (!name) {
      throw new Error("Moltbook onboarding requires a non-empty agent name");
    }
    if (!description) {
      throw new Error(
        "Moltbook onboarding requires a non-empty agent description",
      );
    }

    const result = await this.sendRequest({
      method: "POST",
      path: "/agents/register",
      requireAuth: false,
      body: {
        name,
        description,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    });

    if (!result.ok) {
      throw new Error(
        `Moltbook onboarding failed: ${describeApiError(result.status, result.data)}`,
      );
    }

    const payload = asRecord(result.data);
    const agent = asRecord(payload.agent);

    const apiKey =
      typeof agent.api_key === "string" ? agent.api_key.trim() : "";
    const claimUrl =
      typeof agent.claim_url === "string" ? agent.claim_url.trim() : undefined;
    const verificationCode =
      typeof agent.verification_code === "string"
        ? agent.verification_code.trim()
        : undefined;

    if (!apiKey) {
      throw new Error(
        "Moltbook onboarding response did not include agent.api_key",
      );
    }

    this.cachedApiKey = apiKey;
    this.cachedAgentName = name;

    let credentialsSavedPath: string | undefined;
    if (input.saveCredentials !== false) {
      credentialsSavedPath = await this.saveCredentials({
        apiKey,
        agentName: name,
        credentialsPath: input.credentialsPath,
      });
    }

    return {
      success: result.ok,
      agentName: name,
      apiKey,
      claimUrl,
      verificationCode,
      credentialsSavedPath,
      raw: result.data,
    };
  }

  async request(input: MoltbookApiRequestInput): Promise<MoltbookApiResult> {
    const result = await this.sendRequest(input);
    return {
      ok: result.ok,
      status: result.status,
      method: normalizeMethod(input.method),
      path: normalizePath(input.path),
      data: result.data,
      error: result.ok
        ? undefined
        : typeof (result.data as { error?: unknown })?.error === "string"
          ? String((result.data as { error?: unknown }).error)
          : `Moltbook request failed with status ${result.status}`,
    };
  }

  private async sendRequest(
    input: MoltbookApiRequestInput,
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const method = normalizeMethod(input.method);
    const requireAuth = input.requireAuth !== false;
    const url = this.buildApiUrl(input.path, input.query);

    const headers = new Headers({
      Accept: "application/json",
    });

    let body: string | undefined;
    if (typeof input.body !== "undefined") {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(input.body);
    }

    if (requireAuth) {
      const apiKey = await this.resolveApiKey();
      if (!apiKey) {
        throw new Error(
          "Moltbook API key is required. Set MOLTBOOK_API_KEY or onboard with saveCredentials enabled.",
        );
      }
      headers.set("Authorization", `Bearer ${apiKey}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.runtimeConfig.timeoutMs,
    );

    const startedAt = Date.now();
    this.lastRequestAt = startedAt;
    this.lastPath = url.pathname;
    this.lastError = undefined;

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      const text = await response.text();
      const parsed = parseMaybeJson(
        truncateText(text, this.runtimeConfig.maxResponseChars),
      );

      this.lastStatus = response.status;
      if (!response.ok) {
        const errorText =
          typeof parsed === "string"
            ? parsed
            : typeof (parsed as { error?: unknown })?.error === "string"
              ? String((parsed as { error?: unknown }).error)
              : `HTTP ${response.status}`;
        this.lastError = errorText;
      }

      return {
        ok: response.ok,
        status: response.status,
        data: parsed,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.name === "AbortError"
            ? `Moltbook request timed out after ${this.runtimeConfig.timeoutMs}ms`
            : error.message
          : String(error);
      this.lastError = message;
      throw new Error(message);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildApiUrl(
    inputPath: string,
    query: Record<string, unknown> | undefined,
  ): URL {
    const pathValue = normalizePath(inputPath);

    const normalizedInputPath =
      pathValue === BASE_PATH_PREFIX
        ? "/"
        : pathValue.startsWith(`${BASE_PATH_PREFIX}/`)
          ? pathValue.slice(BASE_PATH_PREFIX.length)
          : pathValue;

    const relativePath = normalizedInputPath.replace(/^\/+/, "");
    const base = new URL(
      `${this.runtimeConfig.apiBaseUrl.replace(/\/+$/, "")}/`,
    );
    const url = new URL(relativePath, base);

    if (url.protocol !== "https:" || url.hostname !== "www.moltbook.com") {
      throw new Error(
        "Moltbook requests are restricted to https://www.moltbook.com only",
      );
    }

    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
    if (
      normalizedPath !== BASE_PATH_PREFIX &&
      !normalizedPath.startsWith(`${BASE_PATH_PREFIX}/`)
    ) {
      throw new Error(
        `Moltbook request path must stay within ${BASE_PATH_PREFIX}. Received: ${url.pathname}`,
      );
    }

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (typeof value === "undefined" || value === null) continue;
        if (Array.isArray(value)) {
          for (const item of value) {
            url.searchParams.append(key, String(item));
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url;
  }

  private async resolveApiKey(): Promise<string | undefined> {
    const direct = this.runtimeConfig.apiKey?.trim();
    if (direct) {
      return direct;
    }

    const cached = this.cachedApiKey?.trim();
    if (cached) {
      return cached;
    }

    if (this.credentialsLoaded) {
      return undefined;
    }

    this.credentialsLoaded = true;
    try {
      const raw = await fs.readFile(this.runtimeConfig.credentialsPath, "utf8");
      const parsed = JSON.parse(raw) as CredentialsFile;
      const fileApiKey =
        typeof parsed.api_key === "string" ? parsed.api_key.trim() : "";
      const fileAgentName =
        typeof parsed.agent_name === "string" ? parsed.agent_name.trim() : "";

      if (fileApiKey) {
        this.cachedApiKey = fileApiKey;
      }
      if (fileAgentName) {
        this.cachedAgentName = fileAgentName;
      }

      return fileApiKey || undefined;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Unable to read Moltbook credentials: ${String(error)}`;
      this.lastError = message;
      return undefined;
    }
  }

  private async saveCredentials(params: {
    apiKey: string;
    agentName: string;
    credentialsPath?: string;
  }): Promise<string> {
    const outputPath = path.resolve(
      params.credentialsPath?.trim() || this.runtimeConfig.credentialsPath,
    );

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const payload = {
      api_key: params.apiKey,
      agent_name: params.agentName,
    };
    await fs.writeFile(
      `${outputPath}.tmp`,
      `${JSON.stringify(payload, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
    await fs.rename(`${outputPath}.tmp`, outputPath);

    return outputPath;
  }
}
