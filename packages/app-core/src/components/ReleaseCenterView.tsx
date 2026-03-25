import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  invokeDesktopBridgeRequest,
  isElectrobunRuntime,
  subscribeDesktopBridgeEvent,
} from "../bridge";
import { useApp } from "../state";
import { openDesktopSurfaceWindow } from "../utils/desktop-workspace";
import {
  normalizeReleaseNotesUrl,
  summarizeError,
} from "./release-center/shared";
import {
  type AppReleaseStatus,
  type DesktopBuildInfo,
  type DesktopReleaseNotesWindowInfo,
  type DesktopSessionSnapshot,
  type DesktopUpdaterSnapshot,
  RELEASE_NOTES_PARTITION,
  SESSION_PARTITIONS,
  type WebGpuBrowserStatus,
  type WgpuTagElement,
} from "./release-center/types";

const RELEASE_PANEL_CLASSNAME =
  "rounded-2xl border border-border/50 bg-card/92 shadow-sm";
const RELEASE_STATUS_MESSAGE_CLASSNAME =
  "rounded-xl border px-3 py-2 text-xs shadow-sm";
const RELEASE_ACTION_BUTTON_CLASSNAME =
  "min-h-10 rounded-xl px-3 text-xs font-medium";
const RELEASE_KV_ROW_CLASSNAME =
  "flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-bg-hover/70 px-3 py-2";

