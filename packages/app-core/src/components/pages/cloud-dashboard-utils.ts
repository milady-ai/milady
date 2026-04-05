import type {
  CloudBillingCheckoutResponse,
  CloudBillingSettings,
  CloudBillingSummary,
} from "../../api";

export const ELIZA_CLOUD_INSTANCES_URL =
  "https://www.elizacloud.ai/dashboard/eliza";
/** Marketing / docs site — "Learn more" when not connected (in-app browser on desktop). */
export const ELIZA_CLOUD_WEB_URL = "https://elizacloud.ai";
export const BILLING_PRESET_AMOUNTS = [10, 25, 100];
export const CLOUD_PANEL_CLASSNAME =
  "rounded-2xl border border-border/60 bg-card/88 p-4 shadow-sm";
export const CLOUD_INSET_PANEL_CLASSNAME =
  "rounded-xl border border-border/50 bg-bg/30 p-4";
export const CLOUD_ACCENT_CONTROL_TEXT_CLASSNAME =
  "text-txt-strong hover:text-txt-strong";
export const CLOUD_STATUS_API_KEY_ONLY_REASONS: ReadonlySet<string> = new Set([
  "api_key_present_not_authenticated",
  "api_key_present_runtime_not_started",
]);

export const STATUS_BADGE: Record<
  string,
  { i18nKey: string; className: string }
> = {
  running: {
    i18nKey: "elizaclouddashboard.statusRunning",
    className: "bg-ok/10 text-ok border-ok/20",
  },
  queued: {
    i18nKey: "elizaclouddashboard.statusQueued",
    className: "bg-warn/10 text-warn border-warn/20",
  },
  provisioning: {
    i18nKey: "elizaclouddashboard.statusProvisioning",
    className: "bg-accent/10 text-txt border-accent/20",
  },
  stopped: {
    i18nKey: "elizaclouddashboard.statusStopped",
    className: "bg-muted/10 text-muted border-border/40",
  },
  failed: {
    i18nKey: "elizaclouddashboard.statusFailed",
    className: "bg-danger/10 text-danger border-danger/20",
  },
};

