import { App, ErrorBoundary } from "@elizaos/app-core";
import "@elizaos/app-core/styles/styles.css";
import "@elizaos/app-core/styles/brand-gold.css";
import { VoicePill } from "@elizaos/ui/components/voice-pill";

import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { Preferences } from "@capacitor/preferences";
import { client } from "@elizaos/app-core";
import {
  initializeCapacitorBridge,
  subscribeDesktopBridgeEvent,
  initializeStorageBridge,
  isElectrobunRuntime,
} from "@elizaos/app-core";
import type { BrandingConfig } from "@elizaos/app-core";
import {
  type AppBootConfig,
  getBootConfig,
  ANDROID_LOCAL_AGENT_API_BASE,
  MOBILE_RUNTIME_MODE_STORAGE_KEY,
  normalizeMobileRuntimeMode,
  preSeedAndroidLocalRuntimeIfFresh,
  setBootConfig,
} from "@elizaos/app-core";
import {
  AGENT_READY_EVENT,
  APP_PAUSE_EVENT,
  APP_RESUME_EVENT,
  COMMAND_PALETTE_EVENT,
  CONNECT_EVENT,
  dispatchAppEvent,
  MOBILE_RUNTIME_MODE_CHANGED_EVENT,
  SHARE_TARGET_EVENT,
  TRAY_ACTION_EVENT,
} from "@elizaos/app-core";
import {
  applyForceFreshOnboardingReset,
  applyLaunchConnectionFromUrl,
  applyLaunchConnection,
  installDesktopPermissionsClientPatch,
  installForceFreshOnboardingClientPatch,
  installLocalProviderCloudPreferencePatch,
  isAppWindowRoute,
  isDetachedWindowShell,
  getWindowNavigationPath,
  resolveWindowShellRoute,
  shouldInstallMainWindowOnboardingPatches,
  syncDetachedShellLocation,
} from "@elizaos/app-core";
import { AppWindowRenderer } from "@elizaos/app-core";
import { dispatchQueuedLifeOpsGithubCallbackFromUrl } from "@elizaos/app-lifeops/platform";
import type { ShareTargetPayload } from "@elizaos/app-core/platform";
import {
  DESKTOP_TRAY_MENU_ITEMS,
  DesktopSurfaceNavigationRuntime,
  DesktopTrayRuntime,
  DetachedShellRoot,
} from "@elizaos/app-core";
import { AppProvider } from "@elizaos/app-core";
import { applyUiTheme, loadUiTheme } from "@elizaos/app-core";
import { Agent } from "@elizaos/capacitor-agent";
import { Desktop } from "@elizaos/capacitor-desktop";
import {
  startDeviceBridgeClient,
  type DeviceBridgeClient,
} from "@elizaos/capacitor-llama";
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { CompanionShell } from "@elizaos/app-companion/ui";
import {
  createVectorBrowserRenderer,
  GlobalEmoteOverlay,
  InferenceCloudAlertButton,
  resolveCompanionInferenceNotice,
  THREE,
  useCompanionSceneStatus,
} from "@elizaos/app-companion";
import "@elizaos/app-companion/register";
// Side-effect: register LifeOps sidebar widgets + client methods on ElizaClient.
import "@elizaos/app-lifeops/widgets";
// Side-effect: register coding-agent (task-coordinator) slots so app-core
// slot wrappers (CodingAgentControlChip, PtyConsoleBase, etc.) render the
// real components instead of nulls.
import "@elizaos/app-task-coordinator/register-slots";
// Side-effect: register game operator surfaces + detail extensions.
import "@elizaos/app-babylon/ui";
import "@elizaos/app-scape/ui";
import "@elizaos/app-hyperscape/ui";
import "@elizaos/app-2004scape/ui";
import "@elizaos/app-defense-of-the-agents/ui";
import "@elizaos/app-screenshare/ui";
import "@clawville/app-clawville/ui";
import {
  AppBlockerSettingsCard,
  LifeOpsBrowserSetupPanel as BrowserBridgeSetupPanel,
  LifeOpsPageView,
  WebsiteBlockerSettingsCard,
} from "@elizaos/app-lifeops/ui";
import { LifeOpsActivitySignalsEffect } from "@elizaos/app-lifeops/components/LifeOpsActivitySignalsEffect";
import {
  ApprovalQueue,
  StewardLogo,
  TransactionHistory,
} from "@elizaos/app-steward/ui";
import {
  CodingAgentControlChip,
  CodingAgentSettingsSection,
  CodingAgentTasksPanel,
  PtyConsoleDrawer,
} from "@elizaos/app-task-coordinator";
import { FineTuningView } from "@elizaos/app-training/ui";
import "@elizaos/app-shopify/register";
import "@elizaos/app-hyperliquid/client";
import "@elizaos/app-hyperliquid/register";
import "@elizaos/app-polymarket/client";
import "@elizaos/app-polymarket/register";
import "@elizaos/app-vincent/client";
import { useVincentState } from "@elizaos/app-vincent/ui";
import "@elizaos/app-vincent/register";
import "@elizaos/app-wallet/register";
import "@elizaos/app-workflow-builder/register";
import { shouldUseCloudOnlyBranding } from "@elizaos/app-core";
import {
  APP_BRANDING_BASE,
  APP_CONFIG,
  APP_LOG_PREFIX,
  APP_NAMESPACE,
  APP_URL_SCHEME,
} from "./app-config";
import { APP_ENV_ALIASES, APP_ENV_PREFIX } from "./brand-env";
import { APP_CHARACTER_CATALOG } from "./character-catalog";
import { bootIosLocalRuntimeIfApplicable } from "./ios-local-runtime-boot";
import { bootAndroidLocalRuntimeIfApplicable } from "./android-local-runtime-boot";
import {
  apiBaseToDeviceBridgeUrl,
  type IosRuntimeConfig,
  type IosRuntimeMode,
  resolveIosRuntimeConfig,
} from "@elizaos/app-core";
import { CharacterEditor } from "@elizaos/app-core/components/character/CharacterEditor";

