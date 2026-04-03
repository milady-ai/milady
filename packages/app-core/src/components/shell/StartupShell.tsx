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

import { useCallback, useEffect, useMemo, useState } from "react";
import { client } from "../../api";
import {
  discoverGatewayEndpoints,
  type GatewayDiscoveryEndpoint,
  gatewayEndpointToApiBase,
} from "../../bridge/gateway-discovery";
import {
  clearPersistedConnectionMode,
  savePersistedActiveServer,
  useApp,
} from "../../state";
import { buildOnboardingServerSelection } from "../../onboarding/server-target";
import type { StartupErrorState } from "../../state/types";
import { OnboardingWizard } from "../onboarding/OnboardingWizard";
import { PairingView } from "./PairingView";
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
    elizaCloudConnected,
    onboardingCloudApiKey,
    t,
  } = useApp();
  const phase = startupCoordinator.phase;
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveredGateways, setDiscoveredGateways] = useState<
    GatewayDiscoveryEndpoint[]
  >([]);
  const isSplash = phase === "splash";
  const splashLoaded = isSplash
    ? (startupCoordinator.state as { loaded?: boolean }).loaded
    : false;
  const progress = PHASE_PROGRESS[phase] ?? 50;
  const showElizaCloudEntry = useMemo(() => {
    if (elizaCloudConnected) {
      return true;
    }
    if (onboardingCloudApiKey.trim().length > 0) {
      return true;
    }
    if (typeof window === "undefined") {
      return false;
    }
    const token = (
      (window as unknown as Record<string, unknown>)
        .__ELIZA_CLOUD_AUTH_TOKEN__ ?? ""
    )
      .toString()
      .trim();
    return token.length > 0;
  }, [elizaCloudConnected, onboardingCloudApiKey]);

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
      const selection = buildOnboardingServerSelection(target);
      clearClientConnectionIntent();
      clearPersistedConnectionMode();
      goToOnboardingStep("identity");
      setState("onboardingProvider", "");
      setState("onboardingApiKey", "");
      setState("onboardingPrimaryModel", "");
      setState("onboardingRemoteToken", "");

      if (target === "local") {
        setState("onboardingRunMode", selection.runMode);
        setState("onboardingCloudProvider", selection.cloudProvider);
        setState("onboardingRemoteConnected", false);
        setState("onboardingRemoteApiBase", "");
        return;
      }

      setState("onboardingRunMode", selection.runMode);
      setState("onboardingCloudProvider", selection.cloudProvider);
      setState("onboardingRemoteConnected", Boolean(remoteApiBase));
      setState("onboardingRemoteApiBase", remoteApiBase ?? "");
    },
    [clearClientConnectionIntent, goToOnboardingStep, setState],
  );

  const handleCreateLocal = useCallback(() => {
    seedSplashTarget("local");
    continueToOnboarding();
  }, [continueToOnboarding, seedSplashTarget]);

  const handleManualConnect = useCallback(() => {
    seedSplashTarget("remote");
    continueToOnboarding();
  }, [continueToOnboarding, seedSplashTarget]);

  const handleUseElizaCloud = useCallback(() => {
    seedSplashTarget("elizacloud");
    continueToOnboarding();
  }, [continueToOnboarding, seedSplashTarget]);

  const handleConnectGateway = useCallback(
    (gateway: GatewayDiscoveryEndpoint) => {
      const remoteApiBase = gatewayEndpointToApiBase(gateway);
      clearClientConnectionIntent();
      savePersistedActiveServer({
        id: `remote:${gateway.stableId}`,
        kind: "remote",
        label: gateway.name.trim() || remoteApiBase,
        apiBase: remoteApiBase,
      });
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
        src="/splash-bg.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-contain object-right-bottom opacity-40"
      />
      <div
        className="relative z-10 flex flex-col items-center gap-5 px-6 text-center w-full"
        style={{ maxWidth: 360 }}
      >
        <h1 style={{ fontFamily: FONT }} className="text-2xl text-black">
          MILADY
        </h1>
        <p
          style={{ fontFamily: FONT }}
          className="text-[7px] text-black/40 uppercase leading-relaxed"
        >
          {t("startupshell.SplashTagline", {
            defaultValue: "Your local-first AI assistant",
          })}
        </p>

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

        {/* Server chooser — only on splash phase */}
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
          ) : (
            <SplashServerChooser
              discoveryLoading={discoveryLoading}
              gateways={discoveredGateways}
              showElizaCloudEntry={showElizaCloudEntry}
              t={t}
              onCreateLocal={handleCreateLocal}
              onManualConnect={handleManualConnect}
              onUseElizaCloud={handleUseElizaCloud}
              onConnectGateway={handleConnectGateway}
            />
          ))}
      </div>
    </div>
  );
}
