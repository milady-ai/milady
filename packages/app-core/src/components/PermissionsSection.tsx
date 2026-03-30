/**
 * PermissionsSection — System permissions and capability toggles for Settings.
 *
 * Displays:
 *   - System permission statuses (accessibility, screen-recording, microphone, camera)
 *   - Shell access toggle (soft disable/enable)
 *   - Capability toggles (browser, computeruse, vision) that depend on permissions
 *
 * Works cross-platform with platform-specific permission requirements:
 *   - Electrobun desktop: OS-level permission prompts and system settings links
 *   - Capacitor (mobile): Camera/mic/screen streaming permissions via native plugins
 *   - Web: Informational message only (no OS-level access)
 */

import { Button, StatusBadge, Switch } from "@miladyai/ui";
import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AllPermissionsState,
  client,
  type PermissionState,
  type PermissionStatus,
  type PluginInfo,
  type SystemPermissionId,
} from "../api";
import {
  invokeDesktopBridgeRequest,
  subscribeDesktopBridgeEvent,
} from "../bridge";
import {
  hasRequiredOnboardingPermissions,
  isDesktopPlatform,
  isNative,
  isWebPlatform,
} from "../platform";
import { useApp } from "../state";
import { PermissionIcon } from "./permissions/PermissionIcon";
import {
  StreamingPermissionsOnboardingView,
  StreamingPermissionsSettingsView,
} from "./permissions/StreamingPermissions";

/** Permission definition for UI rendering. */
interface PermissionDef {
  id: SystemPermissionId;
  name: string;
  nameKey: string;
  description: string;
  descriptionKey: string;
  icon: string;
  platforms: string[];
  requiredForFeatures: string[];
}

const SYSTEM_PERMISSIONS: PermissionDef[] = [
  {
    id: "accessibility",
    name: "Accessibility",
    nameKey: "permissionssection.permission.accessibility.name",
    description:
      "Control mouse, keyboard, and interact with other applications",
    descriptionKey: "permissionssection.permission.accessibility.description",
    icon: "cursor",
    platforms: ["darwin"],
    requiredForFeatures: ["computeruse", "browser"],
  },
  {
    id: "screen-recording",
    name: "Screen Recording",
    nameKey: "permissionssection.permission.screenRecording.name",
    description: "Capture screen content for screenshots and vision",
    descriptionKey: "permissionssection.permission.screenRecording.description",
    icon: "monitor",
    platforms: ["darwin"],
    requiredForFeatures: ["computeruse", "vision"],
  },
  {
    id: "microphone",
    name: "Microphone",
    nameKey: "permissionssection.permission.microphone.name",
    description: "Voice input for talk mode and speech recognition",
    descriptionKey: "permissionssection.permission.microphone.description",
    icon: "mic",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["talkmode", "voice"],
  },
  {
    id: "camera",
    name: "Camera",
    nameKey: "permissionssection.permission.camera.name",
    description: "Video input for vision and video capture",
    descriptionKey: "permissionssection.permission.camera.description",
    icon: "camera",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["camera", "vision"],
  },
  {
    id: "shell",
    name: "Shell Access",
    nameKey: "permissionssection.permission.shell.name",
    description: "Execute terminal commands and scripts",
    descriptionKey: "permissionssection.permission.shell.description",
    icon: "terminal",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["shell"],
  },
];

/** Capability toggle definition. */
interface CapabilityDef {
  id: string;
  label: string;
  labelKey: string;
  description: string;
  descriptionKey: string;
  requiredPermissions: SystemPermissionId[];
}

const CAPABILITIES: CapabilityDef[] = [
  {
    id: "browser",
    label: "Browser Control",
    labelKey: "permissionssection.capability.browser.label",
    description: "Automated web browsing and interaction",
    descriptionKey: "permissionssection.capability.browser.description",
    requiredPermissions: ["accessibility"],
  },
  {
    id: "computeruse",
    label: "Computer Use",
    labelKey: "permissionssection.capability.computerUse.label",
    description: "Full desktop control with mouse and keyboard",
    descriptionKey: "permissionssection.capability.computerUse.description",
    requiredPermissions: ["accessibility", "screen-recording"],
  },
  {
    id: "vision",
    label: "Vision",
    labelKey: "permissionssection.capability.vision.label",
    description: "Screen capture and visual analysis",
    descriptionKey: "permissionssection.capability.vision.description",
    requiredPermissions: ["screen-recording"],
  },
  {
    id: "coding-agent",
    label: "Coding Agent Swarms",
    labelKey: "permissionssection.capability.codingAgent.label",
    description:
      "Orchestrate CLI coding agents (Claude Code, Gemini, Codex, Aider, Pi)",
    descriptionKey: "permissionssection.capability.codingAgent.description",
    requiredPermissions: [],
  },
];

const PERMISSION_BADGE_LABELS: Record<
  PermissionStatus,
  {
    defaultLabel: string;
    labelKey: string;
    tone: "success" | "danger" | "warning" | "muted";
  }
