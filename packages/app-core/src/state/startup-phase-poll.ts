/**
 * startup-phase-poll.ts
 *
 * Side-effect logic for the "polling-backend" startup phase.
 * Polls the backend until it responds, then dispatches BACKEND_REACHED
 * or an appropriate error/auth event.
 */

import { client } from "../api";
import { getBackendStartupTimeoutMs } from "../bridge";
import { scanProviderCredentials } from "../bridge";
import {
  asApiLikeError,
  clearPersistedOnboardingStep,
  deriveOnboardingResumeFieldsFromConfig,
  formatStartupErrorDetail,
  inferOnboardingResumeStep,
  type StartupErrorState,
} from "./internal";
import {
  loadPersistedOnboardingStep,
  savePersistedActiveServer,
} from "./persistence";
import { getStylePresets } from "@miladyai/shared/onboarding-presets";
import type { StartupEvent, PlatformPolicy } from "./startup-coordinator";
import type { StartupCoordinatorDeps } from "./useStartupCoordinator";
import type { RestoringSessionCtx } from "./startup-phase-restore";

/**
 * Runs the polling-backend phase.
 * Polls /auth/status and /onboarding/status until the backend is reachable
 * and onboarding state is determined.
 *
 * @param deps - Coordinator dependency bag
 * @param dispatch - startupReducer dispatch
 * @param policy - Platform policy (timeout etc.)
 * @param ctx - Session context populated by the restoring-session phase
 * @param effectRunId - The run ID of the calling effect (for stale-close guard)
 * @param effectRunRef - Shared ref tracking the latest run ID
 * @param cancelled - Ref-flag set true by the cleanup function
 * @param tidRef - Mutable ref for the pending setTimeout handle (for cleanup)
 */
