import { deriveOnboardingResumeConnection } from "./onboarding-resume";
import type { PersistedConnectionMode } from "./persistence";

export interface ExistingOnboardingProbeClient {
  apiAvailable: boolean;
  getOnboardingStatus: () => Promise<{ complete: boolean }>;
  getConfig: () => Promise<Record<string, unknown> | null | undefined>;
}

export interface ExistingOnboardingProbeResult {
  connection: PersistedConnectionMode;
  detectedExistingInstall: boolean;
}

export interface DetectedProviderCandidate {
  id: string;
  apiKey?: string;
}

const LOCAL_CONNECTION: PersistedConnectionMode = { runMode: "local" };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readString(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = source?.[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasPersistedExistingInstallConfig(
  config: Record<string, unknown> | null | undefined,
): boolean {
  if (!config) {
    return false;
  }

  if (deriveOnboardingResumeConnection(config)) {
    return true;
  }

  const meta = asRecord(config.meta);
  if (meta?.onboardingComplete === true) {
    return true;
  }

  const agents = asRecord(config.agents);
  if (!agents) {
    return false;
  }

  const list = agents.list;
  if (Array.isArray(list) && list.length > 0) {
    return true;
  }

  const defaults = asRecord(agents.defaults);
  return Boolean(
    readString(defaults, "workspace") || readString(defaults, "adminEntityId"),
  );
}

export async function detectExistingOnboardingConnection(args: {
  client: ExistingOnboardingProbeClient;
  timeoutMs: number;
}): Promise<ExistingOnboardingProbeResult | null> {
  if (!args.client.apiAvailable) {
    return null;
  }

  const timeoutToken = Symbol("onboarding-bootstrap-timeout");
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const result = await Promise.race([
    (async () => {
      const status = await args.client.getOnboardingStatus().catch(() => null);
      if (!status) {
        return null;
      }

      if (status.complete) {
        return {
          connection: LOCAL_CONNECTION,
          detectedExistingInstall: true,
        } satisfies ExistingOnboardingProbeResult;
      }

      const config = await args.client.getConfig().catch(() => null);
      if (!hasPersistedExistingInstallConfig(config)) {
        return null;
      }

      return {
        connection: LOCAL_CONNECTION,
        detectedExistingInstall: true,
      } satisfies ExistingOnboardingProbeResult;
    })(),
    new Promise<typeof timeoutToken>((resolve) => {
      timeoutId = setTimeout(() => resolve(timeoutToken), args.timeoutMs);
    }),
  ]);
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
  }

  return result === timeoutToken ? null : result;
}

export function deriveDetectedProviderPrefill(
  detected: readonly DetectedProviderCandidate[],
): {
  runMode: "local";
  providerId: string;
  apiKey: string;
} | null {
  for (const candidate of detected) {
    const providerId = candidate.id.trim();
    const apiKey = candidate.apiKey?.trim() ?? "";
    if (providerId && apiKey) {
      return {
        runMode: "local",
        providerId,
        apiKey,
      };
    }
  }

  return null;
}
