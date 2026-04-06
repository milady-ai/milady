export type LinkedAccountStatus = "linked" | "unlinked";

export type LinkedAccountSource =
  | "api-key"
  | "oauth"
  | "credentials"
  | "subscription";

export type LinkedAccountConfig = {
  status?: LinkedAccountStatus;
  source?: LinkedAccountSource;
  userId?: string;
  organizationId?: string;
};

export type LinkedAccountsConfig = Record<string, LinkedAccountConfig>;

export type ServiceCapability =
  | "llmText"
  | "tts"
  | "media"
  | "embeddings"
  | "rpc";

export type ServiceTransport = "direct" | "cloud-proxy" | "remote";

export type ServiceRouteConfig = {
  backend?: string;
  transport?: ServiceTransport;
  accountId?: string;
  primaryModel?: string;
  smallModel?: string;
  largeModel?: string;
  remoteApiBase?: string;

  /**
   * Per-step model overrides for the fine-tuned pipeline.
   * Each step can specify a model ID (e.g., a Vertex AI fine-tuned endpoint).
   * Falls back to: stepModel -> plugin override -> smallModel/largeModel -> system default.
   */
  shouldRespondModel?: string;
  plannerModel?: string;
  responseModel?: string;
  mediaDescriptionModel?: string;
};

export type ServiceRoutingConfig = Partial<
  Record<ServiceCapability, ServiceRouteConfig>
>;

const ELIZA_CLOUD_ROUTE_BASE = {
  backend: "elizacloud",
  transport: "cloud-proxy",
  accountId: "elizacloud",
} as const satisfies Pick<
  ServiceRouteConfig,
  "backend" | "transport" | "accountId"
>;

const ELIZA_CLOUD_DEFAULT_SERVICE_CAPABILITIES = [
  "tts",
  "media",
  "embeddings",
  "rpc",
] as const satisfies readonly Exclude<ServiceCapability, "llmText">[];

export type DeploymentTargetRuntime = "local" | "cloud" | "remote";

export type DeploymentTargetConfig = {
  runtime: DeploymentTargetRuntime;
  provider?: "elizacloud" | "remote";
  remoteApiBase?: string;
  remoteAccessToken?: string;
};

export const SERVICE_CAPABILITIES = [
  "llmText",
  "tts",
  "media",
  "embeddings",
  "rpc",
] as const satisfies readonly ServiceCapability[];

export function buildElizaCloudServiceRoute(args: {
  smallModel?: string;
  largeModel?: string;
} = {}): ServiceRouteConfig {
  return {
    ...ELIZA_CLOUD_ROUTE_BASE,
    ...(args.smallModel ? { smallModel: args.smallModel } : {}),
    ...(args.largeModel ? { largeModel: args.largeModel } : {}),
  };
}

