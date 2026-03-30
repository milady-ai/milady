import type { ConversationMode } from "../api/client";
import {
  DEFAULT_UI_LANGUAGE,
  normalizeLanguage,
  type UiLanguage,
} from "../i18n";
import type { Tab } from "../navigation";
import type {
  CompanionHalfFramerateMode,
  CompanionVrmPowerMode,
  OnboardingStep,
} from "./types";
import type { UiShellMode, UiTheme } from "./ui-preferences";
import { normalizeAvatarIndex } from "./vrm";

/* ── Shared localStorage helper ──────────────────────────────────────── */

function tryLocalStorage<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (err) {
    console.warn("[persistence] localStorage operation failed:", err);
    return fallback;
  }
}

/* ── Theme persistence ────────────────────────────────────────────────── */

export type { UiTheme } from "./ui-preferences";

const UI_THEME_STORAGE_KEY = "eliza:ui-theme";
const LEGACY_UI_THEME_STORAGE_KEY = "milady:ui-theme";
const THEME_SWITCHING_ATTRIBUTE = "data-theme-switching";
let themeSwitchResetFrameId: number | null = null;

function normalizeUiTheme(value: unknown): UiTheme {
  return value === "light" ? "light" : "dark";
}

export { normalizeUiTheme };

function suppressThemeTransitions(root: HTMLElement): void {
  if (typeof window === "undefined") return;
  root.setAttribute(THEME_SWITCHING_ATTRIBUTE, "");
  if (themeSwitchResetFrameId != null) {
    window.cancelAnimationFrame(themeSwitchResetFrameId);
  }
  themeSwitchResetFrameId = window.requestAnimationFrame(() => {
    themeSwitchResetFrameId = window.requestAnimationFrame(() => {
      root.removeAttribute(THEME_SWITCHING_ATTRIBUTE);
      themeSwitchResetFrameId = null;
    });
  });
}

export function loadUiTheme(): UiTheme {
  return tryLocalStorage(() => {
    const current = localStorage.getItem(UI_THEME_STORAGE_KEY);
    if (current != null) return normalizeUiTheme(current);
    return normalizeUiTheme(localStorage.getItem(LEGACY_UI_THEME_STORAGE_KEY));
  }, "dark");
}

export function saveUiTheme(theme: UiTheme): void {
  tryLocalStorage(() => {
    const normalized = normalizeUiTheme(theme);
    localStorage.setItem(UI_THEME_STORAGE_KEY, normalized);
    localStorage.setItem(LEGACY_UI_THEME_STORAGE_KEY, normalized);
  }, undefined);
}

const COMPANION_VRM_POWER_STORAGE_KEY = "eliza:companion-vrm-power";
/** Legacy; migrated into `eliza:companion-vrm-power` on first read. */
const LEGACY_COMPANION_EFFICIENCY_KEY = "eliza:companion-efficiency";
/** Legacy; migrated into `eliza:companion-vrm-power` on first read. */
const LEGACY_COMPANION_QUALITY_ON_BATTERY_KEY =
  "eliza:companion-quality-on-battery";

export function normalizeCompanionVrmPowerMode(
  value: unknown,
): CompanionVrmPowerMode {
  return value === "quality" || value === "efficiency" ? value : "balanced";
}

/**
 * Persisted 3D companion power preference. Migrates legacy boolean keys once.
 */
export function loadCompanionVrmPowerMode(): CompanionVrmPowerMode {
  try {
    const raw = localStorage.getItem(COMPANION_VRM_POWER_STORAGE_KEY);
    if (raw === "quality" || raw === "balanced" || raw === "efficiency") {
      return raw;
    }
    const legacyEffPresent =
      localStorage.getItem(LEGACY_COMPANION_EFFICIENCY_KEY) != null;
    const legacyQobPresent =
      localStorage.getItem(LEGACY_COMPANION_QUALITY_ON_BATTERY_KEY) != null;
    if (legacyEffPresent || legacyQobPresent) {
      const effOn =
        localStorage.getItem(LEGACY_COMPANION_EFFICIENCY_KEY) === "1";
      const qobOn =
        localStorage.getItem(LEGACY_COMPANION_QUALITY_ON_BATTERY_KEY) === "1";
      const migrated: CompanionVrmPowerMode = effOn
        ? "efficiency"
        : qobOn
          ? "quality"
          : "balanced";
      saveCompanionVrmPowerMode(migrated);
      localStorage.removeItem(LEGACY_COMPANION_EFFICIENCY_KEY);
      localStorage.removeItem(LEGACY_COMPANION_QUALITY_ON_BATTERY_KEY);
      return migrated;
    }
    if (raw != null && raw !== "") {
      saveCompanionVrmPowerMode("balanced");
    }
    return "balanced";
  } catch {
    return "balanced";
  }
}