declare global {
  interface Window {
    __ELIZA_APP_SHARE_QUEUE__?: ShareTargetPayload[];
    __ELIZA_APP_CHARACTER_EDITOR__?: typeof CharacterEditor;
    __ELIZA_APP_API_BASE__?: string;
    __ELIZA_API_BASE__?: string;
    __ELIZAOS_APP_BOOT_CONFIG__?: AppBootConfig;
    __ELIZA_APP_BOOT_CONFIG__?: AppBootConfig;
  }
}

const BRANDED_WINDOW_KEYS = {
  apiBase: `__${APP_ENV_PREFIX}_API_BASE__`,
  characterEditor: `__${APP_ENV_PREFIX}_CHARACTER_EDITOR__`,
  shareQueue: `__${APP_ENV_PREFIX}_SHARE_QUEUE__`,
} as const;

type AppCompatWindow = Window &
  Record<string, unknown> & {
    __ELIZA_APP_SHARE_QUEUE__?: ShareTargetPayload[];
    __ELIZA_APP_CHARACTER_EDITOR__?: typeof CharacterEditor;
    __ELIZA_APP_API_BASE__?: string;
    __ELIZA_API_BASE__?: string;
    __ELIZAOS_APP_BOOT_CONFIG__?: AppBootConfig;
    __ELIZA_APP_BOOT_CONFIG__?: AppBootConfig;
  };

function getAppWindow(): AppCompatWindow {
  return window as unknown as AppCompatWindow;
}

// True when the APK is running on the AOSP MiladyOS variant. Detection:
// MainActivity.applyMiladyOSUserAgentSuffix appends `MiladyOS/<tag>` to the
// WebView user-agent when `ro.miladyos.product` is set by the AOSP product
// config. The upstream elizaOS layer reads its own `ElizaOS/<tag>` marker
// from the same place; this helper only cares about the Milady-brand layer.
function isMiladyOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /\bMiladyOS\//.test(navigator.userAgent ?? "");
}

function getInjectedAppApiBase(): string | undefined {
  const appWindow = getAppWindow();
  const brandedApiBase = appWindow[BRANDED_WINDOW_KEYS.apiBase];
  const bootConfig =
    appWindow.__ELIZAOS_APP_BOOT_CONFIG__ ??
    appWindow.__ELIZA_APP_BOOT_CONFIG__;
  return (
    appWindow.__ELIZA_APP_API_BASE__ ??
    (typeof brandedApiBase === "string" ? brandedApiBase : undefined) ??
    bootConfig?.apiBase ??
    appWindow.__ELIZA_API_BASE__
  );
}

const APP_BRANDING: Partial<BrandingConfig> = {
  ...APP_BRANDING_BASE,
  // The hosted web bundle stays cloud-only in production. Desktop shells and
  // other hosts inject an explicit API base before React boots, and that host
  // backend should control onboarding capabilities instead.
  cloudOnly: shouldUseCloudOnlyBranding({
    isDev: import.meta.env.DEV ?? false,
    injectedApiBase:
      typeof window === "undefined" ? undefined : getInjectedAppApiBase(),
    isNativePlatform: Capacitor.isNativePlatform(),
  }),
};

/**
 * Platform detection utilities
 */
const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();
const isIOS = platform === "ios";
const isAndroid = platform === "android";
const IOS_RUNTIME_ENV_CONFIG = resolveIosRuntimeConfig(import.meta.env);
const DEVICE_BRIDGE_ID_KEY = "milady_device_bridge_id";

let mobileDeviceBridgeClient: DeviceBridgeClient | null = null;
let mobileDeviceBridgeStartPromise: Promise<void> | null = null;
let mobileRuntimeModeListenerInstalled = false;

async function registerMiladyOsSystemApps(): Promise<void> {
  if (!isMiladyOS()) return;
  await Promise.all([
    import("@elizaos/app-contacts/register"),
    import("@elizaos/app-phone/register"),
    import("@elizaos/app-wifi/register"),
  ]);
}

function isDesktopPlatform(): boolean {
  return isElectrobunRuntime();
}

const windowShellRoute = resolveWindowShellRoute();

/**
 * Adds `eliza-electrobun-frameless` for CSS `-webkit-app-region` (Chromium/CEF).
 * macOS WKWebView move/resize are still driven by native overlays in
 * window-effects.mm; this class mainly marks the shell and helps non-WK engines.
 */
function shouldEnableElectrobunMacWindowDrag(): boolean {
  if (!isElectrobunRuntime() || typeof document === "undefined") return false;
  if (isDetachedWindowShell(windowShellRoute)) return false;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Mac/i.test(ua) && !/(iPhone|iPad|iPod)/i.test(ua);
}

if (shouldEnableElectrobunMacWindowDrag()) {
  document.documentElement.classList.add("eliza-electrobun-frameless");
}

// Dev escape hatch: ?reset forces a truly fresh onboarding session by clearing
// persisted state and temporarily suppressing stale backend resume config.
if (shouldInstallMainWindowOnboardingPatches(windowShellRoute)) {
  applyForceFreshOnboardingReset();
  installForceFreshOnboardingClientPatch(client);
}
installLocalProviderCloudPreferencePatch(client);
installDesktopPermissionsClientPatch(client);

// Register custom character editor for app-core's ViewRouter to pick up
window.__ELIZA_APP_CHARACTER_EDITOR__ = CharacterEditor;
getAppWindow()[BRANDED_WINDOW_KEYS.characterEditor] = CharacterEditor;

import { getStylePresets } from "@elizaos/shared/onboarding-presets";