export function ReleaseCenterView() {
  const { appUrl } = useBranding();
  const defaultReleaseNotesUrl = `${appUrl}/releases/`;
  const desktopRuntime = isElectrobunRuntime();
  const { loadUpdateStatus, updateLoading, updateStatus } = useApp();

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [nativeUpdater, setNativeUpdater] =
    useState<DesktopUpdaterSnapshot | null>(null);
  const [_buildInfo, setBuildInfo] = useState<DesktopBuildInfo | null>(null);
  const [dockVisible, setDockVisible] = useState<boolean>(true);
  const [_sessionSnapshots, setSessionSnapshots] = useState<
    Record<string, DesktopSessionSnapshot | undefined>
  >({});
  const [_webGpuStatus, setWebGpuStatus] = useState<WebGpuBrowserStatus | null>(
    null,
  );
  const [_releaseNotesWindow, setReleaseNotesWindow] =
    useState<DesktopReleaseNotesWindowInfo | null>(null);
  const [releaseNotesUrl, setReleaseNotesUrl] = useState(
    defaultReleaseNotesUrl,
  );
  const [releaseNotesUrlDirty, setReleaseNotesUrlDirty] = useState(false);
  const [wgpuTagAvailable, setWgpuTagAvailable] = useState(false);
  const [_wgpuReady, setWgpuReady] = useState(false);
  const [_wgpuTransparent, _setWgpuTransparent] = useState(false);
  const [_wgpuPassthrough, _setWgpuPassthrough] = useState(false);
  const [_wgpuHidden, _setWgpuHidden] = useState(false);
  const wgpuRef = useRef<WgpuTagElement | null>(null);

  const refreshNativeState = useCallback(async () => {
    if (!desktopRuntime) {
      return;
    }

    const [updater, build, dock, gpuStatus, ...sessionResults] =
      await Promise.all([
        invokeDesktopBridgeRequest<DesktopUpdaterSnapshot>({
          rpcMethod: "desktopGetUpdaterState",
          ipcChannel: "desktop:getUpdaterState",
        }),
        invokeDesktopBridgeRequest<DesktopBuildInfo>({
          rpcMethod: "desktopGetBuildInfo",
          ipcChannel: "desktop:getBuildInfo",
        }),
        invokeDesktopBridgeRequest<{ visible: boolean }>({
          rpcMethod: "desktopGetDockIconVisibility",
          ipcChannel: "desktop:getDockIconVisibility",
        }),
        invokeDesktopBridgeRequest<WebGpuBrowserStatus>({
          rpcMethod: "desktopGetWebGpuBrowserStatus",
          ipcChannel: "desktop:getWebGpuBrowserStatus",
        }),
        ...SESSION_PARTITIONS.map(({ partition }) =>
          invokeDesktopBridgeRequest<DesktopSessionSnapshot>({
            rpcMethod: "desktopGetSessionSnapshot",
            ipcChannel: "desktop:getSessionSnapshot",
            params: { partition },
          }),
        ),
      ]);

    setNativeUpdater(updater);
    setBuildInfo(build);
    setDockVisible(dock?.visible ?? true);
    setWebGpuStatus(gpuStatus);
    setSessionSnapshots(
      Object.fromEntries(
        SESSION_PARTITIONS.map((entry, index) => [
          entry.partition,
          sessionResults[index] ?? undefined,
        ]),
      ),
    );
    setReleaseNotesUrl((current) =>
      releaseNotesUrlDirty
        ? current
        : normalizeReleaseNotesUrl(updater?.baseUrl ?? current),
    );
  }, [desktopRuntime, releaseNotesUrlDirty]);

  useEffect(() => {
    if (!desktopRuntime) {
      return;
    }

    void loadUpdateStatus();
    void refreshNativeState();
  }, [desktopRuntime, loadUpdateStatus, refreshNativeState]);

  useEffect(() => {
    setWgpuTagAvailable(
      typeof window !== "undefined" &&
        Boolean(window.customElements.get("electrobun-wgpu")),
    );
  }, []);

  useEffect(() => {
    const element = wgpuRef.current;
    if (!desktopRuntime || !wgpuTagAvailable || !element) {
      return;
    }

    const onReady = () => {
      setWgpuReady(true);
    };

    element.on?.("ready", onReady);
    return () => {
      element.off?.("ready", onReady);
    };
  }, [desktopRuntime, wgpuTagAvailable]);

  useEffect(() => {
    if (!desktopRuntime) {
      return;
    }

    const unsubscribers = [
      subscribeDesktopBridgeEvent({
        rpcMessage: "desktopUpdateAvailable",
        ipcChannel: "desktop:updateAvailable",
        listener: () => {
          void refreshNativeState();
        },
      }),
      subscribeDesktopBridgeEvent({
        rpcMessage: "desktopUpdateReady",
        ipcChannel: "desktop:updateReady",
        listener: () => {
          void refreshNativeState();
        },
      }),
      subscribeDesktopBridgeEvent({
        rpcMessage: "webGpuBrowserStatus",
        ipcChannel: "webgpu:browserStatus",
        listener: (payload) => {
          setWebGpuStatus(payload as WebGpuBrowserStatus);
        },
      }),
    ];

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [desktopRuntime, refreshNativeState]);

  const runAction = useCallback(
    async <T,>(
      id: string,
      action: () => Promise<T>,
      successMessage?: string,
    ): Promise<T | null> => {
      setBusyAction(id);
      setActionError(null);
      setActionMessage(null);
      try {
        const result = await action();
        if (successMessage) {
          setActionMessage(successMessage);
        }
        return result;
      } catch (error) {
        setActionError(summarizeError(error));
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  if (!desktopRuntime) {
    return (
      <section className={`${RELEASE_PANEL_CLASSNAME} space-y-3 p-4`}>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-txt">Release Center</h2>
          <p className="max-w-2xl text-xs leading-5 text-muted">
            Update actions and detached release tooling are only available in
            the Electrobun desktop runtime.
          </p>
        </div>
        <div className="rounded-xl border border-border/40 bg-bg-hover/60 px-3 py-3 text-xs leading-5 text-muted">
          This web session is read-only for release management. Open Milady in
          the desktop shell to check for updates, apply downloaded builds, or
          manage the detached release notes window.
        </div>
      </section>
    );
  }

  const detachReleaseCenter = async () => {
    await openDesktopSurfaceWindow("release");
  };

  const refreshReleaseState = async () => {
    await Promise.all([loadUpdateStatus(true), refreshNativeState()]);
  };

  const checkForDesktopUpdate = async () => {
    const snapshot = await invokeDesktopBridgeRequest<DesktopUpdaterSnapshot>({
      rpcMethod: "desktopCheckForUpdates",
      ipcChannel: "desktop:checkForUpdates",
    });
    setNativeUpdater(snapshot);
    if (!releaseNotesUrlDirty && snapshot?.baseUrl) {
      setReleaseNotesUrl(normalizeReleaseNotesUrl(snapshot.baseUrl));
    }
  };

  const applyDesktopUpdate = async () => {
    await invokeDesktopBridgeRequest<void>({
      rpcMethod: "desktopApplyUpdate",
      ipcChannel: "desktop:applyUpdate",
    });
  };

  const _toggleDockIcon = async () => {
    const next = await invokeDesktopBridgeRequest<{ visible: boolean }>({
      rpcMethod: "desktopSetDockIconVisibility",
      ipcChannel: "desktop:setDockIconVisibility",
      params: { visible: !dockVisible },
    });
    setDockVisible(next?.visible ?? dockVisible);
  };

  const openReleaseNotesWindow = async () => {
    const info =
      await invokeDesktopBridgeRequest<DesktopReleaseNotesWindowInfo>({
        rpcMethod: "desktopOpenReleaseNotesWindow",
        ipcChannel: "desktop:openReleaseNotesWindow",
        params: {
          url: releaseNotesUrl,
          title: "Release Notes",
        },
      });
    setReleaseNotesWindow(info);
    const refreshedSession =
      await invokeDesktopBridgeRequest<DesktopSessionSnapshot>({
        rpcMethod: "desktopGetSessionSnapshot",
        ipcChannel: "desktop:getSessionSnapshot",
        params: { partition: RELEASE_NOTES_PARTITION },
      });
    if (refreshedSession) {
      setSessionSnapshots((current) => ({
        ...current,
        [RELEASE_NOTES_PARTITION]: refreshedSession,
      }));
    }
  };

  const _clearSession = async (partition: string) => {
    const snapshot = await invokeDesktopBridgeRequest<DesktopSessionSnapshot>({
      rpcMethod: "desktopClearSessionData",
      ipcChannel: "desktop:clearSessionData",
      params: {
        partition,
        storageTypes: "all",
        clearCookies: true,
      },
    });
    if (snapshot) {
      setSessionSnapshots((current) => ({
        ...current,
        [partition]: snapshot,
      }));
    }
  };

  const _clearCookiesOnly = async (partition: string) => {
    const snapshot = await invokeDesktopBridgeRequest<DesktopSessionSnapshot>({
      rpcMethod: "desktopClearSessionData",
      ipcChannel: "desktop:clearSessionData",
      params: {
        partition,
        storageTypes: ["cookies"],
        clearCookies: true,
      },
    });
    if (snapshot) {
      setSessionSnapshots((current) => ({
        ...current,
        [partition]: snapshot,
      }));
    }
  };

  const _runWgpuAction = (action: () => void, stateMessage: string) => {
    setActionError(null);
    setActionMessage(stateMessage);
    action();
  };

  const appVersion =
    (updateStatus as AppReleaseStatus | null | undefined)?.currentVersion ??
    "—";
  const desktopVersion = nativeUpdater?.currentVersion ?? "—";
  const channel = nativeUpdater?.channel ?? "—";
  const latestVersion =
    (updateStatus as AppReleaseStatus | null | undefined)?.latestVersion ??
    "Current";
  const lastCheckAt = (updateStatus as AppReleaseStatus | null | undefined)
    ?.lastCheckAt;
  const lastChecked = lastCheckAt
    ? new Date(lastCheckAt).toLocaleString()
    : "Not yet";
  const updaterStatus = nativeUpdater?.updateReady
    ? "Update ready"
    : nativeUpdater?.updateAvailable
      ? "Update available"
      : typeof nativeUpdater?.lastStatus === "string"
        ? nativeUpdater.lastStatus
        : "Idle";
  const autoUpdateDisabled =
    nativeUpdater != null && !nativeUpdater.canAutoUpdate;

  return (
    <div className="space-y-4">
      {actionError ? (
        <div
          role="alert"
          className={`${RELEASE_STATUS_MESSAGE_CLASSNAME} border-destructive/40 bg-destructive/10 text-destructive`}
        >
          {actionError}
        </div>
      ) : null}
      {actionMessage ? (
        <div
          role="status"
          className={`${RELEASE_STATUS_MESSAGE_CLASSNAME} border-ok/30 bg-ok/10 text-ok`}
        >
          {actionMessage}
        </div>
      ) : null}

      {/* ── Version info rows ─────────────────────────────────── */}
      <div
        className={`${RELEASE_PANEL_CLASSNAME} grid gap-2 p-4 text-xs sm:grid-cols-2`}
      >
        <div className={RELEASE_KV_ROW_CLASSNAME}>
          <span className="text-muted">App</span>
          <span className="break-all text-right font-semibold text-txt">
            {appVersion}
          </span>
        </div>
        <div className={RELEASE_KV_ROW_CLASSNAME}>
          <span className="text-muted">Desktop</span>
          <span className="break-all text-right font-semibold text-txt">
            {desktopVersion}
          </span>
        </div>
        <div className={RELEASE_KV_ROW_CLASSNAME}>
          <span className="text-muted">Channel</span>
          <span className="break-all text-right font-semibold text-txt">
            {channel}
          </span>
        </div>
        <div className={RELEASE_KV_ROW_CLASSNAME}>
          <span className="text-muted">Latest</span>
          <span className="break-all text-right font-semibold text-txt">
            {latestVersion}
          </span>
        </div>
        <div className={RELEASE_KV_ROW_CLASSNAME}>
          <span className="text-muted">Last checked</span>
          <span className="break-all text-right font-semibold text-txt">
            {lastChecked}
          </span>
        </div>
        <div className={RELEASE_KV_ROW_CLASSNAME}>
          <span className="text-muted">Status</span>
          <span className="break-all text-right font-semibold text-txt">
            {updaterStatus}
          </span>
        </div>
      </div>

      {autoUpdateDisabled && nativeUpdater?.autoUpdateDisabledReason ? (
        <div
          role="status"
          className={`${RELEASE_STATUS_MESSAGE_CLASSNAME} border-warning/40 bg-warning/10 text-warning`}
        >
          {nativeUpdater.autoUpdateDisabledReason}
        </div>
      ) : null}

      {/* ── Actions ───────────────────────────────────────────── */}
      <section className={`${RELEASE_PANEL_CLASSNAME} space-y-3 p-4`}>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-txt">Update Actions</h2>
          <p className="max-w-2xl text-xs leading-5 text-muted">
            Refresh the desktop updater state, download available updates, and
            open the detached release tooling without leaving the app shell.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className={RELEASE_ACTION_BUTTON_CLASSNAME}
            disabled={
              busyAction === "check-updates" ||
              updateLoading ||
              autoUpdateDisabled
            }
            onClick={() =>
              void runAction(
                "check-updates",
                checkForDesktopUpdate,
                "Desktop update check started.",
              )
            }
          >
            Check / Download Update
          </Button>
          {nativeUpdater?.updateReady && (
            <Button
              size="sm"
              className={RELEASE_ACTION_BUTTON_CLASSNAME}
              disabled={busyAction === "apply-update" || autoUpdateDisabled}
              onClick={() =>
                void runAction(
                  "apply-update",
                  applyDesktopUpdate,
                  "Applying downloaded update.",
                )
              }
            >
              Apply Downloaded Update
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className={RELEASE_ACTION_BUTTON_CLASSNAME}
            disabled={busyAction === "refresh" || updateLoading}
            onClick={() =>
              void runAction(
                "refresh",
                refreshReleaseState,
                "Release status refreshed.",
              )
            }
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={RELEASE_ACTION_BUTTON_CLASSNAME}
            disabled={busyAction === "detach-release"}
            onClick={() =>
              void runAction(
                "detach-release",
                detachReleaseCenter,
                "Detached release center opened.",
              )
            }
          >
            Open Detached Release Center
          </Button>
        </div>
      </section>

      {/* ── Release Notes ─────────────────────────────────────── */}
      <section className={`${RELEASE_PANEL_CLASSNAME} space-y-3 p-4`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-txt">
              Release Notes
            </span>
          </div>
          <p className="max-w-2xl text-xs leading-5 text-muted">
            Review the release notes source URL, open it in the desktop
            BrowserView, or reset back to the updater-provided default.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="text"
            className="min-h-10 flex-1 rounded-xl border-border/50 bg-bg/80 text-xs"
            value={releaseNotesUrl}
            onChange={(e) => {
              setReleaseNotesUrlDirty(true);
              setReleaseNotesUrl(e.target.value);
            }}
          />
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button
              size="sm"
              variant="outline"
              className={RELEASE_ACTION_BUTTON_CLASSNAME}
              disabled={busyAction === "open-release-notes"}
              onClick={() =>
                void runAction(
                  "open-release-notes",
                  openReleaseNotesWindow,
                  "Release notes window opened.",
                )
              }
            >
              Open BrowserView Window
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={`${RELEASE_ACTION_BUTTON_CLASSNAME} text-muted-strong`}
              onClick={() =>
                void runAction(
                  "reset-release-url",
                  async () => {
                    setReleaseNotesUrlDirty(false);
                    setReleaseNotesUrl(
                      normalizeReleaseNotesUrl(nativeUpdater?.baseUrl),
                    );
                  },
                  "Release notes URL reset.",
                )
              }
            >
              Reset URL
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

import { useBranding } from "../config/branding";