export function saveCompanionVrmPowerMode(mode: CompanionVrmPowerMode): void {
  try {
    const next = normalizeCompanionVrmPowerMode(mode);
    localStorage.setItem(COMPANION_VRM_POWER_STORAGE_KEY, next);
    localStorage.removeItem(LEGACY_COMPANION_EFFICIENCY_KEY);
    localStorage.removeItem(LEGACY_COMPANION_QUALITY_ON_BATTERY_KEY);
  } catch {
    // ignore
  }
}

const COMPANION_ANIMATE_WHEN_HIDDEN_KEY = "eliza:companion-animate-when-hidden";

/** When true, keep the VRM loop running when the document is hidden; world/splat is dropped. */
export function loadCompanionAnimateWhenHidden(): boolean {
  try {
    return localStorage.getItem(COMPANION_ANIMATE_WHEN_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveCompanionAnimateWhenHidden(enabled: boolean): void {
  try {
    localStorage.setItem(
      COMPANION_ANIMATE_WHEN_HIDDEN_KEY,
      enabled ? "1" : "0",
    );
  } catch {
    // ignore
  }
}

const COMPANION_HALF_FRAMERATE_STORAGE_KEY = "eliza:companion-half-framerate";

const COMPANION_HALF_FRAMERATE_VALUES = new Set<CompanionHalfFramerateMode>([
  "off",
  "when_saving_power",
  "always",
]);

export function normalizeCompanionHalfFramerateMode(
  raw: string | null | undefined,
): CompanionHalfFramerateMode {
  if (
    raw &&
    COMPANION_HALF_FRAMERATE_VALUES.has(raw as CompanionHalfFramerateMode)
  ) {
    return raw as CompanionHalfFramerateMode;
  }
  return "when_saving_power";
}

export function loadCompanionHalfFramerateMode(): CompanionHalfFramerateMode {
  try {
    return normalizeCompanionHalfFramerateMode(
      localStorage.getItem(COMPANION_HALF_FRAMERATE_STORAGE_KEY),
    );
  } catch {
    return "when_saving_power";
  }
}

export function saveCompanionHalfFramerateMode(
  mode: CompanionHalfFramerateMode,
): void {
  try {
    localStorage.setItem(
      COMPANION_HALF_FRAMERATE_STORAGE_KEY,
      normalizeCompanionHalfFramerateMode(mode),
    );
  } catch {
    // ignore
  }
}

/**
 * Apply the theme to the document root.
 * Sets both `data-theme` attribute and `.dark` class so both CSS selectors
 * in base.css (`[data-theme="dark"]` and `.dark`) are satisfied.
 */
export function applyUiTheme(theme: UiTheme): void {
  if (typeof document === "undefined") return;
  const normalizedTheme = normalizeUiTheme(theme);
  const root = document.documentElement;
  if (!root) return;
  const currentTheme =
    typeof root.getAttribute === "function"
      ? root.getAttribute("data-theme")
      : (root.dataset?.theme ?? null);
  const shouldBeDark = normalizedTheme === "dark";
  const classMatchesTheme = root.classList
    ? root.classList.contains("dark") === shouldBeDark
    : true;
  const colorSchemeMatches =
    !root.style || root.style.colorScheme === normalizedTheme;

  if (
    currentTheme === normalizedTheme &&
    classMatchesTheme &&
    colorSchemeMatches
  ) {
    return;
  }

  suppressThemeTransitions(root);

  if (currentTheme !== normalizedTheme) {
    if (typeof root.setAttribute === "function") {
      root.setAttribute("data-theme", normalizedTheme);
    } else if ("dataset" in root && root.dataset) {
      root.dataset.theme = normalizedTheme;
    } else {
      return;
    }
  }

  if (root.style && root.style.colorScheme !== normalizedTheme) {
    root.style.colorScheme = normalizedTheme;
  }

  if (!root.classList || classMatchesTheme) return;
  if (shouldBeDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

const UI_LANGUAGE_STORAGE_KEY = "eliza:ui-language";
const UI_SHELL_MODE_STORAGE_KEY = "eliza:ui-shell-mode";
const LAST_NATIVE_TAB_STORAGE_KEY = "eliza:last-native-tab";
const ONBOARDING_STEP_STORAGE_KEY = "eliza:onboarding:step";

function normalizeOnboardingStep(value: unknown): OnboardingStep | null {
  switch (value) {
    case "cloud_login":
    case "identity":
    case "hosting":
    case "providers":
    case "voice":
    case "permissions":
    case "launch":
      return value;
    // Legacy step ID migration — map old persisted values to new equivalents
    case "welcome":
      return "cloud_login";
    case "connection":
      return "hosting";
    case "cloudLogin":
    case "rpc":
      return "providers";
    case "senses":
      return "permissions";
    case "activate":
      return "launch";
    default:
      return null;
  }
}

export function loadPersistedOnboardingStep(): OnboardingStep | null {
  return tryLocalStorage(
    () =>
      normalizeOnboardingStep(
        localStorage.getItem(ONBOARDING_STEP_STORAGE_KEY),
      ),
    null,
  );
}

export function saveOnboardingStep(step: OnboardingStep): void {
  tryLocalStorage(() => {
    localStorage.setItem(ONBOARDING_STEP_STORAGE_KEY, step);
  }, undefined);
}

export function clearPersistedOnboardingStep(): void {
  tryLocalStorage(() => {
    localStorage.removeItem(ONBOARDING_STEP_STORAGE_KEY);
  }, undefined);
}

/* ── Onboarding completion persistence ────────────────────────────────── */

const ONBOARDING_COMPLETE_STORAGE_KEY = "eliza:onboarding-complete";

export function loadPersistedOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_COMPLETE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function savePersistedOnboardingComplete(complete: boolean): void {
  try {
    if (complete) {
      localStorage.setItem(ONBOARDING_COMPLETE_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(ONBOARDING_COMPLETE_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function loadUiLanguage(): UiLanguage {
  return tryLocalStorage(() => {
    const stored = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    return normalizeLanguage(stored ?? DEFAULT_UI_LANGUAGE);
  }, DEFAULT_UI_LANGUAGE);
}

export function saveUiLanguage(language: UiLanguage): void {
  tryLocalStorage(() => {
    localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, normalizeLanguage(language));
  }, undefined);
}

function normalizeUiShellMode(mode: unknown): UiShellMode {
  return mode === "native" ? "native" : "companion";
}

export { normalizeUiShellMode };

export function loadUiShellMode(): UiShellMode {
  return tryLocalStorage(
    () => normalizeUiShellMode(localStorage.getItem(UI_SHELL_MODE_STORAGE_KEY)),
    "companion",
  );
}

export function saveUiShellMode(mode: UiShellMode): void {
  tryLocalStorage(() => {
    localStorage.setItem(UI_SHELL_MODE_STORAGE_KEY, normalizeUiShellMode(mode));
  }, undefined);
}

function normalizeLastNativeTab(tab: unknown): Tab {
  switch (tab) {
    case "chat":
    case "stream":
    case "apps":
    case "wallets":
    case "knowledge":
    case "connectors":
    case "triggers":
    case "plugins":
    case "skills":
    case "actions":
    case "advanced":
    case "fine-tuning":
    case "trajectories":
    case "voice":
    case "runtime":
    case "database":
    case "desktop":
    case "settings":
    case "logs":
    case "security":
      return tab;
    default:
      return "chat";
  }
}

export function loadLastNativeTab(): Tab {
  return tryLocalStorage(
    () =>
      normalizeLastNativeTab(localStorage.getItem(LAST_NATIVE_TAB_STORAGE_KEY)),
    "chat",
  );
}

export function saveLastNativeTab(tab: Tab): void {
  tryLocalStorage(() => {
    localStorage.setItem(
      LAST_NATIVE_TAB_STORAGE_KEY,
      normalizeLastNativeTab(tab),
    );
  }, undefined);
}

/* ── Avatar persistence ───────────────────────────────────────────────── */
const AVATAR_INDEX_KEY = "eliza_avatar_index";

export function loadAvatarIndex(): number {
  return tryLocalStorage(() => {
    const stored = localStorage.getItem(AVATAR_INDEX_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      return normalizeAvatarIndex(n);
    }
    return 1;
  }, 1);
}

export function saveAvatarIndex(index: number): void {
  tryLocalStorage(() => {
    localStorage.setItem(AVATAR_INDEX_KEY, String(normalizeAvatarIndex(index)));
  }, undefined);
}

export function clearAvatarIndex(): void {
  tryLocalStorage(() => {
    localStorage.removeItem(AVATAR_INDEX_KEY);
  }, undefined);
}

/* ── Chat UI persistence ──────────────────────────────────────────────── */
const CHAT_AVATAR_VISIBLE_KEY = "eliza:chat:avatarVisible";
const CHAT_VOICE_MUTED_KEY = "eliza:chat:voiceMuted";

export function loadChatAvatarVisible(): boolean {
  return tryLocalStorage(() => {
    const stored = localStorage.getItem(CHAT_AVATAR_VISIBLE_KEY);
    return stored === null ? true : stored === "true";
  }, true);
}

export function loadChatVoiceMuted(): boolean {
  return tryLocalStorage(() => {
    const stored = localStorage.getItem(CHAT_VOICE_MUTED_KEY);
    return stored === null ? false : stored === "true";
  }, false);
}

export function saveChatAvatarVisible(value: boolean): void {
  tryLocalStorage(() => {
    localStorage.setItem(CHAT_AVATAR_VISIBLE_KEY, String(value));
  }, undefined);
}

export function saveChatVoiceMuted(value: boolean): void {
  tryLocalStorage(() => {
    localStorage.setItem(CHAT_VOICE_MUTED_KEY, String(value));
  }, undefined);
}

/* ── Chat mode persistence ─────────────────────────────────────────────── */
const CHAT_MODE_KEY = "eliza:chat:mode";
const ACTIVE_CONVERSATION_ID_KEY = "eliza:chat:activeConversationId";
const COMPANION_MESSAGE_CUTOFF_TS_KEY = "eliza:chat:companionMessageCutoffTs";

export function loadChatMode(): ConversationMode {
  return tryLocalStorage(() => {
    const stored = localStorage.getItem(CHAT_MODE_KEY);
    return stored === "power" ? "power" : "simple";
  }, "simple");
}

export function saveChatMode(value: ConversationMode): void {
  tryLocalStorage(() => {
    localStorage.setItem(CHAT_MODE_KEY, value);
  }, undefined);
}

export function loadActiveConversationId(): string | null {
  return tryLocalStorage(() => {
    const stored = localStorage.getItem(ACTIVE_CONVERSATION_ID_KEY)?.trim();
    return stored ? stored : null;
  }, null);
}

export function saveActiveConversationId(value: string | null): void {
  tryLocalStorage(() => {
    if (value?.trim()) {
      localStorage.setItem(ACTIVE_CONVERSATION_ID_KEY, value);
      return;
    }
    localStorage.removeItem(ACTIVE_CONVERSATION_ID_KEY);
  }, undefined);
}

export function loadCompanionMessageCutoffTs(): number {
  return tryLocalStorage(() => {
    const stored = localStorage.getItem(COMPANION_MESSAGE_CUTOFF_TS_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, 0);
}

export function saveCompanionMessageCutoffTs(value: number): void {
  tryLocalStorage(() => {
    localStorage.setItem(
      COMPANION_MESSAGE_CUTOFF_TS_KEY,
      String(Math.max(0, Math.trunc(value))),
    );
  }, undefined);
}

/* ── Connection mode persistence ──────────────────────────────────────── */

/**
 * Persisted connection state so the app knows how to connect on restart
 * without waiting for a backend that may not exist yet.
 */
export interface PersistedConnectionMode {
  /** "local" = embedded agent, "cloud" = eliza cloud sandbox, "remote" = custom URL */
  runMode: "local" | "cloud" | "remote";
  /** For cloud: the eliza cloud API base URL */
  cloudApiBase?: string;
  /** For cloud: the auth token */
  cloudAuthToken?: string;
  /** For remote: the remote API base URL */
  remoteApiBase?: string;
  /** For remote: the access token/connection key */
  remoteAccessToken?: string;
}

const CONNECTION_MODE_STORAGE_KEY = "eliza:connection-mode";

export function loadPersistedConnectionMode(): PersistedConnectionMode | null {
  return tryLocalStorage(() => {
    const stored = localStorage.getItem(CONNECTION_MODE_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed.runMode === "local" ||
        parsed.runMode === "cloud" ||
        parsed.runMode === "remote")
    ) {
      return parsed as PersistedConnectionMode;
    }
    return null;
  }, null);
}

export function savePersistedConnectionMode(
  mode: PersistedConnectionMode,
): void {
  tryLocalStorage(() => {
    localStorage.setItem(CONNECTION_MODE_STORAGE_KEY, JSON.stringify(mode));
  }, undefined);
}

export function clearPersistedConnectionMode(): void {
  tryLocalStorage(() => {
    localStorage.removeItem(CONNECTION_MODE_STORAGE_KEY);
  }, undefined);
}