// Derive VRM roster from STYLE_PRESETS so character names stay in one place.
const APP_STYLE_PRESETS = getStylePresets();

const APP_VRM_ASSETS = APP_STYLE_PRESETS.slice()
  .sort((a, b) => a.avatarIndex - b.avatarIndex)
  .map((p) => ({ title: p.name, slug: `${APP_NAMESPACE}-${p.avatarIndex}` }));

const appBootConfig: AppBootConfig = {
  ...getBootConfig(),
  branding: APP_BRANDING,
  defaultApps: APP_CONFIG.defaultApps,
  assetBaseUrl:
    (import.meta.env.VITE_ASSET_BASE_URL as string | undefined)?.trim() ||
    undefined,
  cloudApiBase: IOS_RUNTIME_ENV_CONFIG.cloudApiBase,
  vrmAssets: APP_VRM_ASSETS,
  onboardingStyles: APP_STYLE_PRESETS,
  characterEditor: CharacterEditor,
  companionShell: CompanionShell,
  resolveCompanionInferenceNotice,
  companionInferenceAlertButton: InferenceCloudAlertButton,
  companionGlobalOverlay: GlobalEmoteOverlay,
  useCompanionSceneStatus,
  companionVectorBrowser: {
    THREE,
    createVectorBrowserRenderer,
  },
  codingAgentTasksPanel: CodingAgentTasksPanel,
  codingAgentSettingsSection: CodingAgentSettingsSection,
  codingAgentControlChip: CodingAgentControlChip,
  ptyConsoleDrawer: PtyConsoleDrawer,
  fineTuningView: FineTuningView,
  useVincentState,
  stewardLogo: StewardLogo,
  stewardApprovalQueue: ApprovalQueue,
  stewardTransactionHistory: TransactionHistory,
  characterCatalog: APP_CHARACTER_CATALOG,
  envAliases: APP_ENV_ALIASES,
  lifeOpsPageView: LifeOpsPageView,
  lifeOpsBrowserSetupPanel: BrowserBridgeSetupPanel,
  appBlockerSettingsCard: AppBlockerSettingsCard,
  websiteBlockerSettingsCard: WebsiteBlockerSettingsCard,
  clientMiddleware: {
    forceFreshOnboarding:
      shouldInstallMainWindowOnboardingPatches(windowShellRoute),
    preferLocalProvider: true,
    desktopPermissions: isDesktopPlatform(),
  },
};

// Self-hosted bot bootstrap. The token is read from the URL fragment
// (#token=...), so it never reaches the server, access log, or Referer
// headers. Once read, it persists in localStorage scoped to this origin.
const SELF_HOSTED_TOKEN_KEY = "milady:self-hosted-api-token";
const ACTIVE_SERVER_STORAGE_KEY = "elizaos:active-server";
const API_BASE_STORAGE_KEY = "elizaos_api_base";
const STALE_BOOTSTRAP_KEYS = [
  "elizaos:agent-profiles",
  ACTIVE_SERVER_STORAGE_KEY,
  MOBILE_RUNTIME_MODE_STORAGE_KEY,
] as const;

