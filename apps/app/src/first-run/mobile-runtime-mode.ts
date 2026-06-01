import {
  dispatchAppEvent,
  MOBILE_RUNTIME_MODE_CHANGED_EVENT,
} from "@elizaos/app-core";
import { DEFAULT_DESKTOP_API_PORT } from "@elizaos/shared";

/**
 * Local-source copy of the mobile runtime-mode helpers `apps/app/src/main.tsx`
 * depends on. The upstream `@elizaos/ui/first-run/*` subpaths only resolve in
 * local-source mode (the repo-local `eliza/` checkout); the published package
 * declares the `./first-run/*` export but ships no matching `dist/`, so
 * packages-mode CI builds fail to resolve the specifier. Vendoring the minimal
 * symbols here keeps `apps/app` building in both modes.
 */

export const MOBILE_RUNTIME_MODE_STORAGE_KEY = "eliza:mobile-runtime-mode";

export const ANDROID_LOCAL_AGENT_API_BASE = `http://127.0.0.1:${DEFAULT_DESKTOP_API_PORT}`;
export const ANDROID_LOCAL_AGENT_IPC_BASE = "eliza-local-agent://ipc";
export const ANDROID_LOCAL_AGENT_SERVER_ID = "local:android";
export const ANDROID_LOCAL_AGENT_LABEL = "On-device agent";

export type MobileRuntimeMode =
  | "remote-mac"
  | "cloud"
  | "cloud-hybrid"
  | "local"
  | "tunnel-to-mobile";

export function normalizeMobileRuntimeMode(
  value: string | null | undefined,
): MobileRuntimeMode | null {
  const normalized = value?.trim();
  switch (normalized) {
    case "remote-mac":
    case "cloud":
    case "cloud-hybrid":
    case "local":
    case "tunnel-to-mobile":
      return normalized;
    default:
      return null;
  }
}

export function readPersistedMobileRuntimeMode(): MobileRuntimeMode | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeMobileRuntimeMode(
      window.localStorage.getItem(MOBILE_RUNTIME_MODE_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

async function persistNativeMobileRuntimeMode(
  mode: MobileRuntimeMode | null,
): Promise<void> {
  try {
    const [{ Capacitor }, { Preferences }] = await Promise.all([
      import("@capacitor/core"),
      import("@capacitor/preferences"),
    ]);
    if (!Capacitor.isNativePlatform()) return;
    if (mode) {
      await Preferences.set({
        key: MOBILE_RUNTIME_MODE_STORAGE_KEY,
        value: mode,
      });
    } else {
      await Preferences.remove({ key: MOBILE_RUNTIME_MODE_STORAGE_KEY });
    }
  } catch {
    // Capacitor Preferences is unavailable in web/unit-test shells.
  }
}

function persistLocalMobileRuntimeMode(): void {
  const mode: MobileRuntimeMode = "local";

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(MOBILE_RUNTIME_MODE_STORAGE_KEY, mode);
    } catch {
      // localStorage can be unavailable in embedded shells.
    }
  }

  void persistNativeMobileRuntimeMode(mode);

  if (typeof document !== "undefined") {
    dispatchAppEvent(MOBILE_RUNTIME_MODE_CHANGED_EVENT, { mode });
  }
}

function isAospElizaUserAgent(userAgent: string | null | undefined): boolean {
  if (typeof userAgent !== "string" || userAgent.length === 0) return false;
  return /\bElizaOS\/\S/.test(userAgent);
}

// Mirror of `ACTIVE_SERVER_STORAGE_KEY` in the UI state layer. Kept inline so
// this module stays a leaf and does not pull in the UI state graph.
const ACTIVE_SERVER_STORAGE_KEY = "elizaos:active-server";

function hasPersistedActiveServer(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(ACTIVE_SERVER_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { id?: unknown } | null;
    return (
      parsed != null &&
      typeof parsed === "object" &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0
    );
  } catch {
    return false;
  }
}

function writeLocalAgentActiveServer(): void {
  if (typeof window === "undefined") return;
  const payload = {
    id: ANDROID_LOCAL_AGENT_SERVER_ID,
    kind: "remote" as const,
    label: ANDROID_LOCAL_AGENT_LABEL,
    apiBase: ANDROID_LOCAL_AGENT_IPC_BASE,
  };
  try {
    window.localStorage.setItem(
      ACTIVE_SERVER_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // localStorage can be unavailable in embedded shells.
  }
}

function isBrandedAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return isAospElizaUserAgent(navigator.userAgent);
}

/**
 * Pre-seed the AOSP ElizaOS APK as the local agent when the device itself is
 * the on-device runtime and no prior selection exists.
 */
export function preSeedAndroidLocalRuntimeIfFresh(): boolean {
  if (!isBrandedAndroidDevice()) return false;
  if (readPersistedMobileRuntimeMode() != null) return false;
  if (hasPersistedActiveServer()) return false;

  persistLocalMobileRuntimeMode();
  writeLocalAgentActiveServer();
  return true;
}
