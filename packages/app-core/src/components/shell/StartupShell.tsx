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
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { client } from "../../api";
import {
  discoverGatewayEndpoints,
  type GatewayDiscoveryEndpoint,
  gatewayEndpointToApiBase,
} from "../../bridge/gateway-discovery";
import {
  applyColorScheme,
  applyContentPack,
  releaseLoadedContentPack,
} from "../../content-packs";
import { isNative } from "../../platform/init";
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
  customVrmPreviewUrl: string;
  customBackgroundUrl: string;
  customWorldUrl: string;
  onboardingName: string;
  onboardingStyle: string;
};

const DEFAULT_PACK_BASELINE: PackBaselineState = {
  selectedVrmIndex: 1,
  customVrmUrl: "",
  customVrmPreviewUrl: "",
  customBackgroundUrl: "",
  customWorldUrl: "",
  onboardingName: "Chen",
  onboardingStyle: "chen",
};

function supportsDirectoryUpload(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const input = document.createElement("input") as HTMLInputElement & {
    webkitdirectory?: string | boolean;
    directory?: string | boolean;
  };
  return "webkitdirectory" in input || "directory" in input;
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
    activePackId,
    selectedVrmIndex,
    customVrmUrl,
    customVrmPreviewUrl,
    customBackgroundUrl,
    customWorldUrl,
    onboardingName,
    onboardingStyle,
    t,
  } = useApp();
  const phase = startupCoordinator.phase;
  const cloudSkipProbeStartedRef = useRef(false);
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
  const loadedPacksRef = useRef<ResolvedContentPack[]>([]);
  const rehydratedInitialPackRef = useRef(false);
  const canPickPackDirectory = useMemo(() => supportsDirectoryUpload(), []);

  const restorePackBaseline = useCallback(() => {
    const baseline = packBaselineRef.current ?? DEFAULT_PACK_BASELINE;
    setState("selectedVrmIndex", baseline.selectedVrmIndex);
    setState("customVrmUrl", baseline.customVrmUrl);
    setState("customVrmPreviewUrl", baseline.customVrmPreviewUrl);
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
          customVrmPreviewUrl,
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
        setCustomVrmPreviewUrl: (url) => setState("customVrmPreviewUrl", url),
        setCustomBackgroundUrl: (url) => setState("customBackgroundUrl", url),
        setCustomWorldUrl: (url) => setState("customWorldUrl", url),
        setSelectedVrmIndex: (idx) => setState("selectedVrmIndex", idx),
        setOnboardingName: (name) => setState("onboardingName", name),
        setOnboardingStyle: (style) => setState("onboardingStyle", style),
        setCustomCatchphrase: (phrase) => setState("customCatchphrase", phrase),
        setCustomVoicePresetId: (id) => setState("customVoicePresetId", id),
      });
      colorSchemeCleanupRef.current?.();
      colorSchemeCleanupRef.current = applyColorScheme(pack.colorScheme);
      setPackLoadError(null);
    },
    [
      customBackgroundUrl,
      customVrmUrl,
      customVrmPreviewUrl,
      customWorldUrl,
      onboardingName,
      onboardingStyle,
      selectedVrmIndex,
      setState,
    ],
  );

  const deactivatePack = useCallback(() => {
    const activePack = activePackId
      ? loadedPacksRef.current.find((pack) => pack.manifest.id === activePackId)
      : null;

    if (activePack?.source.kind === "file") {
      releaseLoadedContentPack(activePack);
      setLoadedPacks((prev) =>
        prev.filter((pack) => pack.manifest.id !== activePack.manifest.id),
      );
    }

    setState("activePackId", null);
    savePersistedActivePackUrl(null);
    colorSchemeCleanupRef.current?.();
    colorSchemeCleanupRef.current = null;
    restorePackBaseline();
    setPackLoadError(null);
  }, [activePackId, restorePackBaseline, setState]);

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadCustomPack = useCallback(async () => {
    if (canPickPackDirectory) {
      fileInputRef.current?.click();
      return;
    }

    if (typeof window === "undefined" || typeof window.prompt !== "function") {
      return;
    }

    const url = window.prompt(
      t("startupshell.EnterPackUrl", {
        defaultValue:
          "Enter the URL of a content pack folder (must contain pack.json):",
      }),
      "https://example.com/packs/my-pack/",
    );
    if (!url?.trim()) return;

    try {
      const { loadContentPackFromUrl } = await import("../../content-packs");
      const pack = await loadContentPackFromUrl(url.trim());
      setLoadedPacks((prev) => {
        if (
          prev.some((candidate) => candidate.manifest.id === pack.manifest.id)
        ) {
          return prev;
        }
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
  }, [activePackId, activatePack, canPickPackDirectory, t]);

  const handleFolderSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;

      try {
        const { loadContentPackFromFiles } = await import(
          "../../content-packs"
        );
        const pack = await loadContentPackFromFiles(files);
        setLoadedPacks((prev) => {
          if (
            prev.some((candidate) => candidate.manifest.id === pack.manifest.id)
          ) {
            releaseLoadedContentPack(pack);
            return prev;
          }
          return [...prev, pack];
        });
        activatePack(pack, { captureBaseline: activePackId == null });
      } catch (err) {
        console.error(
          "[milady][content-packs] Failed to load custom pack:",
          err,
        );
        setPackLoadError(
          t("startupshell.PackLoadFailed", {
            defaultValue: `Failed to load pack: ${err instanceof Error ? err.message : "Unknown error"}`,
          }),
        );
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [activePackId, activatePack, t],
  );
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
    if (!canPickPackDirectory) {
      return;
    }
    const fileInput = fileInputRef.current;
    if (!fileInput) {
      return;
    }
    fileInput.setAttribute("webkitdirectory", "");
    fileInput.setAttribute("directory", "");
  }, [canPickPackDirectory]);

  useEffect(() => {
    loadedPacksRef.current = loadedPacks;
  }, [loadedPacks]);

  useEffect(() => {
    return () => {
      for (const pack of loadedPacksRef.current) {
        releaseLoadedContentPack(pack);
      }
    };
  }, []);

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
                showCreateLocal={!isNative}
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
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={handleFolderSelected}
      />
    </div>
  );
}