function isLoopbackApiBase(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

// In desktop dev, persisted active-server pairings from a previous session
// can point at a remote agent (cloud, a different machine, or a packaged
// build on the same host). On a fresh `bun run dev:desktop` we want the
// renderer to talk to the local agent that orchestrator just spawned, not
// re-resume a stale pairing. Reset to the local embedded server unless
// the persisted value is already local/loopback.
//
// DEV-only + desktop-only by design. Production desktop and web bundles
// preserve user pairings as-is.
function forceDesktopDevLocalActiveServer(): void {
  if (!import.meta.env.DEV || !isDesktopPlatform()) return;

  try {
    const raw = window.localStorage.getItem(ACTIVE_SERVER_STORAGE_KEY);
    if (!raw) return;
    const activeServer = JSON.parse(raw) as {
      kind?: unknown;
      apiBase?: unknown;
    };
    if (
      activeServer?.kind === "local" ||
      isLoopbackApiBase(activeServer?.apiBase)
    ) {
      return;
    }

    window.localStorage.setItem(
      ACTIVE_SERVER_STORAGE_KEY,
      JSON.stringify({
        id: "local:embedded",
        kind: "local",
        label: "This device",
      }),
    );
    window.localStorage.removeItem(API_BASE_STORAGE_KEY);
    window.sessionStorage.removeItem(API_BASE_STORAGE_KEY);
    client.setBaseUrl(null);
    console.warn(
      `${APP_LOG_PREFIX} Desktop dev ignored stale remote active server; using local agent.`,
    );
  } catch {}
}
try {
  const url = new URL(window.location.href);
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const fragmentToken = new URLSearchParams(hash).get("token")?.trim() ?? null;
  const hasQueryToken = url.searchParams.has("token");
  if (hasQueryToken) {
    console.error(
      "[milady] Refusing insecure ?token=... bootstrap. Use #token=... instead.",
    );
  }
  let bootstrapToken: string | null = fragmentToken;
  if (fragmentToken) {
    for (const key of STALE_BOOTSTRAP_KEYS) {
      try {
        window.localStorage.removeItem(key);
      } catch {}
    }
    try {
      window.localStorage.setItem(SELF_HOSTED_TOKEN_KEY, fragmentToken);
    } catch {}
  }
  if (fragmentToken || hasQueryToken) {
    url.hash = "";
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
  }
  if (!bootstrapToken) {
    try {
      const saved = window.localStorage.getItem(SELF_HOSTED_TOKEN_KEY)?.trim();
      if (saved) bootstrapToken = saved;
    } catch {}
  }
  // On AOSP/Milady the agent runs in the same APK and exposes its
  // per-boot bearer through `window.ElizaNative.getLocalAgentToken()`
  // (see `os/android/.../ElizaNativeBridge.java`). Pull it before the
  // first auth-status poll so the React shell never hits PairingView
  // for the loopback case where the device IS the agent.
  if (!bootstrapToken) {
    try {
      const native = (
        window as unknown as {
          ElizaNative?: { getLocalAgentToken?: () => string | null };
        }
      ).ElizaNative;
      const nativeToken = native?.getLocalAgentToken?.()?.trim();
      if (nativeToken) {
        bootstrapToken = nativeToken;
        // Persist to the same key the fragment-token path uses so any
        // later re-load through localStorage finds it without needing
        // the bridge to be available at that moment.
        try {
          window.localStorage.setItem(SELF_HOSTED_TOKEN_KEY, nativeToken);
        } catch {}
      }
    } catch {}
  }
  if (bootstrapToken) {
    appBootConfig.apiToken = bootstrapToken;
    appBootConfig.apiBase ??= window.location.origin;
    try {
      client.setToken(bootstrapToken);
    } catch {}
  }
} catch {}
// On desktop, the Electrobun shell injects the local agent's HTTP origin
// (e.g. `http://127.0.0.1:31337`) onto window before the renderer mounts.
// Push it into the boot config so the React shell talks to that origin
// rather than falling back to `window.location.origin` (which on
// Electrobun is a custom scheme like `electrobun://`).
// `getInjectedAppApiBase()` reads all four canonical window globals
// (`__ELIZA_APP_API_BASE__`, the branded key, `__ELIZA{,OS}_APP_BOOT_CONFIG__`,
// and legacy `__ELIZA_API_BASE__`) with the correct priority.
if (isDesktopPlatform()) {
  const desktopApiBase = getInjectedAppApiBase();
  if (desktopApiBase) appBootConfig.apiBase ??= desktopApiBase;
}
setBootConfig(appBootConfig);
forceDesktopDevLocalActiveServer();

// On AOSP/Milady, ElizaNativeBridge.getLocalAgentToken() returns null
// for the first ~30-50s of app launch — the on-device agent process is
// still booting and hasn't written its per-boot bearer to its volatile
// static yet. The synchronous bootstrap above fires BEFORE the agent is
// up, so it sees null and the React shell falls into PairingView even
// though the bearer is in fact about to be available.
//
// Poll the bridge for up to 90s after launch; the first non-null read
// applies the bearer to the client + localStorage and stops. Stock
// Capacitor builds never expose `window.ElizaNative` so the watchdog
// exits immediately.
(function installOnDeviceBearerWatchdog() {
  if (typeof window === "undefined") return;
  const bridge = (
    window as unknown as {
      ElizaNative?: { getLocalAgentToken?: () => string | null };
    }
  ).ElizaNative;
  if (!bridge?.getLocalAgentToken) return;

  const deadline = Date.now() + 90_000;
  const tick = () => {
    try {
      if (client.hasToken()) return;
      const token = bridge.getLocalAgentToken?.()?.trim();
      if (token) {
        client.setToken(token);
        try {
          window.localStorage.setItem(SELF_HOSTED_TOKEN_KEY, token);
        } catch {}
        return;
      }
    } catch {}
    if (Date.now() < deadline) setTimeout(tick, 500);
  };
  setTimeout(tick, 500);
})();

// On AOSP/Milady, ElizaNativeBridge.getLocalAgentToken() returns null
// for the first ~30-50s of app launch (the on-device agent process is
// still booting and hasn't written its per-boot bearer to its volatile
// static yet). The synchronous bootstrap above + the upstream
// applyRestoredConnection both fire BEFORE the agent is up, so they
// see null and the React shell falls into PairingView even though the
// bearer is in fact about to be available.
//
// Poll the bridge for up to 90s after launch; the first non-null read
// applies the bearer to the boot config + client and stops. Stock
// Capacitor builds never expose `window.ElizaNative` so the watchdog
// exits immediately on the first tick.
(function installOnDeviceBearerWatchdog() {
  if (typeof window === "undefined") return;
  const bridge = (
    window as unknown as {
      ElizaNative?: { getLocalAgentToken?: () => string | null };
    }
  ).ElizaNative;
  if (!bridge?.getLocalAgentToken) return;

  const deadline = Date.now() + 90_000;
  const tick = () => {
    try {
      if (client.hasToken()) return;
      const token = bridge.getLocalAgentToken?.()?.trim();
      if (token) {
        client.setToken(token);
        try {
          window.localStorage.setItem(SELF_HOSTED_TOKEN_KEY, token);
        } catch {}
        return;
      }
    } catch {}
    if (Date.now() < deadline) setTimeout(tick, 500);
  };
  setTimeout(tick, 500);
})();

function getShareQueue(): ShareTargetPayload[] {
  const appWindow = getAppWindow();
  const brandedQueue = appWindow[BRANDED_WINDOW_KEYS.shareQueue];
  const existing =
    appWindow.__ELIZA_APP_SHARE_QUEUE__ ??
    (Array.isArray(brandedQueue)
      ? (brandedQueue as ShareTargetPayload[])
      : undefined);
  if (existing) {
    appWindow.__ELIZA_APP_SHARE_QUEUE__ = existing;
    appWindow[BRANDED_WINDOW_KEYS.shareQueue] = existing;
    return existing;
  }
  const queue: ShareTargetPayload[] = [];
  appWindow.__ELIZA_APP_SHARE_QUEUE__ = queue;
  appWindow[BRANDED_WINDOW_KEYS.shareQueue] = queue;
  return queue;
}

function dispatchShareTarget(payload: ShareTargetPayload): void {
  getShareQueue().push(payload);
  dispatchAppEvent(SHARE_TARGET_EVENT, payload);
}

function logNativePluginUnavailable(pluginName: string, error: unknown): void {
  console.warn(
    `${APP_LOG_PREFIX} ${pluginName} plugin not available:`,
    error instanceof Error ? error.message : error,
  );
}

async function initializeAgent(): Promise<void> {
  try {
    const status = await Agent.getStatus();
    dispatchAppEvent(AGENT_READY_EVENT, status);
  } catch (err) {
    console.warn(
      `${APP_LOG_PREFIX} Agent not available:`,
      err instanceof Error ? err.message : err,
    );
  }
}

async function initializePlatform(): Promise<void> {
  await initializeStorageBridge();
  initializeCapacitorBridge();

  if (isIOS || isAndroid) {
    await import("@elizaos/app-core/platform/native-plugin-entrypoints");
    await initializeKeyboard();
    initializeAppLifecycle();
    initializeMobileRuntimeModeListener();
    void initializeMobileDeviceBridge();
    void initializeMobileAgentTunnel();
    // iOS local runtime: when ios-runtime mode resolves to "local", the
    // on-device JS runtime (@elizaos/capacitor-bun-runtime) is started
    // here. No-ops on Android, on iOS cloud/cloud-hybrid/remote-mac, and
    // when the native plugin isn't compiled into the binary.
    void bootIosLocalRuntimeIfApplicable();
    // Android local runtime: when mobile-runtime-mode is "local", calls
    // ElizaBunRuntimePlugin.start() which triggers ElizaAgentService to
    // start the Bun backend and polls until /api/health reports ready.
    // No-ops on iOS and when the plugin isn't compiled into the APK.
    void bootAndroidLocalRuntimeIfApplicable();
  }

  if (isDesktopPlatform()) {
    await initializeDesktopShell();
  } else {
    await initializeAgent();
  }
}

async function initializeKeyboard(): Promise<void> {
  if (isIOS) {
    await Keyboard.setResizeMode({ mode: KeyboardResize.None });
    await Keyboard.setScroll({ isDisabled: true });
    await Keyboard.setAccessoryBarVisible({ isVisible: true });
  }

  Keyboard.addListener("keyboardWillShow", (info) => {
    document.body.style.setProperty(
      "--keyboard-height",
      `${info.keyboardHeight}px`,
    );
    document.body.classList.add("keyboard-open");
  });

  Keyboard.addListener("keyboardWillHide", () => {
    document.body.style.setProperty("--keyboard-height", "0px");
    document.body.classList.remove("keyboard-open");
  });
}

function initializeAppLifecycle(): void {
  void Promise.resolve(
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        dispatchAppEvent(APP_RESUME_EVENT);
      } else {
        dispatchAppEvent(APP_PAUSE_EVENT);
      }
    }),
  ).catch((error) => {
    logNativePluginUnavailable("App", error);
  });

  void Promise.resolve(
    CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      }
    }),
  ).catch((error) => {
    logNativePluginUnavailable("App", error);
  });

  void Promise.resolve(
    CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      handleDeepLink(url);
    }),
  ).catch((error) => {
    logNativePluginUnavailable("App", error);
  });

  void CapacitorApp.getLaunchUrl()
    .then((result) => {
      if (result?.url) {
        handleDeepLink(result.url);
      }
    })
    .catch((error) => {
      logNativePluginUnavailable("App", error);
    });
}