> = {
  granted: {
    tone: "success",
    labelKey: "permissionssection.badge.granted",
    defaultLabel: "Granted",
  },
  denied: {
    tone: "danger",
    labelKey: "permissionssection.badge.denied",
    defaultLabel: "Denied",
  },
  "not-determined": {
    tone: "warning",
    labelKey: "permissionssection.badge.notDetermined",
    defaultLabel: "Not Set",
  },
  restricted: {
    tone: "muted",
    labelKey: "permissionssection.badge.restricted",
    defaultLabel: "Restricted",
  },
  "not-applicable": {
    tone: "muted",
    labelKey: "permissionssection.badge.notApplicable",
    defaultLabel: "N/A",
  },
};

const SETTINGS_REFRESH_DELAYS_MS = [1500, 4000] as const;
const SETTINGS_PANEL_CLASSNAME =
  "rounded-2xl border border-border/60 bg-card/92 shadow-sm";
const SETTINGS_PANEL_HEADER_CLASSNAME =
  "flex flex-col gap-3 border-b border-border/50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between";
const SETTINGS_PANEL_ACTIONS_CLASSNAME = "flex flex-wrap gap-2";

function translateWithFallback(
  t: (key: string) => string,
  key: string,
  fallback: string,
): string {
  const value = t(key);
  return !value || value === key ? fallback : value;
}

function getPermissionAction(
  t: (key: string) => string,
  id: SystemPermissionId,
  status: PermissionStatus,
  canRequest: boolean,
): {
  ariaLabelPrefix: string;
  label: string;
  type: "request" | "settings";
} | null {
  if (status === "granted" || status === "not-applicable") {
    return null;
  }

  if (status === "not-determined" && canRequest) {
    const label =
      id === "camera"
        ? translateWithFallback(
            t,
            "permissionssection.CheckAccess",
            "Check Access",
          )
        : translateWithFallback(t, "permissionssection.Grant", "Grant");
    return {
      ariaLabelPrefix: label,
      label,
      type: "request",
    };
  }

  const label = translateWithFallback(
    t,
    "permissionssection.OpenSettings",
    "Open Settings",
  );
  return {
    ariaLabelPrefix: label,
    label,
    type: "settings",
  };
}

function getPermissionBadge(
  t: (key: string) => string,
  id: SystemPermissionId,
  status: PermissionStatus,
  platform: string,
): { tone: "success" | "danger" | "warning" | "muted"; label: string } {
  if (status === "denied") {
    if (id === "shell") {
      return {
        tone: "danger",
        label: translateWithFallback(t, "permissionssection.badge.off", "Off"),
      };
    }

    if (platform === "darwin") {
      return {
        tone: "danger",
        label: translateWithFallback(
          t,
          "permissionssection.badge.offInSettings",
          "Off in Settings",
        ),
      };
    }
  }

  if (status === "not-determined") {
    return {
      tone: "warning",
      label: translateWithFallback(
        t,
        "permissionssection.badge.notAsked",
        "Not Asked",
      ),
    };
  }

  const badge = PERMISSION_BADGE_LABELS[status];
  return {
    tone: badge.tone,
    label: translateWithFallback(t, badge.labelKey, badge.defaultLabel),
  };
}

type DesktopMediaPermissionId = Extract<
  SystemPermissionId,
  "camera" | "microphone"
>;

function isDesktopMediaPermission(
  id: SystemPermissionId,
): id is DesktopMediaPermissionId {
  return id === "camera" || id === "microphone";
}

function mapRendererMediaPermissionState(
  state: "granted" | "denied" | "prompt" | undefined,
): PermissionStatus | null {
  if (state === "granted") {
    return "granted";
  }
  if (state === "denied") {
    return "denied";
  }
  if (state === "prompt") {
    return "not-determined";
  }
  return null;
}

function getRendererMediaConstraints(
  id: DesktopMediaPermissionId,
): MediaStreamConstraints {
  return id === "camera" ? { video: true } : { audio: true };
}

async function queryRendererMediaPermission(
  id: DesktopMediaPermissionId,
): Promise<PermissionStatus | null> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return null;
  }

  try {
    const result = await navigator.permissions.query({
      name: id as PermissionName,
    });
    return mapRendererMediaPermissionState(result?.state);
  } catch {
    return null;
  }
}

async function inferRendererMediaPermissionFromDevices(
  id: DesktopMediaPermissionId,
): Promise<PermissionStatus | null> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.enumerateDevices
  ) {
    return null;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!Array.isArray(devices)) {
      return null;
    }

    const kind = id === "camera" ? "videoinput" : "audioinput";
    return devices.some(
      (device) => device.kind === kind && Boolean(device.label?.trim()),
    )
      ? "granted"
      : null;
  } catch {
    return null;
  }
}

