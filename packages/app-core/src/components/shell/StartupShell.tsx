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

import type { ResolvedContentPack } from "@miladyai/shared/contracts/content-pack";
import { PromptDialog, usePrompt } from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client } from "../../api";
import {
  discoverGatewayEndpoints,
  type GatewayDiscoveryEndpoint,
  gatewayEndpointToApiBase,
} from "../../bridge/gateway-discovery";
import { applyColorScheme, applyContentPack } from "../../content-packs";
import {
  clearPersistedActiveServer,
  loadPersistedActivePackUrl,
  savePersistedActivePackUrl,
  savePersistedActiveServer,
  useApp,
} from "../../state";
import type { StartupErrorState } from "../../state/types";
import { OnboardingWizard } from "../onboarding/OnboardingWizard";
import { PairingView } from "./PairingView";
import { SplashContentPacks } from "./SplashContentPacks";
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

type PackBaselineState = {
  selectedVrmIndex: number;
  customVrmUrl: string;
  customBackgroundUrl: string;
  customWorldUrl: string;
  onboardingName: string;
  onboardingStyle: string;
};

const DEFAULT_PACK_BASELINE: PackBaselineState = {
  selectedVrmIndex: 1,
  customVrmUrl: "",
  customBackgroundUrl: "",
  customWorldUrl: "",
  onboardingName: "Chen",
  onboardingStyle: "chen",
};