function handleDeepLink(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  if (parsed.protocol !== `${APP_URL_SCHEME}:`) return;
  const path = getDeepLinkPath(parsed);

  switch (path) {
    case "chat":
      window.location.hash = "#chat";
      break;
    case "phone":
    case "phone/call":
      setHashRoute("phone", parsed.searchParams);
      break;
    case "messages":
    case "messages/compose":
      setHashRoute("messages", parsed.searchParams);
      break;
    case "contacts":
      setHashRoute("contacts", parsed.searchParams);
      break;
    case "wallet":
    case "inventory":
      setHashRoute("wallet", parsed.searchParams);
      break;
    case "browser":
      setHashRoute("browser", parsed.searchParams);
      break;
    case "lifeops":
      window.location.hash = "#lifeops";
      dispatchQueuedLifeOpsGithubCallbackFromUrl(url);
      break;
    case "settings":
      window.location.hash = "#settings";
      dispatchQueuedLifeOpsGithubCallbackFromUrl(url);
      break;
    case "connect": {
      const gatewayUrl = parsed.searchParams.get("url");
      if (gatewayUrl) {
        try {
          const validatedUrl = new URL(gatewayUrl);
          if (
            validatedUrl.protocol !== "https:" &&
            validatedUrl.protocol !== "http:"
          ) {
            console.error(
              `${APP_LOG_PREFIX} Invalid gateway URL protocol:`,
              validatedUrl.protocol,
            );
            break;
          }
          const token =
            parsed.searchParams.get("token") ??
            parsed.searchParams.get("accessToken") ??
            null;
          const connection = applyLaunchConnection({
            kind: "remote",
            apiBase: validatedUrl.href,
            token,
          });
          dispatchAppEvent(CONNECT_EVENT, {
            gatewayUrl: connection.apiBase,
            token: connection.token ?? undefined,
          });
        } catch {
          console.error(`${APP_LOG_PREFIX} Invalid gateway URL format`);
        }
      }
      break;
    }
    case "share": {
      const title = parsed.searchParams.get("title")?.trim() || undefined;
      const text = parsed.searchParams.get("text")?.trim() || undefined;
      const sharedUrl = parsed.searchParams.get("url")?.trim() || undefined;
      const files = parsed.searchParams
        .getAll("file")
        .map((filePath) => filePath.trim())
        .filter((filePath) => filePath.length > 0)
        .map((filePath) => {
          const slash = Math.max(
            filePath.lastIndexOf("/"),
            filePath.lastIndexOf("\\"),
          );
          const name = slash >= 0 ? filePath.slice(slash + 1) : filePath;
          return { name, path: filePath };
        });

      dispatchShareTarget({
        source: "deep-link",
        title,
        text,
        url: sharedUrl,
        files,
      });
      break;
    }
    default:
      console.warn(`${APP_LOG_PREFIX} Unknown deep link path:`, path);
      break;
  }
}

