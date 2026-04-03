/**
 * startup-phase-restore.ts
 *
 * Side-effect logic for the "restoring-session" startup phase.
 * Probes for an existing install/connection and dispatches the result.
 */

import { type OnboardingOptions, client } from "../api";
import {
  getBackendStartupTimeoutMs,
  inspectExistingElizaInstall,
  invokeDesktopBridgeRequest,
  isElectrobunRuntime,
  scanProviderCredentials,
} from "../bridge";
import { ONBOARDING_PROVIDER_CATALOG } from "@miladyai/shared/contracts/onboarding";
import { getStylePresets } from "@miladyai/shared/onboarding-presets";
import {
  deriveOnboardingResumeConnection,
  type StartupErrorState,
} from "./internal";
import { detectExistingOnboardingConnection } from "./onboarding-bootstrap";
import {
  loadPersistedConnectionMode,
  loadPersistedActiveServer,
  loadPersistedOnboardingComplete,
  type PersistedConnectionMode,
} from "./persistence";
import {
  connectionModeToTarget,
  type StartupEvent,
} from "./startup-coordinator";
import type { StartupCoordinatorDeps } from "./useStartupCoordinator";

export interface RestoringSessionCtx {
  persistedActiveServer: ReturnType<typeof loadPersistedActiveServer>;
  persistedConnection: ReturnType<typeof loadPersistedConnectionMode>;
  restoredConnection: PersistedConnectionMode;
  shouldPreserveCompletedOnboarding: boolean;
  hadPriorOnboarding: boolean;
}

export async function applyRestoredConnection(args: {
  restoredConnection: PersistedConnectionMode;
  clientRef: Pick<typeof client, "setBaseUrl" | "setToken">;
  startLocalRuntime?: () => Promise<void>;
}) {
  const { restoredConnection, clientRef, startLocalRuntime } = args;

  if (restoredConnection.runMode === "local") {
    clientRef.setToken(null);
    clientRef.setBaseUrl(null);
    if (startLocalRuntime) {
      await startLocalRuntime();
    }
    return;
  }

  if (restoredConnection.runMode === "cloud") {
    clientRef.setBaseUrl(restoredConnection.cloudApiBase ?? null);
    clientRef.setToken(restoredConnection.cloudAuthToken ?? null);
    return;
  }

  clientRef.setBaseUrl(restoredConnection.remoteApiBase ?? null);
  clientRef.setToken(restoredConnection.remoteAccessToken ?? null);
}

/**
 * Runs the restoring-session phase.
 * Probes the local Eliza install and/or API to detect an existing connection,
 * then dispatches SESSION_RESTORED or NO_SESSION.
 *
 * @param deps - Coordinator dependency bag
 * @param dispatch - startupReducer dispatch
 * @param ctxRef - Mutable ref shared with the polling-backend phase
 * @param cancelled - Ref-flag set true by the cleanup function
 */
export async function runRestoringSession(
  deps: StartupCoordinatorDeps,
  dispatch: (event: StartupEvent) => void,
  ctxRef: React.MutableRefObject<RestoringSessionCtx | null>,
  cancelled: { current: boolean },
): Promise<void> {
  deps.setStartupError(null);
  deps.setStartupPhase("starting-backend");
  deps.setAuthRequired(false);
  deps.setConnected(false);
  deps.setOnboardingExistingInstallDetected(false);

  const forceLocal = deps.forceLocalBootstrapRef.current;
  deps.forceLocalBootstrapRef.current = false;
  const persistedActiveServer = loadPersistedActiveServer();
  const persisted = loadPersistedConnectionMode();
  const hadPrior = loadPersistedOnboardingComplete();
  if (cancelled.current) return;

  const desktopInstall =
    !persisted && isElectrobunRuntime()
      ? await inspectExistingElizaInstall().catch(() => null)
      : null;
  if (cancelled.current) return;

  const isDesktop = forceLocal || isElectrobunRuntime();
  const hasExistingEvidence = hadPrior || Boolean(desktopInstall?.detected);

  // Only probe the API when there is evidence of a prior install.
  const probed =
    !persisted && hasExistingEvidence
      ? await detectExistingOnboardingConnection({
          client,
          timeoutMs: isDesktop
            ? Math.min(getBackendStartupTimeoutMs(), 30_000)
            : Math.min(getBackendStartupTimeoutMs(), 3_500),
        })
      : null;
  if (cancelled.current) return;

  const restored = persisted ?? probed?.connection ?? null;
  const preserveCompleted =
    hadPrior && !deps.onboardingCompletionCommittedRef.current;

  deps.setOnboardingExistingInstallDetected(
    Boolean(
      hadPrior || desktopInstall?.detected || probed?.detectedExistingInstall,
    ),
  );

  if (!restored) {
    // No evidence of a prior connection — show onboarding.
    const { resolveStartupWithoutRestoredConnection } = await import(
      "./onboarding-bootstrap"
    );
    const result = resolveStartupWithoutRestoredConnection({
      hadPersistedOnboardingCompletion: hadPrior,
    });
    if (result.kind === "startup-error") {
      deps.setOnboardingComplete(true);
      deps.setStartupError(result.error as StartupErrorState);
      deps.setOnboardingLoading(false);
      dispatch({ type: "NO_SESSION", hadPriorOnboarding: true });
      return;
    }
    deps.setOnboardingOptions({
      names: [],
      styles: getStylePresets(deps.uiLanguage),
      providers: [
        ...ONBOARDING_PROVIDER_CATALOG,
      ] as OnboardingOptions["providers"],
      cloudProviders: [],
      models: { small: [], large: [] },
      inventoryProviders: [],
      sharedStyleRules: "",
    });
    try {
      const det = await scanProviderCredentials();
      if (!cancelled.current && det.length > 0) {
        console.log(
          `[milady][startup] Keychain scan found ${det.length} provider(s):`,
          det.map((p) => p.id),
        );
        deps.applyDetectedProviders(det);
      }
    } catch (scanErr) {
      console.warn(
        "[milady][startup] Keychain credential scan failed:",
        scanErr,
      );
    }
    deps.setStartupPhase("ready");
    deps.setOnboardingComplete(false);
    deps.setOnboardingLoading(false);
    dispatch({ type: "NO_SESSION", hadPriorOnboarding: false });
    return;
  }

  await applyRestoredConnection({
    restoredConnection: restored,
    clientRef: client,
    startLocalRuntime: async () => {
      try {
        await invokeDesktopBridgeRequest({
          rpcMethod: "agentStart",
          ipcChannel: "agent:start",
        });
      } catch {}
    },
  });

  ctxRef.current = {
    persistedActiveServer,
    persistedConnection: persisted,
    restoredConnection: restored,
    shouldPreserveCompletedOnboarding: preserveCompleted,
    hadPriorOnboarding: hadPrior,
  };
  dispatch({
    type: "SESSION_RESTORED",
    target: connectionModeToTarget(restored.runMode),
  });
}
