import http from "node:http";
import { logger } from "@elizaos/core";
import {
  loadElizaConfig,
  saveElizaConfig,
} from "@miladyai/agent/config/config";
import { ensureCompatApiAuthorized } from "./auth";
import { type CompatRuntimeState } from "./compat-route-shared";
import { getCloudSecret } from "./cloud-secrets";
import { sendJson as sendJsonResponse } from "./response";
import {
  normalizeOnboardingProviderId,
  migrateLegacyRuntimeConfig,
} from "@miladyai/shared/contracts/onboarding";
import {
  normalizeDeploymentTargetConfig,
  normalizeLinkedAccountsConfig,
  normalizeServiceRoutingConfig,
} from "@miladyai/shared/contracts/service-routing";
import { applyCanonicalOnboardingConfig } from "@miladyai/agent/api/provider-switch-config";
import {
  deriveCompatOnboardingReplayBody,
  extractAndPersistOnboardingApiKey,
  hasLegacyOnboardingRequestFields,
  persistCompatOnboardingDefaults,
} from "./server-onboarding-compat";

function scheduleCloudApiKeyResave(apiKey: string): void {
  setTimeout(() => {
    try {
      const freshConfig = loadElizaConfig();
      if (!freshConfig.cloud?.apiKey) {
        if (!freshConfig.cloud) {
          (freshConfig as Record<string, unknown>).cloud = {};
        }
        (freshConfig.cloud as Record<string, unknown>).apiKey = apiKey;
        migrateLegacyRuntimeConfig(freshConfig as Record<string, unknown>);
        saveElizaConfig(freshConfig);
        logger.info(
          "[milady-api] Re-saved cloud.apiKey after upstream handler clobbered it",
        );
      }
    } catch {
      // Non-fatal
    }
  }, 3000);
}

export async function handleOnboardingCompatRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: CompatRuntimeState,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", "http://localhost");
  if (method !== "POST" || url.pathname !== "/api/onboarding") {
    return false;
  }

  if (!ensureCompatApiAuthorized(req, res)) {
    return true;
  }

  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
  } catch {
    req.push(null);
    return false;
  }
  const rawBody = Buffer.concat(chunks);

  let replayBody = rawBody;
  let capturedCloudApiKey: string | undefined;

  try {
    const body = JSON.parse(rawBody.toString("utf8")) as Record<
      string,
      unknown
    >;
    if (hasLegacyOnboardingRequestFields(body)) {
      sendJsonResponse(res, 400, {
        error:
          "legacy onboarding payloads are no longer supported; send deploymentTarget, linkedAccounts, serviceRouting, and credentialInputs",
      });
      return true;
    }
    await extractAndPersistOnboardingApiKey(body);
    persistCompatOnboardingDefaults(body);
    if (typeof body.name === "string" && body.name.trim()) {
      state.pendingAgentName = body.name.trim();
    }

    const { replayBody: replayBodyRecord } =
      deriveCompatOnboardingReplayBody(body);
    const replayDeploymentTarget = normalizeDeploymentTargetConfig(
      replayBodyRecord.deploymentTarget,
    );
    const replayLinkedAccounts = normalizeLinkedAccountsConfig(
      replayBodyRecord.linkedAccounts,
    );
    const replayServiceRouting = normalizeServiceRoutingConfig(
      replayBodyRecord.serviceRouting,
    );
    const cloudInferenceSelected = Boolean(
      replayServiceRouting?.llmText?.transport === "cloud-proxy" &&
        normalizeOnboardingProviderId(replayServiceRouting.llmText.backend) ===
          "elizacloud",
    );
    const shouldResolveCloudApiKey =
      replayDeploymentTarget?.runtime === "cloud" ||
      cloudInferenceSelected ||
      replayLinkedAccounts?.elizacloud?.status === "linked";

    // Resolve the cloud API key so the upstream handler can write it
    // into state.config before saving. Without this, the upstream uses
    // its stale in-memory config (loaded at startup, before OAuth) and
    // clobbers the apiKey that persistCloudLoginStatus wrote to disk.
    let resolvedCloudApiKey: string | undefined;

    try {
      const config = loadElizaConfig();
      if (!config.meta) {
        (config as Record<string, unknown>).meta = {};
      }
      (config.meta as Record<string, unknown>).onboardingComplete = true;
      applyCanonicalOnboardingConfig(config as never, {
        deploymentTarget: replayDeploymentTarget,
        linkedAccounts: replayLinkedAccounts,
        serviceRouting: replayServiceRouting,
      });

      if (shouldResolveCloudApiKey) {
        if (!config.cloud) {
          (config as Record<string, unknown>).cloud = {};
        }

        resolvedCloudApiKey = (config.cloud as Record<string, unknown>)
          .apiKey as string | undefined;

        if (!resolvedCloudApiKey) {
          resolvedCloudApiKey =
            getCloudSecret("ELIZAOS_CLOUD_API_KEY") ?? undefined;
          if (resolvedCloudApiKey) {
            (config.cloud as Record<string, unknown>).apiKey =
              resolvedCloudApiKey;
          }
        }

        if (!resolvedCloudApiKey) {
          resolvedCloudApiKey = process.env.ELIZAOS_CLOUD_API_KEY;
          if (resolvedCloudApiKey) {
            (config.cloud as Record<string, unknown>).apiKey =
              resolvedCloudApiKey;
          }
        }

        if (!resolvedCloudApiKey) {
          logger.warn(
            "[milady-api] Cloud-linked onboarding but no API key found on disk, in sealed secrets, or in env. " +
              "The upstream handler will save config WITHOUT cloud.apiKey.",
          );
        } else {
          logger.info(
            "[milady-api] Cloud-linked onboarding: resolved API key, injecting into replay body",
          );
        }

        capturedCloudApiKey = resolvedCloudApiKey;
      }
      saveElizaConfig(config);
    } catch (err) {
      logger.warn(
        `[milady-api] Failed to persist onboarding state: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (replayBodyRecord !== body) {
      replayBody = Buffer.from(JSON.stringify(replayBodyRecord), "utf8");
    }
  } catch {
    // JSON parse failed — let upstream handle the error
  }

  sendJsonResponse(res, 200, { ok: true });

  if (capturedCloudApiKey) {
    scheduleCloudApiKeyResave(capturedCloudApiKey);
  }

  req.push(replayBody);
  req.push(null);
  return false;
}