function getDeepLinkPath(parsed: URL): string {
  const host = parsed.host.replace(/^\/+|\/+$/g, "");
  const pathname = parsed.pathname.replace(/^\/+|\/+$/g, "");
  return [host, pathname].filter(Boolean).join("/");
}

function setHashRoute(route: string, params: URLSearchParams): void {
  const query = params.toString();
  window.location.hash = query ? `#${route}?${query}` : `#${route}`;
}

async function initializeDesktopShell(): Promise<void> {
  document.body.classList.add("desktop");

  const version = await Desktop.getVersion();
  const desktopNativeReady =
    typeof version.runtime === "string" &&
    version.runtime !== "N/A" &&
    version.runtime !== "unknown";
  if (!desktopNativeReady) return;

  await Desktop.registerShortcut({
    id: "command-palette",
    accelerator: "CommandOrControl+K",
  });

  await Desktop.addListener("shortcutPressed", (event: { id: string }) => {
    if (event.id === "command-palette") {
      dispatchAppEvent(COMMAND_PALETTE_EVENT);
    }
  });

  await Desktop.setTrayMenu({
    menu: [...DESKTOP_TRAY_MENU_ITEMS],
  });

  await Desktop.addListener(
    "trayMenuClick",
    (event: { itemId: string; checked?: boolean }) => {
      dispatchAppEvent(TRAY_ACTION_EVENT, event);
    },
  );

  subscribeDesktopBridgeEvent({
    rpcMessage: "shareTargetReceived",
    ipcChannel: "desktop:shareTargetReceived",
    listener: (payload) => {
      const url = (payload as { url?: string } | null | undefined)?.url;
      if (typeof url !== "string" || url.trim().length === 0) {
        return;
      }
      handleDeepLink(url);
    },
  });
}

function setupPlatformStyles(): void {
  const root = document.documentElement;
  document.body.classList.add(`platform-${platform}`);

  if (isNative) {
    document.body.classList.add("native");
  }

  root.style.setProperty("--safe-area-top", "env(safe-area-inset-top, 0px)");
  root.style.setProperty(
    "--safe-area-bottom",
    "env(safe-area-inset-bottom, 0px)",
  );
  root.style.setProperty("--safe-area-left", "env(safe-area-inset-left, 0px)");
  root.style.setProperty(
    "--safe-area-right",
    "env(safe-area-inset-right, 0px)",
  );
  root.style.setProperty("--keyboard-height", "0px");

  // Sizing on native: pin the React mount to the full visual viewport
  // so the chat composer + keyboard-resize interaction stays clamped.
  // We deliberately do NOT set `paddingTop / paddingLeft / paddingRight`
  // here — the @elizaos/ui shell components (StartupShell, RuntimeGate,
  // Header, page-layout-mobile-drawer, dialog, drawer-sheet) all apply
  // their own `var(--safe-area-*)` padding from the CSS variables set
  // a few lines above. Adding a second layer on `#root` doubles the
  // top inset and leaves a visible black band below the status bar.
  if (isNative) {
    const reactRoot = document.getElementById("root");
    if (reactRoot) {
      reactRoot.style.boxSizing = "border-box";
      reactRoot.style.minHeight = "100dvh";
      reactRoot.style.maxHeight = "100dvh";
    }
  }
}

function isPhoneCompanionMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  return params.get("mode") === "companion";
}

function isVoicePillShellMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  return params.get("shell") === "pill";
}

function resolveAppWindowSlug(): string | null {
  if (!isAppWindowRoute()) return null;
  const path = getWindowNavigationPath();
  if (!path.startsWith("/apps/")) return null;
  // Take only the first path segment after /apps/. URLs like
  // `/apps/plugins/extra` would otherwise yield a malformed slug
  // ("plugins/extra") that no descriptor can match.
  const slug = path
    .slice("/apps/".length)
    .replace(/[?#].*$/, "")
    .split("/")[0];
  return slug.length > 0 ? slug : null;
}

function mountReactApp(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element #root not found");

  if (isVoicePillShellMode()) {
    createRoot(rootEl).render(
      <ErrorBoundary>
        <StrictMode>
          <VoicePill ariaLabel={APP_BRANDING_BASE.appName ?? "Eliza"} />
        </StrictMode>
      </ErrorBoundary>,
    );
    return;
  }

  const phoneCompanion = isPhoneCompanionMode();
  const detachedShell = isDetachedWindowShell(windowShellRoute);
  const appWindowSlug = detachedShell ? null : resolveAppWindowSlug();

  createRoot(rootEl).render(
    <ErrorBoundary>
      <StrictMode>
        <Suspense fallback={null}>
          <AppProvider branding={APP_BRANDING}>
            {phoneCompanion ? (
              <CompanionShell tab="companion" actionNotice={null} />
            ) : detachedShell ? (
              <div className="flex h-[100dvh] min-h-0 w-full max-w-full flex-col overflow-hidden">
                <DetachedShellRoot route={windowShellRoute} />
              </div>
            ) : appWindowSlug ? (
              <div className="flex h-[100dvh] min-h-0 w-full max-w-full flex-col overflow-hidden">
                <AppWindowRenderer slug={appWindowSlug} />
              </div>
            ) : (
              <>
                {/* DesktopOnboardingRuntime was deleted upstream but main.tsx
                    still referenced it. The surface-navigation + tray runtimes
                    cover the desktop chrome bits we still need. */}
                <DesktopSurfaceNavigationRuntime />
                <DesktopTrayRuntime />
                <LifeOpsActivitySignalsEffect />
                <App />
              </>
            )}
          </AppProvider>
        </Suspense>
      </StrictMode>
    </ErrorBoundary>,
  );
}

function isPopoutWindow(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  return params.has("popout");
}

/**
 * Validates an apiBase string and applies it to the boot config.
 * Allows localhost, loopback, HTTPS, and private-network HTTP hosts.
 */
function validateAndSetApiBase(apiBase: string): void {
  try {
    const parsed = new URL(apiBase);
    const host = parsed.hostname;
    const allowPrivateHttp =
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(host) ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".ts.net");
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === window.location.hostname ||
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && allowPrivateHttp)
    ) {
      setBootConfig({ ...getBootConfig(), apiBase });
    } else {
      console.warn(`${APP_LOG_PREFIX} Rejected non-local apiBase:`, host);
    }
  } catch {
    if (apiBase.startsWith("/") && !apiBase.startsWith("//")) {
      setBootConfig({ ...getBootConfig(), apiBase });
    } else {
      console.warn(
        `${APP_LOG_PREFIX} Rejected invalid relative apiBase:`,
        apiBase,
      );
    }
  }
}

