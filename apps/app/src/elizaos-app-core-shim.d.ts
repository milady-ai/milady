// Type-only augmentation of @elizaos/app-core / @elizaos/shared for symbols
// that apps/app/src/main.tsx imports but that aren't yet present in the
// published `beta` dist-tag of those packages. These imports landed in
// 25e175ef5c (2026-04-26) when the desktop multi-window / companion shell
// surface was being staged; the corresponding @elizaos/* publish step
// hasn't caught up yet, so develop's typecheck has been blocked.
//
// Same pattern as ./capacitor-plugin-modules.d.ts. Pure type augmentation,
// no runtime code emitted. Replace these shims with real imports once the
// upstream publish lands.

declare module "@elizaos/app-core" {
  // Window / shell event channel names — string-literal constants in
  // upstream, narrowed to `string` here so dispatch sites still typecheck.
  export const AGENT_READY_EVENT: string;
  export const APP_PAUSE_EVENT: string;
  export const APP_RESUME_EVENT: string;
  export const COMMAND_PALETTE_EVENT: string;
  export const CONNECT_EVENT: string;
  export const MOBILE_RUNTIME_MODE_CHANGED_EVENT: string;
  export const SHARE_TARGET_EVENT: string;
  export const TRAY_ACTION_EVENT: string;

  // Storage keys / API base URL constants.
  export const ANDROID_LOCAL_AGENT_API_BASE: string;
  export const MOBILE_RUNTIME_MODE_STORAGE_KEY: string;

  // Desktop tray menu schema.
  export const DESKTOP_TRAY_MENU_ITEMS: ReadonlyArray<unknown>;

  // App + boot config — opaque to consumers in main.tsx.
  export interface AppBootConfig {
    branding?: unknown;
    defaultApps?: unknown;
    assetBaseUrl?: string;
    apiBase?: string;
    apiToken?: string;
    [key: string]: unknown;
  }
  export interface AppConfig {
    appId?: string;
    appName?: string;
    [key: string]: unknown;
  }
  export interface BrandingConfig {
    [key: string]: unknown;
  }
  export interface CharacterCatalogData {
    [key: string]: unknown;
  }
  export interface CompanionSceneStatus {
    [key: string]: unknown;
  }
  export interface CompanionShellComponentProps {
    [key: string]: unknown;
  }
  export interface VincentStateHookArgs {
    [key: string]: unknown;
  }
  export type VincentStateHookResult = unknown;

  // iOS runtime config. The named string fields are declared explicitly so
  // that truthy narrowing (`if (config.tunnelRelayUrl) {...}`) gives `string`
  // rather than `{}` (which is what `unknown` narrows to under !=null guards
  // and would fail downstream string-typed params).
  export type IosRuntimeMode = string;
  export interface IosRuntimeConfig {
    mode: IosRuntimeMode;
    apiBase?: string;
    apiToken?: string;
    cloudApiBase?: string;
    deviceBridgeUrl?: string;
    deviceBridgeToken?: string;
    tunnelRelayUrl?: string;
    tunnelPairingToken?: string;
    [key: string]: unknown;
  }
  export function resolveIosRuntimeConfig(...args: unknown[]): IosRuntimeConfig;

  // Boot / runtime helpers.
  export function getBootConfig(): AppBootConfig;
  export function setBootConfig(config: Partial<AppBootConfig>): void;
  export function resolveAppBranding(...args: unknown[]): BrandingConfig;
  export function normalizeMobileRuntimeMode(value: unknown): string;
  export function preSeedAndroidLocalRuntimeIfFresh(
    ...args: unknown[]
  ): Promise<void>;
  export function apiBaseToDeviceBridgeUrl(apiBase: string): string;
  export function shouldUseCloudOnlyBranding(...args: unknown[]): boolean;

  // Event dispatch + bridge helpers — `subscribeDesktopBridgeEvent` is
  // typed precisely enough to keep the `listener: (payload) => ...`
  // callback in main.tsx out of implicit-any territory.
  export function dispatchAppEvent(eventName: string, payload?: unknown): void;
  export function initializeCapacitorBridge(): void;
  export function initializeStorageBridge(): void;
  export function isElectrobunRuntime(): boolean;
  export function subscribeDesktopBridgeEvent(args: {
    rpcMessage: string;
    ipcChannel: string;
    listener: (payload: unknown) => void;
  }): () => void;

