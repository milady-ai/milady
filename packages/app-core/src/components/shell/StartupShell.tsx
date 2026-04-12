/**
 * StartupShell — the front door to the app.
 *
 * Shows a branded splash with retro progress bar during ALL startup phases.
 * New users see the server chooser first. Returning users see the progress bar
 * immediately. The splash stays visible until the app is FULLY loaded
 * (including a brief settle delay after coordinator reaches ready).
 *
 * Non-loading phases (error, pairing, onboarding) delegate to their views.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../../api";
import {
  discoverGatewayEndpoints,
  type GatewayDiscoveryEndpoint,
  gatewayEndpointToApiBase,
} from "../../bridge/gateway-discovery";
import { isDesktopPlatform } from "../../platform/init";
import {
  addAgentProfile,
  clearPersistedActiveServer,
  savePersistedActiveServer,
  useApp,
} from "../../state";
import type { StartupErrorState } from "../../state/types";
import { OnboardingWizard } from "../onboarding/OnboardingWizard";
import { PairingView } from "./PairingView";
import { SplashCloudAgents } from "./SplashCloudAgents";
import { SplashServerChooser } from "./SplashServerChooser";
import { StartupFailureView } from "./StartupFailureView";

const FONT = "'Courier New', 'Courier', 'Monaco', monospace";

const PHASE_PROGRESS: Record<string, number> = {
  splash: 0,
  "restoring-session": 10,
  "resolving-target": 20,
  "polling-backend": 40,
  "starting-runtime": 60,
  hydrating: 85,
  ready: 100,
};

function phaseToStatusKey(phase: string): string {
  switch (phase) {
    case "restoring-session":
      return "startupshell.Starting";
    case "resolving-target":
    case "polling-backend":
      return "startupshell.ConnectingBackend";
    case "starting-runtime":
      return "startupshell.InitializingAgent";
    case "hydrating":
    case "ready":
      return "startupshell.Loading";
    default:
      return "startupshell.Starting";
  }
}

export function StartupShell() {
  const {
    startupCoordinator,
    startupError,
    retryStartup,
    setState,
    goToOnboardingStep,
    t,
  } = useApp();
  const phase = startupCoordinator.phase;
  const cloudSkipProbeStartedRef = useRef(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveredGateways, setDiscoveredGateways] = useState<
    GatewayDiscoveryEndpoint[]
  >([]);
  const [splashSubView, setSplashSubView] = useState<"chooser" | "cloud">(
    () => {
      if (typeof window === "undefined") return "chooser";
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "cloud-agents") {
        params.delete("action");
        const qs = params.toString();
        const url = window.location.pathname + (qs ? `?${qs}` : "");
        window.history.replaceState({}, "", url);
        return "cloud";
      }
      return "chooser";
    },
  );
  const isSplash = phase === "splash";
  const splashLoaded = isSplash
    ? (startupCoordinator.state as { loaded?: boolean }).loaded
    : false;
  const progress = PHASE_PROGRESS[phase] ?? 50;
  // ── Cloud onboarding skip ──────────────────────────────────────
  // Fallback: if a cloud-provisioned container still reaches onboarding-required
  // (e.g. splash probe didn't fire SPLASH_CLOUD_SKIP), re-check the server here
  // and fast-forward past onboarding.
  //
  // IMPORTANT: deps must NOT include the unstable `startupCoordinator` object
  // reference. Including it caused the probe to be cancelled on every re-render
  // (OnboardingWizard triggers many state updates), killing the in-flight fetch.
  // We use a ref to access the coordinator's dispatch function instead.
  const coordinatorDispatchRef = useRef(startupCoordinator.dispatch);
  coordinatorDispatchRef.current = startupCoordinator.dispatch;
  const coordinatorStateRef = useRef(startupCoordinator.state);
  coordinatorStateRef.current = startupCoordinator.state;

  useEffect(() => {
    if (phase !== "onboarding-required") {
      cloudSkipProbeStartedRef.current = false;
      return;
    }

    const coordState = coordinatorStateRef.current;
    if (
      coordState.phase !== "onboarding-required" ||
      coordState.serverReachable ||
      cloudSkipProbeStartedRef.current
    ) {
      return;
    }

    cloudSkipProbeStartedRef.current = true;
    let cancelled = false;

    void client
      .getOnboardingStatus()
      .then((status) => {
        if (cancelled || !status.cloudProvisioned) {
          return;
        }
        console.log(
          "[milady][startup] Cloud-provisioned container detected at onboarding — skipping wizard",
        );
        setState("onboardingComplete", true);
        coordinatorDispatchRef.current({ type: "ONBOARDING_COMPLETE" });
      })
      .catch(() => {
        cloudSkipProbeStartedRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [phase, setState]);

  // ── Gateway discovery ──────────────────────────────────────────
  useEffect(() => {
    if (!isSplash || !splashLoaded) {
      return;
    }

    let cancelled = false;
    setDiscoveryLoading(true);
    void discoverGatewayEndpoints({ timeoutMs: 1500 })
      .then((gateways) => {
        if (!cancelled) {
          setDiscoveredGateways(gateways);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDiscoveryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isSplash, splashLoaded]);

  const continueToOnboarding = useCallback(() => {
    startupCoordinator.dispatch({ type: "SPLASH_CONTINUE" });
  }, [startupCoordinator]);

  const clearClientConnectionIntent = useCallback(() => {
    client.setToken(null);
    client.setBaseUrl(null);
  }, []);

  const seedSplashTarget = useCallback(
    (target: "local" | "remote" | "elizacloud", remoteApiBase?: string) => {
      clearClientConnectionIntent();
      clearPersistedActiveServer();
      goToOnboardingStep("identity");
      setState("onboardingProvider", "");
      setState("onboardingApiKey", "");
      setState("onboardingPrimaryModel", "");
      setState("onboardingRemoteToken", "");
      setState("onboardingServerTarget", target);

      if (target === "local") {
        setState("onboardingRemoteConnected", false);
        setState("onboardingRemoteApiBase", "");
        return;
      }

      setState("onboardingRemoteConnected", Boolean(remoteApiBase));
      setState("onboardingRemoteApiBase", remoteApiBase ?? "");
    },
    [clearClientConnectionIntent, goToOnboardingStep, setState],
  );

  const handleCreateLocal = useCallback(() => {
    addAgentProfile({ kind: "local", label: "Local Agent" });
    seedSplashTarget("local");
    continueToOnboarding();
  }, [continueToOnboarding, seedSplashTarget]);

  const handleManualConnect = useCallback(() => {
    seedSplashTarget("remote");
    continueToOnboarding();
  }, [continueToOnboarding, seedSplashTarget]);

  const handleManageCloudAgents = useCallback(() => {
    setSplashSubView("cloud");
  }, []);

  const handleConnectGateway = useCallback(
    (gateway: GatewayDiscoveryEndpoint) => {
      const remoteApiBase = gatewayEndpointToApiBase(gateway);
      clearClientConnectionIntent();
      const label = gateway.name.trim() || remoteApiBase;
      savePersistedActiveServer({
        id: `remote:${gateway.stableId}`,
        kind: "remote",
        label,
        apiBase: remoteApiBase,
      });
      addAgentProfile({ kind: "remote", label, apiBase: remoteApiBase });
      continueToOnboarding();
    },
    [clearClientConnectionIntent, continueToOnboarding],
  );

  // Error — delegate
  if (phase === "error") {
    const coordState = startupCoordinator.state;
    const errState = coordState.phase === "error" ? coordState : null;
    const errorState: StartupErrorState = startupError ?? {
      reason: errState?.reason ?? "unknown",
      message:
        errState?.message ?? "An unexpected error occurred during startup.",
      phase: "starting-backend" as const,
    };
    return <StartupFailureView error={errorState} onRetry={retryStartup} />;
  }

  // Pairing — delegate
  if (phase === "pairing-required") {
    return <PairingView />;
  }

  // Onboarding — delegate
  if (phase === "onboarding-required") {
    return <OnboardingWizard />;
  }

  // Ready — let the app through
  if (phase === "ready") {
    return null;
  }

  return (
    <div className="flex items-center justify-center h-full w-full bg-[#ffe600] text-black overflow-hidden">
      <img
        src="/splash-bg.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div
        className="relative z-10 flex flex-col items-center gap-5 px-6 text-center w-full"
        style={{ maxWidth: 360 }}
      >
        {/* Retro segmented progress bar */}
        {!isSplash && (
          <div className="w-full mt-2">
            <div className="h-5 w-full border-2 border-black/70 bg-black/5 overflow-hidden">
              <div
                className="h-full bg-black/70 transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              >
                <div
                  className="h-full w-full"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(255,230,0,0.5) 6px, rgba(255,230,0,0.5) 8px)",
                  }}
                />
              </div>
            </div>
            <p
              style={{ fontFamily: FONT }}
              className="mt-2 text-[8px] text-black/50 uppercase animate-pulse"
            >
              {t(phaseToStatusKey(phase))}
            </p>
          </div>
        )}

        {/* Server chooser or cloud agent manager — only on splash phase */}
        {isSplash &&
          (!splashLoaded ? (
            <button
              type="button"
              disabled
              style={{ fontFamily: FONT }}
              className="mt-3 border-2 border-black bg-black px-5 py-2.5 text-[9px] uppercase text-[#ffe600] hover:bg-black/80 disabled:opacity-30 disabled:cursor-wait transition-all"
            >
              {t("startupshell.Loading", { defaultValue: "Loading..." })}
            </button>
          ) : splashSubView === "cloud" ? (
            <SplashCloudAgents
              t={t}
              onBack={() => setSplashSubView("chooser")}
              dispatchStartup={startupCoordinator.dispatch}
            />
          ) : (
            <SplashServerChooser
              discoveryLoading={discoveryLoading}
              gateways={discoveredGateways}
              showCreateLocal={isDesktopPlatform()}
              t={t}
              onCreateLocal={handleCreateLocal}
              onManualConnect={handleManualConnect}
              onManageCloudAgents={handleManageCloudAgents}
              onConnectGateway={handleConnectGateway}
            />
          ))}
      </div>
    </div>
  );
}