async function probeRendererMediaPermission(
  id: DesktopMediaPermissionId,
): Promise<PermissionStatus | null> {
  const queriedStatus = await queryRendererMediaPermission(id);
  if (queriedStatus === "granted" || queriedStatus === "denied") {
    return queriedStatus;
  }

  const inferredStatus = await inferRendererMediaPermissionFromDevices(id);
  if (inferredStatus) {
    return inferredStatus;
  }

  return queriedStatus;
}

async function requestRendererMediaPermission(
  id: DesktopMediaPermissionId,
): Promise<PermissionStatus | null> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      getRendererMediaConstraints(id),
    );
    stream.getTracks().forEach((track) => {
      track.stop();
    });
    return "granted";
  } catch {
    return probeRendererMediaPermission(id);
  }
}

async function reconcileRendererMediaPermissions(
  snapshot: DesktopPermissionsSnapshot,
): Promise<DesktopPermissionsSnapshot> {
  let nextPermissions = snapshot.permissions;
  let changed = false;

  for (const id of ["camera", "microphone"] as const) {
    const current = snapshot.permissions[id];
    if (!current || current.status === "restricted") {
      continue;
    }

    const rendererStatus = await probeRendererMediaPermission(id);
    if (!rendererStatus) {
      continue;
    }

    const nextCanRequest = rendererStatus === "not-determined";
    if (
      current.status === rendererStatus &&
      current.canRequest === nextCanRequest
    ) {
      continue;
    }

    if (!changed) {
      nextPermissions = { ...snapshot.permissions };
      changed = true;
    }

    nextPermissions[id] = {
      ...current,
      status: rendererStatus,
      canRequest: nextCanRequest,
      lastChecked: Date.now(),
    };
  }

  return changed
    ? {
        ...snapshot,
        permissions: nextPermissions,
      }
    : snapshot;
}