function injectPopoutApiBase(): void {
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  const apiBase = params.get("apiBase");
  if (apiBase) validateAndSetApiBase(apiBase);
}

function injectDetachedShellApiBase(): void {
  const apiBase = new URLSearchParams(window.location.search).get("apiBase");
  if (apiBase) validateAndSetApiBase(apiBase);
}

function mobileModeToIosRuntimeMode(
  mode: ReturnType<typeof normalizeMobileRuntimeMode>,
): IosRuntimeMode | null {
  return mode === "remote-mac" ||
    mode === "cloud" ||
    mode === "cloud-hybrid" ||
    mode === "local" ||
    mode === "tunnel-to-mobile"
    ? mode
    : null;
}

function getCurrentIosRuntimeConfig(): IosRuntimeConfig {
  if (typeof window === "undefined") return IOS_RUNTIME_ENV_CONFIG;
  try {
    const mode = mobileModeToIosRuntimeMode(
      normalizeMobileRuntimeMode(
        window.localStorage.getItem(MOBILE_RUNTIME_MODE_STORAGE_KEY),
      ),
    );
    if (!mode) return IOS_RUNTIME_ENV_CONFIG;
    return { ...IOS_RUNTIME_ENV_CONFIG, mode };
  } catch {
    return IOS_RUNTIME_ENV_CONFIG;
  }
}

function applyBuildTimeIosConnection(): void {
  if (!isNative) return;
  if (!IOS_RUNTIME_ENV_CONFIG.apiBase && !IOS_RUNTIME_ENV_CONFIG.apiToken)
    return;

  const current = getBootConfig();
  const next: AppBootConfig = {
    ...current,
    ...(IOS_RUNTIME_ENV_CONFIG.apiToken
      ? { apiToken: IOS_RUNTIME_ENV_CONFIG.apiToken }
      : {}),
  };
  setBootConfig(next);

  if (IOS_RUNTIME_ENV_CONFIG.apiBase) {
    validateAndSetApiBase(IOS_RUNTIME_ENV_CONFIG.apiBase);
  }
}

async function getOrCreateDeviceBridgeId(): Promise<string> {
  const existing = await Preferences.get({ key: DEVICE_BRIDGE_ID_KEY });
  if (existing.value?.trim()) return existing.value.trim();

  const prefix = isAndroid ? "android" : isIOS ? "ios" : "mobile";
  const generated =
    globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  await Preferences.set({ key: DEVICE_BRIDGE_ID_KEY, value: generated });
  return generated;
}

function resolveDeviceBridgeUrl(config: IosRuntimeConfig): string | null {
  if (config.deviceBridgeUrl) {
    return config.deviceBridgeUrl;
  }
  // cloud-hybrid: paired phone dials a remote agent via the cloud apiBase.
  // Android local: the foreground agent service owns the loopback API and the
  // WebView dials its device bridge for native llama.cpp calls.
  // iOS local: requests are handled by the in-process ITTP route kernel, so a
  // loopback WebSocket bridge is both unnecessary and unsafe in simulator runs
  // where host-level adb port forwarding can expose another device's agent.
  if (config.mode === "local" && isIOS) return null;
  if (config.mode === "local" && isAndroid) {
    return apiBaseToDeviceBridgeUrl(ANDROID_LOCAL_AGENT_API_BASE);
  }
  if (config.mode !== "cloud-hybrid" && config.mode !== "local") return null;
  const apiBase = getBootConfig().apiBase?.trim();
  if (!apiBase) return null;
  try {
    return apiBaseToDeviceBridgeUrl(apiBase);
  } catch {
    return null;
  }
}

async function initializeMobileDeviceBridge(): Promise<void> {
  const runtimeConfig = getCurrentIosRuntimeConfig();
  if (
    !isNative ||
    (runtimeConfig.mode !== "cloud-hybrid" && runtimeConfig.mode !== "local")
  ) {
    return;
  }
  if (mobileDeviceBridgeClient) return;
  if (mobileDeviceBridgeStartPromise) return;

  const agentUrl = resolveDeviceBridgeUrl(runtimeConfig);
  if (!agentUrl) return;

  mobileDeviceBridgeStartPromise = (async () => {
    try {
      const deviceId = await getOrCreateDeviceBridgeId();
      mobileDeviceBridgeClient = startDeviceBridgeClient({
        agentUrl,
        ...(runtimeConfig.deviceBridgeToken
          ? { pairingToken: runtimeConfig.deviceBridgeToken }
          : {}),
        deviceId,
        onStateChange: (state, detail) => {
          console.info(
            `${APP_LOG_PREFIX} Device bridge ${state}`,
            detail ?? "",
          );
        },
      });
    } catch (error) {
      console.warn(
        `${APP_LOG_PREFIX} Device bridge unavailable:`,
        error instanceof Error ? error.message : error,
      );
    } finally {
      mobileDeviceBridgeStartPromise = null;
    }
  })();

  await mobileDeviceBridgeStartPromise;
}

