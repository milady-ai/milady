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
  const [buildInfo, setBuildInfo] = useState<DesktopBuildInfo | null>(null);
  const [dockVisible, setDockVisible] = useState<boolean>(true);
  const [sessionSnapshots, setSessionSnapshots] = useState<
    Record<string, DesktopSessionSnapshot | undefined>
  >({});
  const [webGpuStatus, setWebGpuStatus] = useState<WebGpuBrowserStatus | null>(
    null,
  );
  const [releaseNotesWindow, setReleaseNotesWindow] =
    useState<DesktopReleaseNotesWindowInfo | null>(null);
  const [releaseNotesUrl, setReleaseNotesUrl] = useState(
    defaultReleaseNotesUrl,
  );
  const [releaseNotesUrlDirty, setReleaseNotesUrlDirty] = useState(false);
  const [wgpuTagAvailable, setWgpuTagAvailable] = useState(false);
  const [wgpuReady, setWgpuReady] = useState(false);
  const [wgpuTransparent, setWgpuTransparent] = useState(false);
  const [wgpuPassthrough, setWgpuPassthrough] = useState(false);
  const [wgpuHidden, setWgpuHidden] = useState(false);
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
      <div className="rounded-2xl border border-border bg-bg-accent px-4 py-4 text-sm text-muted">
        Release Center is available in the Electrobun desktop runtime.
      </div>
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

  const toggleDockIcon = async () => {
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

  const clearSession = async (partition: string) => {
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

  const clearCookiesOnly = async (partition: string) => {
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

  const runWgpuAction = (action: () => void, stateMessage: string) => {
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
  const lastChecked = (updateStatus as AppReleaseStatus | null | undefined)
    ?.lastCheckAt
    ? new Date((updateStatus as AppReleaseStatus).lastCheckAt!).toLocaleString()
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
    <div className="space-y-0">
      {actionError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive mb-3">
          {actionError}
        </div>
      ) : null}
      {actionMessage ? (
        <div className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok mb-3">
          {actionMessage}
        </div>
      ) : null}

      {/* ── Version info rows ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 py-3 text-xs">
        <div className="flex justify-between">
          <span className="text-muted">App</span>
          <span className="font-semibold text-txt">{appVersion}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Desktop</span>
          <span className="font-semibold text-txt">{desktopVersion}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Channel</span>
          <span className="font-semibold text-txt">{channel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Latest</span>
          <span className="font-semibold text-txt">{latestVersion}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Last checked</span>
          <span className="font-semibold text-txt">{lastChecked}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Status</span>
          <span className="font-semibold text-txt">{updaterStatus}</span>
        </div>
      </div>

      {autoUpdateDisabled && nativeUpdater?.autoUpdateDisabledReason ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {nativeUpdater.autoUpdateDisabledReason}
        </div>
      ) : null}

      <hr className="border-border/40" />

      {/* ── Actions ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 py-3">
        <Button
          size="sm"
          className="h-8 rounded-lg text-xs"
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
            className="h-8 rounded-lg text-xs"
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
          className="h-8 rounded-lg text-xs"
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
          className="h-8 rounded-lg text-xs"
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

      <hr className="border-border/40" />

      {/* ── Release Notes ─────────────────────────────────────── */}
      <div className="py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-txt">Release Notes</span>
        </div>
        <div className="flex gap-2">
          <Input
            type="text"
            className="h-8 rounded-lg bg-bg text-xs flex-1"
            value={releaseNotesUrl}
            onChange={(e) => {
              setReleaseNotesUrlDirty(true);
              setReleaseNotesUrl(e.target.value);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg text-xs"
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
            className="h-8 rounded-lg text-xs text-muted"
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
    </div>
  );
}
import { useBranding } from "../config/branding";