export function getCloudAuthToken(): string {
  if (typeof window === "undefined") return "";
  return (
    ((window as unknown as Record<string, unknown>)
      .__ELIZA_CLOUD_AUTH_TOKEN__ as string) || ""
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCloudStatusReasonApiKeyOnly(
  reason: string | null | undefined,
): boolean {
  return (
    typeof reason === "string" && CLOUD_STATUS_API_KEY_ONLY_REASONS.has(reason)
  );
}

export function resolveCloudAccountIdDisplay(
  userId: string | null,
  statusReason: string | null,
  t: (key: string) => string,
): { mono: boolean; text: string } {
  if (userId) {
    return { mono: true, text: userId };
  }
  if (isCloudStatusReasonApiKeyOnly(statusReason)) {
    return { mono: false, text: t("elizaclouddashboard.AccountIdApiKeyOnly") };
  }
  return {
    mono: false,
    text: t("elizaclouddashboard.AccountIdSessionNoUserId"),
  };
}

export function unwrapBillingData<T extends Record<string, unknown>>(
  value: T,
): T {
  if (isRecord(value.data)) {
    return value.data as T;
  }
  return value;
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export interface ManagedDiscordCallbackState {
  status: "connected" | "error";
  agentId: string | null;
  guildId: string | null;
  guildName: string | null;
  managed: boolean;
  message: string | null;
  restarted: boolean;
}

const MANAGED_DISCORD_CALLBACK_QUERY_KEYS = [
  "discord",
  "managed",
  "agentId",
  "guildId",
  "guildName",
  "restarted",
  "message",
] as const;

export function consumeManagedDiscordCallbackUrl(rawUrl: string): {
  callback: ManagedDiscordCallbackState | null;
  cleanedUrl: string | null;
} {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { callback: null, cleanedUrl: null };
  }

  const status = url.searchParams.get("discord");
  const managed = url.searchParams.get("managed") === "1";
  if ((status !== "connected" && status !== "error") || !managed) {
    return { callback: null, cleanedUrl: null };
  }

  const callback: ManagedDiscordCallbackState = {
    status,
    managed,
    agentId: readString(url.searchParams.get("agentId")) ?? null,
    guildId: readString(url.searchParams.get("guildId")) ?? null,
    guildName: readString(url.searchParams.get("guildName")) ?? null,
    message: readString(url.searchParams.get("message")) ?? null,
    restarted: url.searchParams.get("restarted") === "1",
  };

  for (const key of MANAGED_DISCORD_CALLBACK_QUERY_KEYS) {
    url.searchParams.delete(key);
  }

  return {
    callback,
    cleanedUrl: url.toString(),
  };
}

export function normalizeBillingSummary(
  raw: CloudBillingSummary,
): CloudBillingSummary {
  const source = unwrapBillingData(raw);
  return {
    ...raw,
    ...source,
    balance:
      readNumber(source.balance) ??
      readNumber((source as Record<string, unknown>).creditBalance) ??
      null,
    currency:
      readString(source.currency) ??
      readString((source as Record<string, unknown>).balanceCurrency),
    topUpUrl:
      readString(source.topUpUrl) ??
      readString((source as Record<string, unknown>).billingUrl),
    embeddedCheckoutEnabled:
      readBoolean(source.embeddedCheckoutEnabled) ??
      readBoolean((source as Record<string, unknown>).embedded),
    hostedCheckoutEnabled:
      readBoolean(source.hostedCheckoutEnabled) ??
      readBoolean((source as Record<string, unknown>).hosted),
    cryptoEnabled:
      readBoolean(source.cryptoEnabled) ??
      readBoolean((source as Record<string, unknown>).crypto),
    low: readBoolean(source.low),
    critical: readBoolean(source.critical),
  };
}

export function normalizeBillingSettings(
  raw: CloudBillingSettings,
): CloudBillingSettings {
  const source = unwrapBillingData(raw);
  return {
    ...raw,
    ...source,
    settings: isRecord(source.settings) ? source.settings : raw.settings,
  };
}

export function getBillingAutoTopUp(
  settings: CloudBillingSettings | null,
): Record<string, unknown> {
  const rawSettings = isRecord(settings?.settings) ? settings.settings : null;
  return isRecord(rawSettings?.autoTopUp) ? rawSettings.autoTopUp : {};
}

export function getBillingLimits(
  settings: CloudBillingSettings | null,
): Record<string, unknown> {
  const rawSettings = isRecord(settings?.settings) ? settings.settings : null;
  return isRecord(rawSettings?.limits) ? rawSettings.limits : {};
}

export function resolveCheckoutUrl(
  response: CloudBillingCheckoutResponse,
): string | null {
  return (
    readString(response.checkoutUrl) ??
    readString(response.url) ??
    readString((response as Record<string, unknown>).hostedUrl) ??
    null
  );
}

export interface AutoTopUpFormState {
  amount: string;
  dirty: boolean;
  enabled: boolean;
  sourceKey: string;
  threshold: string;
}

export type AutoTopUpFormAction =
  | { type: "hydrate"; next: AutoTopUpFormState; force?: boolean }
  | { type: "setAmount"; value: string }
  | { type: "setEnabled"; value: boolean }
  | { type: "setThreshold"; value: string };

export function buildAutoTopUpFormState(
  billingSummary: CloudBillingSummary | null,
  billingSettings: CloudBillingSettings | null,
): AutoTopUpFormState {
  const autoTopUp = getBillingAutoTopUp(billingSettings);
  const minimumTopUp =
    readNumber(
      (billingSummary as Record<string, unknown> | null)?.minimumTopUp,
    ) ?? 1;
  const enabled = readBoolean(autoTopUp.enabled) ?? false;
  const amount = String(readNumber(autoTopUp.amount) ?? minimumTopUp);
  const threshold = String(readNumber(autoTopUp.threshold) ?? 5);
  return {
    amount,
    dirty: false,
    enabled,
    sourceKey: JSON.stringify([enabled, amount, threshold]),
    threshold,
  };
}

export function autoTopUpFormReducer(
  state: AutoTopUpFormState,
  action: AutoTopUpFormAction,
): AutoTopUpFormState {
  switch (action.type) {
    case "hydrate":
      if (!action.force && state.dirty) {
        return state;
      }
      if (state.sourceKey === action.next.sourceKey && !state.dirty) {
        return state;
      }
      return action.next;
    case "setAmount":
      return { ...state, amount: action.value, dirty: true };
    case "setEnabled":
      return { ...state, enabled: action.value, dirty: true };
    case "setThreshold":
      return { ...state, threshold: action.value, dirty: true };
    default:
      return state;
  }
}