function stopMobileDeviceBridge(): void {
  mobileDeviceBridgeClient?.stop();
  mobileDeviceBridgeClient = null;
}

/**
 * Inbound-tunnel bridge: when the phone is in `tunnel-to-mobile` mode,
 * it hosts the on-device agent (the same `local`-mode codepath) and
 * holds an outbound connection to a relay so an external Mac client can
 * reach the agent. Implementation lives in
 * `@elizaos/capacitor-mobile-agent-bridge`. The native side is currently
 * a stub — see `docs/reverse-direction-tunneling.md` for the phased
 * plan. We invoke it best-effort here so the runtime-mode plumbing is
 * exercised today even while the transport is being built out.
 */
let mobileAgentTunnelStarted = false;
async function initializeMobileAgentTunnel(): Promise<void> {
  const runtimeConfig = getCurrentIosRuntimeConfig();
  if (!isNative || runtimeConfig.mode !== "tunnel-to-mobile") return;
  if (mobileAgentTunnelStarted) return;
  if (!runtimeConfig.tunnelRelayUrl) {
    console.info(
      `${APP_LOG_PREFIX} Tunnel-to-mobile mode active but no relay URL configured`,
    );
    return;
  }
  try {
    const { MobileAgentBridge } = await import(
      "@elizaos/capacitor-mobile-agent-bridge"
    );
    const deviceId = await getOrCreateDeviceBridgeId();
    await MobileAgentBridge.startInboundTunnel({
      relayUrl: runtimeConfig.tunnelRelayUrl,
      deviceId,
      ...(runtimeConfig.tunnelPairingToken
        ? { pairingToken: runtimeConfig.tunnelPairingToken }
        : {}),
    });
    mobileAgentTunnelStarted = true;
  } catch (error) {
    console.warn(
      `${APP_LOG_PREFIX} Mobile agent tunnel unavailable:`,
      error instanceof Error ? error.message : error,
    );
  }
}

function stopMobileAgentTunnel(): void {
  if (!mobileAgentTunnelStarted) return;
  mobileAgentTunnelStarted = false;
  void import("@elizaos/capacitor-mobile-agent-bridge")
    .then(({ MobileAgentBridge }) => MobileAgentBridge.stopInboundTunnel())
    .catch(() => {
      /* tunnel was best-effort; nothing to clean up if the plugin is absent */
    });
}

function initializeMobileRuntimeModeListener(): void {
  if (!isNative || mobileRuntimeModeListenerInstalled) return;
  mobileRuntimeModeListenerInstalled = true;
  document.addEventListener(MOBILE_RUNTIME_MODE_CHANGED_EVENT, () => {
    const mode = getCurrentIosRuntimeConfig().mode;
    if (mode === "cloud-hybrid" || mode === "local") {
      stopMobileDeviceBridge();
      stopMobileAgentTunnel();
      void initializeMobileDeviceBridge();
      return;
    }
    if (mode === "tunnel-to-mobile") {
      stopMobileDeviceBridge();
      stopMobileAgentTunnel();
      void initializeMobileAgentTunnel();
      return;
    }
    stopMobileDeviceBridge();
    stopMobileAgentTunnel();
  });
}

function applyStoredDetachedShellTheme(): void {
  applyUiTheme(loadUiTheme());
}

async function initializeStatusBar(): Promise<void> {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({ color: "#0a0a0a" });
  } catch {
    // StatusBar plugin unavailable on this platform — non-fatal.
  }
}

async function main(): Promise<void> {
  setupPlatformStyles();
  await initializeStatusBar();

  if (isVoicePillShellMode()) {
    mountReactApp();
    return;
  }

  applyBuildTimeIosConnection();

  try {
    await applyLaunchConnectionFromUrl();
  } catch (err) {
    console.error(
      `${APP_LOG_PREFIX} Failed to apply managed cloud launch session:`,
      err instanceof Error ? err.message : err,
    );
  }

  // MiladyOS only: pre-seed the on-device agent as the default runtime so
  // the RuntimeGate "Choose your setup" picker is bypassed entirely on first
  // launch. The same APK installed on a stock Android device falls through
  // to the picker — those users actively choose Cloud / Remote / Local.
  // Detection: `isMiladyOS` reads the `MiladyOS/<tag>` user-agent suffix
  // that `MainActivity` appends when `ro.miladyos.product` is set by the
  // AOSP product config. Settings ▸ Runtime exposes a deliberate
  // `?runtime=picker` re-entry on MiladyOS for users who want to switch.
  // No-op when the user already has a persisted runtime mode or active
  // server, so a deliberate cloud/remote choice — including one applied by
  // `applyLaunchConnectionFromUrl` above — is never clobbered.
  if (isMiladyOS()) {
    await registerMiladyOsSystemApps();
    preSeedAndroidLocalRuntimeIfFresh();
  }

  if (isPopoutWindow()) {
    injectPopoutApiBase();
    mountReactApp();
    return;
  }

  if (isDetachedWindowShell(windowShellRoute)) {
    injectDetachedShellApiBase();
    applyStoredDetachedShellTheme();
    syncDetachedShellLocation(windowShellRoute);
    await initializeStorageBridge();
    initializeCapacitorBridge();
    mountReactApp();
    return;
  }

  mountReactApp();
  await initializePlatform();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}

export { isAndroid, isDesktopPlatform as isDesktop, isIOS, isNative, platform };