  // Onboarding / launch-connection / patch helpers.
  export function applyForceFreshOnboardingReset(...args: unknown[]): void;
  // `applyLaunchConnection` returns the resolved connection record so main.tsx
  // can dispatch a CONNECT_EVENT with the resolved apiBase / token. Shape is
  // narrowed enough to satisfy the destructuring at the call site without
  // pinning the full upstream contract.
  export interface ResolvedLaunchConnection {
    apiBase: string;
    token?: string | null;
    [key: string]: unknown;
  }
  export function applyLaunchConnection(
    ...args: unknown[]
  ): ResolvedLaunchConnection;
  export function applyLaunchConnectionFromUrl(...args: unknown[]): void;
  export function installDesktopPermissionsClientPatch(
    ...args: unknown[]
  ): void;
  export function installForceFreshOnboardingClientPatch(
    ...args: unknown[]
  ): void;
  export function installLocalProviderCloudPreferencePatch(
    ...args: unknown[]
  ): void;
  export function shouldInstallMainWindowOnboardingPatches(
    ...args: unknown[]
  ): boolean;

  // Window-shell routing. `isAppWindowRoute()` is called both with an
  // explicit path string and (in main.tsx's resolveAppWindowSlug) with no
  // argument — the no-arg form reads window.location internally.
  export function isAppWindowRoute(path?: string): boolean;
  export function isDetachedWindowShell(...args: unknown[]): boolean;
  export function isPillWindowShell(...args: unknown[]): boolean;
  export function getWindowNavigationPath(...args: unknown[]): string;
  export function resolveWindowShellRoute(...args: unknown[]): unknown;
  export function syncDetachedShellLocation(...args: unknown[]): void;

  // UI theme helpers.
  export function applyUiTheme(...args: unknown[]): void;
  export function loadUiTheme(...args: unknown[]): Promise<unknown>;

  // React-side surface — typed as a permissive component to keep JSX usage
  // typechecking without committing to a specific prop shape.
  import type * as React from "react";
  type LooseComponent = React.ComponentType<Record<string, unknown>>;
  export const App: LooseComponent;
  export const AppProvider: LooseComponent;
  export const AppWindowRenderer: LooseComponent;
  export const DetachedShellRoot: LooseComponent;
  export const DesktopSurfaceNavigationRuntime: LooseComponent;
  export const DesktopTrayRuntime: LooseComponent;
  export const ErrorBoundary: LooseComponent;

  // Generic API client — main.tsx uses the token helpers during the
  // local-agent bearer-prefetch loop; the rest of the surface stays open
  // for consumers to cast as needed.
  export interface ElizaApiClient {
    hasToken(): boolean;
    setToken(token: string): void;
    clearToken?(): void;
    [key: string]: unknown;
  }
  export const client: ElizaApiClient;
}

declare module "@elizaos/app-core/platform" {
  const _default: unknown;
  export default _default;
}

declare module "@elizaos/app-core/platform/native-plugin-entrypoints" {
  const _default: unknown;
  export default _default;
}

declare module "@elizaos/app-core/api" {
  // optional-eliza-app-stub.tsx imports these as named *types*. The real
  // package will publish them as discriminated unions; the stub-builds path
  // never inspects internal fields, so `unknown` is sufficient and keeps
  // the WalletStateHook surface type-stable.
  export type DropStatus = unknown;
  export type MintResult = unknown;
  export type RegistryStatus = unknown;
  export type WalletExportResult = unknown;
  export type WhitelistStatus = unknown;
}

declare module "@elizaos/shared/onboarding-presets" {
  // Minimal shape needed by main.tsx — the .sort/.map callbacks read
  // `avatarIndex` and `name` off each preset.
  export interface StylePreset {
    name: string;
    avatarIndex: number;
    [key: string]: unknown;
  }
  export function getStylePresets(): StylePreset[];
}

declare module "@elizaos/shared/dist/index.js" {
  // The PR #2148 rename target lives in @elizaos/shared/dist/themes/presets,
  // not in the top-level index. Augment the index here so the existing
  // `import { ELIZA_DEFAULT_THEME } from "@elizaos/shared/dist/index.js"`
  // typechecks until the upstream beta publish lifts the export.
  export const ELIZA_DEFAULT_THEME: unknown;
}