export function StartupShell() {
  const {
    startupCoordinator,
    startupError,
    retryStartup,
    setState,
    goToOnboardingStep,
    elizaCloudConnected,
    onboardingCloudApiKey,
    activePackId,
    selectedVrmIndex,
    customVrmUrl,
    customBackgroundUrl,
    customWorldUrl,
    onboardingName,
    onboardingStyle,
    t,
  } = useApp();
  const phase = startupCoordinator.phase;
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveredGateways, setDiscoveredGateways] = useState<
    GatewayDiscoveryEndpoint[]
  >([]);
  const [packLoadError, setPackLoadError] = useState<string | null>(null);
  const isSplash = phase === "splash";
  const splashLoaded = isSplash
    ? (startupCoordinator.state as { loaded?: boolean }).loaded
    : false;
  const progress = PHASE_PROGRESS[phase] ?? 50;

  // ── Content packs ───────────────────────────────────────────────
  // The 8 built-in characters are the default content — not packs.
  // The pack browser only shows user-loaded external packs.
  const [loadedPacks, setLoadedPacks] = useState<ResolvedContentPack[]>([]);
  const colorSchemeCleanupRef = useRef<(() => void) | null>(null);
  const packBaselineRef = useRef<PackBaselineState | null>(null);
  const initialActivePackIdRef = useRef(activePackId);
  const rehydratedInitialPackRef = useRef(false);
  const { prompt: promptForPackUrl, modalProps: packPromptModalProps } =
    usePrompt();

  const restorePackBaseline = useCallback(() => {
    const baseline = packBaselineRef.current ?? DEFAULT_PACK_BASELINE;
    setState("selectedVrmIndex", baseline.selectedVrmIndex);
    setState("customVrmUrl", baseline.customVrmUrl);
    setState("customBackgroundUrl", baseline.customBackgroundUrl);
    setState("customWorldUrl", baseline.customWorldUrl);
    setState("onboardingName", baseline.onboardingName);
    setState("onboardingStyle", baseline.onboardingStyle);
    packBaselineRef.current = null;
  }, [setState]);

  const activatePack = useCallback(
    (
      pack: ResolvedContentPack,
      options?: {
        captureBaseline?: boolean;
      },
    ) => {
      const captureBaseline = options?.captureBaseline ?? false;
      if (captureBaseline && packBaselineRef.current == null) {
        packBaselineRef.current = {
          selectedVrmIndex,
          customVrmUrl,
          customBackgroundUrl,
          customWorldUrl,
          onboardingName,
          onboardingStyle,
        };
      }

      setState("activePackId", pack.manifest.id);
      savePersistedActivePackUrl(
        pack.source.kind === "url" ? pack.source.url : null,
      );
      applyContentPack(pack, {
        setCustomVrmUrl: (url) => setState("customVrmUrl", url),
        setCustomBackgroundUrl: (url) => setState("customBackgroundUrl", url),
        setCustomWorldUrl: (url) => setState("customWorldUrl", url),
        setSelectedVrmIndex: (idx) => setState("selectedVrmIndex", idx),
        setOnboardingName: (name) => setState("onboardingName", name),
        setOnboardingStyle: (style) => setState("onboardingStyle", style),
      });
      colorSchemeCleanupRef.current?.();
      colorSchemeCleanupRef.current = applyColorScheme(pack.colorScheme);
      setPackLoadError(null);
    },
    [
      customBackgroundUrl,
      customVrmUrl,
      customWorldUrl,
      onboardingName,
      onboardingStyle,
      selectedVrmIndex,
      setState,
    ],
  );

  const deactivatePack = useCallback(() => {
    setState("activePackId", null);
    savePersistedActivePackUrl(null);
    colorSchemeCleanupRef.current?.();
    colorSchemeCleanupRef.current = null;
    restorePackBaseline();
    setPackLoadError(null);
  }, [restorePackBaseline, setState]);

  const handleSelectPack = useCallback(
    (pack: ResolvedContentPack) => {
      if (activePackId === pack.manifest.id) {
        deactivatePack();
        return;
      }
      activatePack(pack, { captureBaseline: activePackId == null });
    },
    [activePackId, activatePack, deactivatePack],
  );

  const handleLoadCustomPack = useCallback(async () => {
    const url = await promptForPackUrl({
      title: t("startupshell.LoadPack", {
        defaultValue: "Load pack",
      }),
      message: t("startupshell.EnterPackUrl", {
        defaultValue:
          "Enter the URL of a content pack folder (must contain pack.json):",
      }),
      placeholder: "https://example.com/packs/my-pack/",
      confirmLabel: t("startupshell.LoadPack", {
        defaultValue: "Load pack",
      }),
    });
    if (!url?.trim()) return;
    try {
      const { loadContentPackFromUrl } = await import("../../content-packs");
      const pack = await loadContentPackFromUrl(url.trim());
      setLoadedPacks((prev) => {
        if (prev.some((p) => p.manifest.id === pack.manifest.id)) return prev;
        return [...prev, pack];
      });
      activatePack(pack, { captureBaseline: activePackId == null });
    } catch (err) {
      console.error("[milady][content-packs] Failed to load custom pack:", err);
      setPackLoadError(
        t("startupshell.PackLoadFailed", {
          defaultValue: `Failed to load pack: ${err instanceof Error ? err.message : "Unknown error"}`,
        }),
      );
    }
  }, [activePackId, activatePack, promptForPackUrl, t]);
  const cloudApiKey = onboardingCloudApiKey ?? "";
  const showElizaCloudEntry = useMemo(() => {
    if (elizaCloudConnected) {
      return true;
    }
    if (cloudApiKey.trim().length > 0) {
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
  }, [cloudApiKey, elizaCloudConnected]);

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

  useEffect(() => {
    if (rehydratedInitialPackRef.current) {
      return;
    }
    rehydratedInitialPackRef.current = true;

    const persistedPackId = initialActivePackIdRef.current;
    if (!persistedPackId) {
      return;
    }

    const loadedPack = loadedPacks.find(
      (pack) => pack.manifest.id === persistedPackId,
    );
    if (loadedPack) {
      activatePack(loadedPack);
      return;
    }

    const persistedPackUrl = loadPersistedActivePackUrl();
    if (!persistedPackUrl) {
      setState("activePackId", null);
      return;
    }

    let cancelled = false;
    void import("../../content-packs")
      .then(({ loadContentPackFromUrl }) =>
        loadContentPackFromUrl(persistedPackUrl),
      )
      .then((pack) => {
        if (cancelled) {
          return;
        }
        activatePack(pack);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        console.error(
          "[milady][content-packs] Failed to restore persisted pack:",
          err,
        );
        savePersistedActivePackUrl(null);
        setState("activePackId", null);
        setPackLoadError(
          t("startupshell.PackLoadFailed", {
            defaultValue: `Failed to load pack: ${err instanceof Error ? err.message : "Unknown error"}`,
          }),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [activatePack, loadedPacks, setState, t]);

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
        src="/splash-bg.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div
        className="relative z-10 flex flex-col items-center gap-5 px-6 text-center w-full"
        style={{ maxWidth: 360 }}
      >
        <h1
          style={{ fontFamily: FONT }}
          className="text-2xl text-white font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]"
        >
          MILADY
        </h1>
        <p
          style={{ fontFamily: FONT }}
          className="text-[7px] text-white/80 uppercase leading-relaxed drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
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

        {/* Server chooser + content packs — only on splash phase */}
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
            <>
              <SplashContentPacks
                packs={loadedPacks}
                activePackId={activePackId}
                t={t}
                onSelectPack={handleSelectPack}
                onLoadCustomPack={handleLoadCustomPack}
              />
              {packLoadError ? (
                <p
                  style={{ fontFamily: FONT }}
                  className="w-full text-[8px] text-black/55"
                >
                  {packLoadError}
                </p>
              ) : null}
              <SplashServerChooser
                discoveryLoading={discoveryLoading}
                gateways={discoveredGateways}
                showElizaCloudEntry={showElizaCloudEntry}
                t={t}
                onCreateLocal={handleCreateLocal}
                onManualConnect={handleManualConnect}
                onUseElizaCloud={handleUseElizaCloud}
                onConnectGateway={handleConnectGateway}
                onLoadContentPack={handleLoadCustomPack}
              />
            </>
          ))}
      </div>
      <PromptDialog {...packPromptModalProps} />
    </div>
  );
}