export function buildDefaultElizaCloudServiceRouting(args: {
  base?: ServiceRoutingConfig | null;
  includeInference?: boolean;
  smallModel?: string;
  largeModel?: string;
} = {}): ServiceRoutingConfig {
  const next: ServiceRoutingConfig = { ...(args.base ?? {}) };

  for (const capability of ELIZA_CLOUD_DEFAULT_SERVICE_CAPABILITIES) {
    next[capability] ??= buildElizaCloudServiceRoute();
  }

  if (args.includeInference) {
    next.llmText ??= buildElizaCloudServiceRoute({
      smallModel: args.smallModel,
      largeModel: args.largeModel,
    });
  }

  return next;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readTrimmedString(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const value = source?.[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeLinkedAccountStatus(
  value: unknown,
): LinkedAccountStatus | undefined {
  return value === "linked" || value === "unlinked" ? value : undefined;
}

function normalizeLinkedAccountSource(
  value: unknown,
): LinkedAccountSource | undefined {
  return value === "api-key" ||
    value === "oauth" ||
    value === "credentials" ||
    value === "subscription"
    ? value
    : undefined;
}

function normalizeServiceTransport(
  value: unknown,
): ServiceTransport | undefined {
  return value === "direct" ||
    value === "cloud-proxy" ||
    value === "remote"
    ? value
    : undefined;
}

export function normalizeLinkedAccountConfig(
  value: unknown,
): LinkedAccountConfig | null {
  const account = asRecord(value);
  if (!account) {
    return null;
  }

  const status = normalizeLinkedAccountStatus(account.status);
  const source = normalizeLinkedAccountSource(account.source);
  const userId = readTrimmedString(account, "userId");
  const organizationId = readTrimmedString(account, "organizationId");

  if (!status && !source && !userId && !organizationId) {
    return null;
  }

  return {
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
    ...(userId ? { userId } : {}),
    ...(organizationId ? { organizationId } : {}),
  };
}

export function normalizeLinkedAccountsConfig(
  value: unknown,
): LinkedAccountsConfig | null {
  const accounts = asRecord(value);
  if (!accounts) {
    return null;
  }

  const normalizedEntries: Array<[string, LinkedAccountConfig]> = [];
  for (const [accountId, accountValue] of Object.entries(accounts)) {
    const trimmedAccountId = accountId.trim();
    const normalizedAccount = normalizeLinkedAccountConfig(accountValue);
    if (!trimmedAccountId || !normalizedAccount) {
      continue;
    }
    normalizedEntries.push([trimmedAccountId, normalizedAccount]);
  }

  const normalized = Object.fromEntries(normalizedEntries);

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function normalizeServiceRouteConfig(
  value: unknown,
): ServiceRouteConfig | null {
  const route = asRecord(value);
  if (!route) {
    return null;
  }

  const backend = readTrimmedString(route, "backend");
  const transport = normalizeServiceTransport(route.transport);
  const accountId = readTrimmedString(route, "accountId");
  const primaryModel = readTrimmedString(route, "primaryModel");
  const smallModel = readTrimmedString(route, "smallModel");
  const largeModel = readTrimmedString(route, "largeModel");
  const remoteApiBase = readTrimmedString(route, "remoteApiBase");

  if (
    !backend &&
    !transport &&
    !accountId &&
    !primaryModel &&
    !smallModel &&
    !largeModel &&
    !remoteApiBase
  ) {
    return null;
  }

  return {
    ...(backend ? { backend } : {}),
    ...(transport ? { transport } : {}),
    ...(accountId ? { accountId } : {}),
    ...(primaryModel ? { primaryModel } : {}),
    ...(smallModel ? { smallModel } : {}),
    ...(largeModel ? { largeModel } : {}),
    ...(remoteApiBase ? { remoteApiBase } : {}),
  };
}

export function normalizeServiceRoutingConfig(
  value: unknown,
): ServiceRoutingConfig | null {
  const routing = asRecord(value);
  if (!routing) {
    return null;
  }

  const normalized = Object.fromEntries(
    SERVICE_CAPABILITIES.map((capability) => [
      capability,
      normalizeServiceRouteConfig(routing[capability]),
    ]).filter(
      (entry): entry is [ServiceCapability, ServiceRouteConfig] =>
        entry[1] !== null,
    ),
  );

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function normalizeDeploymentTargetConfig(
  value: unknown,
): DeploymentTargetConfig | null {
  const target = asRecord(value);
  if (!target) {
    return null;
  }

  const runtime =
    target.runtime === "local" ||
    target.runtime === "cloud" ||
    target.runtime === "remote"
      ? target.runtime
      : null;
  if (!runtime) {
    return null;
  }

  const provider =
    target.provider === "elizacloud" || target.provider === "remote"
      ? target.provider
      : undefined;

  return {
    runtime,
    ...(provider ? { provider } : {}),
    ...(readTrimmedString(target, "remoteApiBase")
      ? { remoteApiBase: readTrimmedString(target, "remoteApiBase") }
      : {}),
    ...(readTrimmedString(target, "remoteAccessToken")
      ? { remoteAccessToken: readTrimmedString(target, "remoteAccessToken") }
      : {}),
  };
}