/** Individual permission row. */
function PermissionRow({
  def,
  status,
  platform,
  canRequest,
  onRequest,
  onOpenSettings,
  isShell,
  shellEnabled,
  onToggleShell,
}: {
  def: PermissionDef;
  status: PermissionStatus;
  platform: string;
  canRequest: boolean;
  onRequest: () => void;
  onOpenSettings: () => void;
  isShell: boolean;
  shellEnabled: boolean;
  onToggleShell?: (enabled: boolean) => void;
}) {
  const { t } = useApp();
  const action = getPermissionAction(t, def.id, status, canRequest);
  const badge = getPermissionBadge(t, def.id, status, platform);
  const name = translateWithFallback(t, def.nameKey, def.name);
  const description = translateWithFallback(
    t,
    def.descriptionKey,
    def.description,
  );

  return (
    <div className="flex flex-col gap-3 border-b border-border/50 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <PermissionIcon icon={def.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[13px] text-txt">{name}</span>
            {isShell && (
              <span className="rounded-full border border-border/50 bg-bg-hover px-2 py-0.5 text-[10px] font-medium text-muted-strong">
                {translateWithFallback(
                  t,
                  "permissionssection.LocalRuntime",
                  "Local runtime",
                )}
              </span>
            )}
          </div>
          <StatusBadge
            label={badge.label}
            variant={badge.tone}
            withDot
            className="rounded-full font-semibold"
          />
          <div className="mt-1 text-[11px] leading-5 text-muted">
            {description}
          </div>
        </div>
      </div>
      <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
        {isShell && onToggleShell && status !== "not-applicable" && (
          <div className="flex min-h-10 items-center gap-2 rounded-xl border border-border/50 bg-bg-hover px-3">
            <span className="text-[11px] font-medium text-muted-strong">
              {shellEnabled
                ? translateWithFallback(
                    t,
                    "permissionssection.Enabled",
                    "Enabled",
                  )
                : translateWithFallback(
                    t,
                    "permissionssection.Disabled",
                    "Disabled",
                  )}
            </span>
            <Switch
              checked={shellEnabled}
              onCheckedChange={onToggleShell}
              title={
                shellEnabled
                  ? translateWithFallback(
                      t,
                      "permissionssection.DisableShellAccess",
                      "Disable shell access",
                    )
                  : translateWithFallback(
                      t,
                      "permissionssection.EnableShellAccess",
                      "Enable shell access",
                    )
              }
            />
          </div>
        )}
        {!isShell && action && (
          <Button
            variant="default"
            size="sm"
            className="min-h-10 rounded-xl px-3 text-[11px] font-semibold"
            onClick={action.type === "request" ? onRequest : onOpenSettings}
            aria-label={`${action.ariaLabelPrefix} ${name}`}
          >
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Capability toggle button. */
function CapabilityToggle({
  cap,
  plugin,
  permissionsGranted,
  onToggle,
}: {
  cap: CapabilityDef;
  plugin: PluginInfo | null;
  permissionsGranted: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const { t } = useApp();
  const enabled = plugin?.enabled ?? false;
  const available = plugin !== null;
  const canEnable = permissionsGranted && available;
  const label = translateWithFallback(t, cap.labelKey, cap.label);
  const description = translateWithFallback(
    t,
    cap.descriptionKey,
    cap.description,
  );

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-sm transition-colors sm:flex-row sm:items-center ${
        enabled
          ? "border-accent/30 bg-accent/10"
          : "border-border/60 bg-card/92"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[13px] text-txt">{label}</span>
          {!available && (
            <span className="rounded-full border border-border/50 bg-bg-hover px-2 py-0.5 text-[10px] font-medium text-muted-strong">
              {translateWithFallback(
                t,
                "permissionssection.PluginUnavailable",
                "Plugin unavailable",
              )}
            </span>
          )}
          {!permissionsGranted && (
            <span className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] font-medium text-warn">
              {t("permissionssection.MissingPermissions")}
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] leading-5 text-muted">
          {description}
        </div>
      </div>
      <div className="flex w-full justify-end sm:w-auto">
        <div className="flex min-h-10 items-center gap-2 rounded-xl border border-border/50 bg-bg-hover px-3">
          <span className="text-[11px] font-medium text-muted-strong">
            {enabled
              ? translateWithFallback(
                  t,
                  "permissionssection.Enabled",
                  "Enabled",
                )
              : translateWithFallback(
                  t,
                  "permissionssection.Disabled",
                  "Disabled",
                )}
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={!canEnable}
            title={
              !available
                ? translateWithFallback(
                    t,
                    "permissionssection.PluginNotAvailable",
                    "Plugin not available",
                  )
                : !permissionsGranted
                  ? translateWithFallback(
                      t,
                      "permissionssection.GrantRequiredPermissionsFirst",
                      "Grant required permissions first",
                    )
                  : enabled
                    ? translateWithFallback(
                        t,
                        "permissionssection.Disable",
                        "Disable",
                      )
                    : translateWithFallback(
                        t,
                        "permissionssection.Enable",
                        "Enable",
                      )
            }
          />
        </div>
      </div>
    </div>
  );
}

interface DesktopPermissionsSnapshot {
  permissions: AllPermissionsState;
  platform: string;
  shellEnabled: boolean;
}

function useDesktopPermissionsState() {
  const [permissions, setPermissions] = useState<AllPermissionsState | null>(
    null,
  );
  const [platform, setPlatform] = useState<string>("unknown");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shellEnabled, setShellEnabled] = useState(true);
  const settingsRefreshTimersRef = useRef<number[]>([]);

  const applySnapshot = useCallback((snapshot: DesktopPermissionsSnapshot) => {
    setPermissions(snapshot.permissions);
    setPlatform(snapshot.platform);
    setShellEnabled(snapshot.shellEnabled);
  }, []);

  const clearScheduledSettingsRefreshes = useCallback(() => {
    if (typeof window === "undefined") {
      settingsRefreshTimersRef.current = [];
      return;
    }

    for (const timerId of settingsRefreshTimersRef.current) {
      window.clearTimeout(timerId);
    }
    settingsRefreshTimersRef.current = [];
  }, []);

  const loadPermissionsSnapshot = useCallback(
    async (forceRefresh = false): Promise<DesktopPermissionsSnapshot> => {
      const [bridgedPermissions, bridgedShellEnabled, bridgedPlatform] =
        await Promise.all([
          invokeDesktopBridgeRequest<AllPermissionsState>({
            rpcMethod: "permissionsGetAll",
            ipcChannel: "permissions:getAll",
            params: forceRefresh ? { forceRefresh: true } : undefined,
          }),
          invokeDesktopBridgeRequest<boolean>({
            rpcMethod: "permissionsIsShellEnabled",
            ipcChannel: "permissions:isShellEnabled",
          }),
          invokeDesktopBridgeRequest<string>({
            rpcMethod: "permissionsGetPlatform",
            ipcChannel: "permissions:getPlatform",
          }),
        ]);

      if (forceRefresh && bridgedPermissions === null) {
        await client.refreshPermissions();
      }

      const permissions = bridgedPermissions ?? (await client.getPermissions());
      const shellEnabled =
        bridgedShellEnabled === null
          ? await client.isShellEnabled()
          : bridgedShellEnabled;

      const snapshot = {
        permissions,
        platform: bridgedPlatform ?? "unknown",
        shellEnabled,
      };
      return reconcileRendererMediaPermissions(snapshot);
    },
    [],
  );

  const replaceSnapshot = useCallback(
    async (forceRefresh = false): Promise<DesktopPermissionsSnapshot> => {
      const snapshot = await loadPermissionsSnapshot(forceRefresh);
      applySnapshot(snapshot);
      return snapshot;
    },
    [applySnapshot, loadPermissionsSnapshot],
  );

  const scheduleSettingsRefreshes = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    clearScheduledSettingsRefreshes();

    for (const delayMs of SETTINGS_REFRESH_DELAYS_MS) {
      let timerId = 0;
      timerId = window.setTimeout(() => {
        settingsRefreshTimersRef.current =
          settingsRefreshTimersRef.current.filter(
            (currentTimerId) => currentTimerId !== timerId,
          );
        void replaceSnapshot(true);
      }, delayMs);
      settingsRefreshTimersRef.current.push(timerId);
    }
  }, [clearScheduledSettingsRefreshes, replaceSnapshot]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const snapshot = await loadPermissionsSnapshot();
        if (!cancelled) {
          applySnapshot(snapshot);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load permissions:", err);
          setPermissions(null);
          setPlatform("unknown");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySnapshot, loadPermissionsSnapshot]);

  useEffect(() => {
    return () => {
      clearScheduledSettingsRefreshes();
    };
  }, [clearScheduledSettingsRefreshes]);

  useEffect(() => {
    return subscribeDesktopBridgeEvent({
      rpcMessage: "permissionsChanged",
      ipcChannel: "permissions:changed",
      listener: () => {
        void replaceSnapshot(true);
      },
    });
  }, [replaceSnapshot]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      void replaceSnapshot(true);
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [replaceSnapshot]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      return await replaceSnapshot(true);
    } catch (err) {
      console.error("Failed to refresh permissions:", err);
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [replaceSnapshot]);

  const handleRequest = useCallback(
    async (id: SystemPermissionId) => {
      try {
        if (isDesktopMediaPermission(id)) {
          const rendererStatus = await requestRendererMediaPermission(id);
          if (rendererStatus === "granted") {
            await replaceSnapshot(true);
            return;
          }
        }

        const bridged = await invokeDesktopBridgeRequest<PermissionState>({
          rpcMethod: "permissionsRequest",
          ipcChannel: "permissions:request",
          params: { id },
        });
        if (bridged === null) {
          await client.requestPermission(id);
        }
        const snapshot = await replaceSnapshot(true);
        const status = snapshot.permissions[id]?.status;
        if (status && status !== "granted" && status !== "not-applicable") {
          scheduleSettingsRefreshes();
        }
      } catch (err) {
        console.error("Failed to request permission:", err);
      }
    },
    [replaceSnapshot, scheduleSettingsRefreshes],
  );

  const handleOpenSettings = useCallback(
    async (id: SystemPermissionId) => {
      try {
        const opened = await invokeDesktopBridgeRequest({
          rpcMethod: "permissionsOpenSettings",
          ipcChannel: "permissions:openSettings",
          params: { id },
        });
        if (opened === null) {
          await client.openPermissionSettings(id);
        }
        await replaceSnapshot(true);
        scheduleSettingsRefreshes();
      } catch (err) {
        console.error("Failed to open settings:", err);
      }
    },
    [replaceSnapshot, scheduleSettingsRefreshes],
  );

  const handleToggleShell = useCallback(
    async (enabled: boolean) => {
      try {
        const bridgeToggle = invokeDesktopBridgeRequest<PermissionState>({
          rpcMethod: "permissionsSetShellEnabled",
          ipcChannel: "permissions:setShellEnabled",
          params: { enabled },
        });
        await Promise.allSettled([
          bridgeToggle,
          client.setShellEnabled(enabled),
        ]);
        await replaceSnapshot(true);
      } catch (err) {
        console.error("Failed to toggle shell:", err);
      }
    },
    [replaceSnapshot],
  );

  return {
    handleOpenSettings,
    handleRefresh,
    handleRequest,
    handleToggleShell,
    loading,
    permissions,
    platform,
    refreshing,
    shellEnabled,
  };
}

/** Mobile (Capacitor) permission UI for streaming to cloud sandbox. */
function MobilePermissionsView() {
  const { t } = useApp();
  return (
    <StreamingPermissionsSettingsView
      mode="mobile"
      testId="mobile-permissions"
      title={translateWithFallback(
        t,
        "permissionssection.StreamingPermissions",
        "Streaming Permissions",
      )}
      description={translateWithFallback(
        t,
        "permissionssection.MobileStreamingDesc",
        "Your device streams camera, microphone, and screen to your Eliza Cloud agent for processing.",
      )}
    />
  );
}

/** Web browser permission UI — uses getUserMedia. */
function WebPermissionsView() {
  const { t } = useApp();
  return (
    <StreamingPermissionsSettingsView
      mode="web"
      testId="web-permissions-info"
      title={translateWithFallback(
        t,
        "permissionssection.BrowserPermissions",
        "Browser Permissions",
      )}
      description={translateWithFallback(
        t,
        "permissionssection.WebStreamingDesc",
        "Grant browser access to your camera, microphone, and screen to stream to your agent.",
      )}
    />
  );
}

function DesktopPermissionsView() {
  const { t } = useApp();
  const { plugins, handlePluginToggle } = useApp();
  const {
    handleOpenSettings,
    handleRefresh,
    handleRequest,
    handleToggleShell,
    loading,
    permissions,
    platform,
    refreshing,
    shellEnabled,
  } = useDesktopPermissionsState();

  /** Check if all required permissions for a capability are granted. */
  const arePermissionsGranted = useCallback(
    (requiredPerms: SystemPermissionId[]): boolean => {
      if (!permissions) return false;
      return requiredPerms.every((id) => {
        const state = permissions[id];
        return (
          state?.status === "granted" || state?.status === "not-applicable"
        );
      });
    },
    [permissions],
  );

  /** Filter permissions applicable to current platform. */
  const applicablePermissions = SYSTEM_PERMISSIONS.filter((def) => {
    if (!permissions) return true;
    const state = permissions[def.id];
    return state?.status !== "not-applicable";
  });

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/92 px-4 py-6 text-center text-xs text-muted shadow-sm">
        {translateWithFallback(
          t,
          "permissionssection.LoadingPermissions",
          "Loading permissions...",
        )}
      </div>
    );
  }

  if (!permissions) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/92 px-4 py-6 text-center text-xs text-muted shadow-sm">
        {translateWithFallback(
          t,
          "permissionssection.UnableToLoadPermi",
          "Unable to load permissions.",
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Permissions */}
      <div>
        <div className={SETTINGS_PANEL_CLASSNAME}>
          <div className={SETTINGS_PANEL_HEADER_CLASSNAME}>
            <div className="space-y-1">
              <div className="font-bold text-sm text-txt">
                {translateWithFallback(
                  t,
                  "permissionssection.SystemPermissions",
                  "System Permissions",
                )}
              </div>
              <div className="max-w-2xl text-[11px] leading-5 text-muted">
                {platform === "darwin"
                  ? translateWithFallback(
                      t,
                      "permissionssection.MacSystemPermissionsDescription",
                      "Review the native permissions Milady needs for desktop control, voice input, and visual analysis. macOS changes may require opening System Settings.",
                    )
                  : translateWithFallback(
                      t,
                      "permissionssection.SystemPermissionsDescription",
                      "Grant the runtime access it needs for voice input, camera capture, shell tasks, and desktop automation features.",
                    )}
              </div>
            </div>
            <div className={SETTINGS_PANEL_ACTIONS_CLASSNAME}>
              <Button
                variant="default"
                size="sm"
                className="min-h-10 rounded-xl px-3 text-[11px] font-semibold"
                onClick={async () => {
                  for (const def of applicablePermissions) {
                    if (def.id === "shell") continue;
                    const state = permissions[def.id];
                    if (state?.status === "granted") continue;
                    if (state?.canRequest) {
                      await handleRequest(def.id);
                    } else {
                      await handleOpenSettings(def.id);
                    }
                  }
                }}
              >
                {translateWithFallback(
                  t,
                  "permissionssection.AllowAll",
                  "Allow All",
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-10 rounded-xl px-3 text-[11px] font-semibold"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {refreshing
                  ? translateWithFallback(
                      t,
                      "permissionssection.Refreshing",
                      "Refreshing...",
                    )
                  : translateWithFallback(t, "common.refresh", "Refresh")}
              </Button>
            </div>
          </div>
          <div className="divide-y divide-border/50">
            {applicablePermissions.map((def) => {
              const state = permissions[def.id];
              return (
                <PermissionRow
                  key={def.id}
                  def={def}
                  status={state?.status ?? "not-determined"}
                  platform={platform}
                  canRequest={state?.canRequest ?? false}
                  onRequest={() => handleRequest(def.id)}
                  onOpenSettings={() => handleOpenSettings(def.id)}
                  isShell={def.id === "shell"}
                  shellEnabled={shellEnabled}
                  onToggleShell={
                    def.id === "shell" ? handleToggleShell : undefined
                  }
                />
              );
            })}
          </div>
        </div>
        <div className="mt-2 text-[11px] leading-5 text-muted">
          {platform === "darwin" ? (
            <>
              {translateWithFallback(
                t,
                "permissionssection.MacGrantAccessNote",
                "macOS requires Accessibility permission for computer control. Open System Settings → Privacy & Security to grant access.",
              )}
            </>
          ) : (
            <>
              {translateWithFallback(
                t,
                "permissionssection.GrantPermissionsNote",
                "Grant permissions to enable features like voice input and computer control.",
              )}
            </>
          )}
        </div>
      </div>

      {/* Capability Toggles */}
      <div>
        <div className={SETTINGS_PANEL_CLASSNAME}>
          <div className="border-b border-border/50 px-4 py-4">
            <div className="font-bold text-sm text-txt">
              {t("appsview.Capabilities")}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-muted">
              {translateWithFallback(
                t,
                "permissionssection.CapabilitiesDescription",
                "Turn higher-level capabilities on only after the required runtime permissions are available.",
              )}
            </div>
          </div>
          <div className="space-y-2 px-4 py-4">
            {CAPABILITIES.map((cap) => {
              const plugin = plugins.find((p) => p.id === cap.id) ?? null;
              const permissionsGranted = arePermissionsGranted(
                cap.requiredPermissions,
              );
              return (
                <CapabilityToggle
                  key={cap.id}
                  cap={cap}
                  plugin={plugin}
                  permissionsGranted={permissionsGranted}
                  onToggle={(enabled) => {
                    if (plugin) void handlePluginToggle(cap.id, enabled);
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="mt-2 text-[11px] leading-5 text-muted">
          {translateWithFallback(
            t,
            "permissionssection.CapabilitiesRequire",
            "Capabilities require the system permissions listed above.",
          )}
        </div>
      </div>
    </div>
  );
}

export function PermissionsSection() {
  if (isWebPlatform()) {
    return <WebPermissionsView />;
  }

  if (isNative && !isDesktopPlatform()) {
    return <MobilePermissionsView />;
  }

  return <DesktopPermissionsView />;
}

/**
 * Onboarding **senses** step: system / streaming permissions with explicit grant
 * and skip actions. Per-permission status stays visible on each row, while the footer
 * makes the outcome of skipping clear. **`onContinue()`** still advances the wizard;
 * `allowPermissionBypass` is used for the explicit skip path.
 */
/** Onboarding section for mobile — streaming permissions to cloud sandbox. */
function MobileOnboardingPermissions({
  onContinue,
  onBack,
}: {
  onContinue: (options?: { allowPermissionBypass?: boolean }) => void;
  onBack?: () => void;
}) {
  const { t } = useApp();
  return (
    <StreamingPermissionsOnboardingView
      mode="mobile"
      onContinue={onContinue}
      onBack={onBack}
      testId="mobile-onboarding-permissions"
      title={translateWithFallback(
        t,
        "permissionssection.StreamingPermissions",
        "Streaming Permissions",
      )}
      description={translateWithFallback(
        t,
        "permissionssection.MobileOnboardingDesc",
        "Allow access so your device can stream to your cloud agent.",
      )}
    />
  );
}

/** Web onboarding — browser media permissions. */
function WebOnboardingPermissions({
  onContinue,
  onBack,
}: {
  onContinue: (options?: { allowPermissionBypass?: boolean }) => void;
  onBack?: () => void;
}) {
  const { t } = useApp();
  return (
    <StreamingPermissionsOnboardingView
      mode="web"
      onContinue={onContinue}
      onBack={onBack}
      testId="web-onboarding-permissions"
      title={translateWithFallback(
        t,
        "permissionssection.BrowserPermissions",
        "Browser Permissions",
      )}
      description={translateWithFallback(
        t,
        "permissionssection.WebOnboardingDesc",
        "Allow browser access so your camera, mic, and screen can stream to your agent.",
      )}
    />
  );
}

export function PermissionsOnboardingSection({
  onContinue,
  onBack,
}: {
  onContinue: (options?: { allowPermissionBypass?: boolean }) => void;
  onBack?: () => void;
}) {
  // Web: no permissions needed
  if (isWebPlatform()) {
    return <WebOnboardingPermissions onContinue={onContinue} onBack={onBack} />;
  }

  // Mobile (Capacitor): streaming permissions
  if (isNative && !isDesktopPlatform()) {
    return (
      <MobileOnboardingPermissions onContinue={onContinue} onBack={onBack} />
    );
  }

  // Desktop shell: existing permission flow
  return (
    <DesktopOnboardingPermissions onContinue={onContinue} onBack={onBack} />
  );
}

function DesktopOnboardingPermissions({
  onContinue,
  onBack,
}: {
  onContinue: (options?: { allowPermissionBypass?: boolean }) => void;
  onBack?: () => void;
}) {
  const { t } = useApp();
  const {
    handleOpenSettings,
    handleRequest,
    handleRefresh,
    loading,
    permissions,
  } = useDesktopPermissionsState();
  const [grantingPermissions, setGrantingPermissions] = useState(false);

  /** Check if all critical permissions are granted (or not applicable). */
  const allGranted = hasRequiredOnboardingPermissions(permissions);
  const essentialPermissions = SYSTEM_PERMISSIONS.filter((def) => {
    const state = permissions?.[def.id];
    return state?.status !== "not-applicable" && def.id !== "shell";
  });
  const footerStatusMessage = allGranted
    ? translateWithFallback(
        t,
        "permissionssection.PermissionReadyNote",
        "All required permissions are ready. Continue when you're ready.",
      )
    : translateWithFallback(
        t,
        "permissionssection.PermissionSkipNote",
        "Skipping keeps desktop features locked until you grant the missing permissions in Settings.",
      );

  const handleGrantPermissions = useCallback(async () => {
    if (grantingPermissions) {
      return;
    }

    setGrantingPermissions(true);
    try {
      for (const def of essentialPermissions) {
        const state = permissions?.[def.id];
        if (state?.status === "granted") continue;
        if (state?.status === "not-determined" && state.canRequest) {
          await handleRequest(def.id);
          continue;
        }
        await handleOpenSettings(def.id);
      }

      const refreshed = await handleRefresh();
      if (
        refreshed &&
        hasRequiredOnboardingPermissions(refreshed.permissions)
      ) {
        onContinue();
      }
    } finally {
      setGrantingPermissions(false);
    }
  }, [
    grantingPermissions,
    essentialPermissions,
    handleOpenSettings,
    handleRefresh,
    handleRequest,
    onContinue,
    permissions,
  ]);

  const handleSkipForNow = useCallback(() => {
    onContinue({ allowPermissionBypass: true });
  }, [onContinue]);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="text-[var(--muted)] text-sm">
          {translateWithFallback(
            t,
            "permissionssection.CheckingPermissions",
            "Checking permissions...",
          )}
        </div>
      </div>
    );
  }

  if (!permissions) {
    return (
      <div className="text-center py-8">
        <div className="text-[var(--muted)] text-sm mb-4">
          {translateWithFallback(
            t,
            "permissionssection.UnableToCheckPerm",
            "Unable to check permissions.",
          )}
        </div>
        <Button
          type="button"
          variant="default"
          data-testid="permissions-onboarding-continue"
          onClick={() => onContinue()}
        >
          {translateWithFallback(t, "onboarding.savedMyKeys", "Continue")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <div className="text-xl font-bold mb-2">
          {translateWithFallback(
            t,
            "permissionssection.SystemPermissions",
            "System Permissions",
          )}
        </div>
        <div className="text-[var(--muted)] text-sm">
          {translateWithFallback(
            t,
            "permissionssection.GrantPermissionsTo",
            "Grant permissions to unlock desktop features.",
          )}
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {essentialPermissions.map((def) => {
          const state = permissions[def.id];
          const status = state?.status ?? "not-determined";
          const isGranted = status === "granted";
          const action = getPermissionAction(
            t,
            def.id,
            status,
            state?.canRequest ?? false,
          );

          return (
            <div
              key={def.id}
              data-permission-id={def.id}
              className={`flex flex-col gap-3 rounded-2xl border p-4 shadow-sm sm:flex-row sm:items-center ${
                isGranted
                  ? "border-ok/35 bg-ok/10"
                  : "border-border/60 bg-card/92"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <PermissionIcon icon={def.icon} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-txt">
                    {def.name}
                  </div>
                  <div className="text-[11px] leading-5 text-muted">
                    {def.description}
                  </div>
                </div>
              </div>
              {isGranted ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-ok/30 bg-ok/10">
                  <Check className="h-4 w-4 text-ok" />
                </div>
              ) : action ? (
                <Button
                  variant="default"
                  size="sm"
                  className="min-h-10 rounded-xl px-3 text-xs font-semibold text-txt-strong hover:text-txt-strong sm:self-center"
                  onClick={() =>
                    action.type === "request"
                      ? handleRequest(def.id)
                      : handleOpenSettings(def.id)
                  }
                  aria-label={`${action.ariaLabelPrefix} ${def.name}`}
                >
                  {action.label}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-[18px] border-t border-border/50 pt-3.5">
        <div className="mb-4 space-y-1 text-[11px] leading-5 text-muted">
          <p>{footerStatusMessage}</p>
          {!allGranted ? (
            <p>
              {translateWithFallback(
                t,
                "permissionssection.PermissionGrantNote",
                "Granting now will request what can be approved immediately and open Settings for anything that must be enabled there.",
              )}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {onBack ? (
            <Button
              variant="ghost"
              size="sm"
              className="justify-start p-0 text-[10px] uppercase tracking-[0.15em] text-muted-strong hover:text-txt"
              onClick={() => onBack()}
              type="button"
            >
              {translateWithFallback(t, "onboarding.back", "Back")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {!allGranted ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 rounded-xl px-4 py-2 text-[11px] font-semibold"
                disabled={grantingPermissions}
                onClick={handleSkipForNow}
              >
                {translateWithFallback(t, "onboarding.rpcSkip", "Skip for now")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="default"
              size="sm"
              data-testid="permissions-onboarding-continue"
              className="min-h-11 min-w-[8.5rem] rounded-xl px-4 py-2 text-[11px] font-semibold leading-tight text-txt-strong hover:text-txt-strong"
              disabled={grantingPermissions}
              onClick={allGranted ? () => onContinue() : handleGrantPermissions}
            >
              {allGranted
                ? translateWithFallback(t, "onboarding.savedMyKeys", "Continue")
                : grantingPermissions
                  ? translateWithFallback(
                      t,
                      "permissionssection.GrantingPermissions",
                      "Granting...",
                    )
                  : translateWithFallback(
                      t,
                      "permissionssection.GrantPermissions",
                      "Grant Permissions",
                    )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