export async function runPollingBackend(
  deps: StartupCoordinatorDeps,
  dispatch: (event: StartupEvent) => void,
  policy: PlatformPolicy,
  ctx: RestoringSessionCtx | null,
  effectRunId: number,
  effectRunRef: React.MutableRefObject<number>,
  cancelled: { current: boolean },
  tidRef: { current: ReturnType<typeof setTimeout> | null },
): Promise<void> {
  const describeBackendFailure = (
    err: unknown,
    timedOut: boolean,
  ): StartupErrorState => {
    const apiErr = asApiLikeError(err);
    if (apiErr?.kind === "http" && apiErr.status === 404)
      return {
        reason: "backend-unreachable",
        phase: "starting-backend",
        message:
          "Backend API routes are unavailable on this origin (received 404).",
        detail: formatStartupErrorDetail(err),
        status: apiErr.status,
        path: apiErr.path,
      };
    if (timedOut || apiErr?.kind === "timeout")
      return {
        reason: "backend-timeout",
        phase: "starting-backend",
        message: `Backend did not become reachable within ${Math.round(getBackendStartupTimeoutMs() / 1000)}s.`,
        detail: formatStartupErrorDetail(err),
        status: apiErr?.status,
        path: apiErr?.path,
      };
    return {
      reason: "backend-unreachable",
      phase: "starting-backend",
      message: "Failed to reach backend during startup.",
      detail: formatStartupErrorDetail(err),
      status: apiErr?.status,
      path: apiErr?.path,
    };
  };

  const deadline = Date.now() + policy.backendTimeoutMs;
  let attempts = 0;
  let lastErr: unknown = null;
  let latestAuth = {
    required: false,
    pairingEnabled: false,
    expiresAt: null as number | null,
  };

  while (!cancelled.current && effectRunRef.current === effectRunId) {
    if (Date.now() >= deadline) {
      deps.setStartupError(describeBackendFailure(lastErr, true));
      deps.setOnboardingLoading(false);
      dispatch({ type: "BACKEND_TIMEOUT" });
      return;
    }
    try {
      const auth = await client.getAuthStatus();
      latestAuth = auth;
      if (cancelled.current) return;
      if (auth.required && !client.hasToken()) {
        deps.setAuthRequired(true);
        deps.setPairingEnabled(auth.pairingEnabled);
        deps.setPairingExpiresAt(auth.expiresAt);
        deps.setStartupPhase("ready");
        deps.setOnboardingLoading(false);
        dispatch({ type: "BACKEND_AUTH_REQUIRED" });
        return;
      }
      const { complete } = await client.getOnboardingStatus();
      if (cancelled.current) return;
      let sessionComplete =
        complete ||
        deps.onboardingCompletionCommittedRef.current ||
        (ctx?.shouldPreserveCompletedOnboarding ?? false);

      if (
        sessionComplete &&
        !ctx?.persistedActiveServer &&
        !ctx?.hadPriorOnboarding
      ) {
        sessionComplete = false;
      }

      if (complete && sessionComplete) {
        clearPersistedOnboardingStep();
      }
      if (
        sessionComplete &&
        !ctx?.persistedActiveServer &&
        ctx?.restoredActiveServer
      ) {
        savePersistedActiveServer(ctx.restoredActiveServer);
      }
      if (!complete && ctx?.shouldPreserveCompletedOnboarding)
        console.warn(
          "[milady][startup:init] Preserving completed onboarding despite incomplete backend onboarding status.",
        );
      deps.setOnboardingComplete(sessionComplete);

      if (!sessionComplete) {
        // Fetch onboarding options
        const optDeadline = Date.now() + getBackendStartupTimeoutMs();
        let optErr: unknown = null;
        while (!cancelled.current && effectRunRef.current === effectRunId) {
          if (Date.now() >= optDeadline) {
            deps.setStartupError(describeBackendFailure(optErr, true));
            deps.setOnboardingLoading(false);
            dispatch({ type: "BACKEND_TIMEOUT" });
            return;
          }
          try {
            const [options, config] = await Promise.all([
              client.getOnboardingOptions(),
              client.getConfig().catch(() => null),
            ]);
            if (deps.onboardingCompletionCommittedRef.current) {
              deps.setStartupPhase("ready");
              deps.setOnboardingLoading(false);
              dispatch({ type: "ONBOARDING_COMPLETE" });
              return;
            }
            const rf = deriveOnboardingResumeFieldsFromConfig(config);
            deps.setOnboardingOptions({
              ...options,
              styles:
                options.styles.length > 0
                  ? options.styles
                  : getStylePresets(deps.uiLanguage),
            });
            if (!rf.onboardingProvider) {
              try {
                const det = await scanProviderCredentials();
                if (det.length > 0) deps.applyDetectedProviders(det);
              } catch {}
            }
            if (rf.onboardingServerTarget !== undefined) {
              deps.setOnboardingServerTarget(rf.onboardingServerTarget);
            }
            if (rf.onboardingCloudApiKey !== undefined)
              deps.setOnboardingCloudApiKey(rf.onboardingCloudApiKey);
            if (rf.onboardingProvider !== undefined)
              deps.setOnboardingProvider(rf.onboardingProvider);
            if (rf.onboardingVoiceProvider !== undefined)
              deps.setOnboardingVoiceProvider(rf.onboardingVoiceProvider);
            if (rf.onboardingApiKey !== undefined)
              deps.setOnboardingApiKey(rf.onboardingApiKey);
            if (rf.onboardingPrimaryModel !== undefined)
              deps.setOnboardingPrimaryModel(rf.onboardingPrimaryModel);
            if (rf.onboardingOpenRouterModel !== undefined)
              deps.setOnboardingOpenRouterModel(rf.onboardingOpenRouterModel);
            if (rf.onboardingRemoteConnected !== undefined)
              deps.setOnboardingRemoteConnected(rf.onboardingRemoteConnected);
            if (rf.onboardingRemoteApiBase !== undefined)
              deps.setOnboardingRemoteApiBase(rf.onboardingRemoteApiBase);
            if (rf.onboardingRemoteToken !== undefined)
              deps.setOnboardingRemoteToken(rf.onboardingRemoteToken);
            if (rf.onboardingSmallModel !== undefined)
              deps.setOnboardingSmallModel(rf.onboardingSmallModel);
            if (rf.onboardingLargeModel !== undefined)
              deps.setOnboardingLargeModel(rf.onboardingLargeModel);
            deps.setOnboardingStep(
              inferOnboardingResumeStep({
                persistedStep: loadPersistedOnboardingStep(),
                config,
              }),
            );
            deps.setStartupPhase("ready");
            deps.setOnboardingLoading(false);
            dispatch({
              type: "BACKEND_REACHED",
              onboardingComplete: false,
            });
            return;
          } catch (err) {
            const ae = asApiLikeError(err);
            if (ae?.status === 401 && client.hasToken()) {
              client.setToken(null);
              deps.setAuthRequired(true);
              deps.setPairingEnabled(latestAuth.pairingEnabled);
              deps.setPairingExpiresAt(latestAuth.expiresAt);
              deps.setStartupPhase("ready");
              deps.setOnboardingLoading(false);
              dispatch({ type: "BACKEND_AUTH_REQUIRED" });
              return;
            }
            if (ae?.status === 404) {
              deps.setStartupError(describeBackendFailure(err, false));
              deps.setOnboardingLoading(false);
              dispatch({ type: "BACKEND_NOT_FOUND" });
              return;
            }
            optErr = err;
            await new Promise<void>((r) => {
              tidRef.current = setTimeout(r, 500);
            });
          }
        }
        return;
      }
      dispatch({ type: "BACKEND_REACHED", onboardingComplete: true });
      return;
    } catch (err) {
      const ae = asApiLikeError(err);
      if (ae?.status === 401 && client.hasToken()) {
        client.setToken(null);
        deps.setAuthRequired(true);
        deps.setPairingEnabled(latestAuth.pairingEnabled);
        deps.setPairingExpiresAt(latestAuth.expiresAt);
        deps.setStartupPhase("ready");
        deps.setOnboardingLoading(false);
        dispatch({ type: "BACKEND_AUTH_REQUIRED" });
        return;
      }
      if (ae?.status === 404) {
        deps.setStartupError(describeBackendFailure(err, false));
        deps.setOnboardingLoading(false);
        dispatch({ type: "BACKEND_NOT_FOUND" });
        return;
      }
      lastErr = err;
      attempts++;
      const delay = Math.min(250 * 2 ** Math.min(attempts, 2), 1000);
      await new Promise<void>((r) => {
        tidRef.current = setTimeout(r, delay);
      });
    }
  }
}
