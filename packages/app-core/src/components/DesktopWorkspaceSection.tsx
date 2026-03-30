import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Textarea,
} from "@miladyai/ui";
import { Monitor, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { invokeDesktopBridgeRequest, isElectrobunRuntime } from "../bridge";
import { useApp } from "../state";
import { copyTextToClipboard } from "../utils/clipboard";
import {
  DESKTOP_WORKSPACE_SURFACES,
  type DesktopClickAuditItem,
  type DesktopWorkspaceSnapshot,
  formatDesktopWorkspaceSummary,
  loadDesktopWorkspaceSnapshot,
  openDesktopSettingsWindow,
  openDesktopSurfaceWindow,
} from "../utils/desktop-workspace";

export const DESKTOP_WORKSPACE_CLICK_AUDIT: readonly DesktopClickAuditItem[] = [
  {
    id: "desktop-refresh-snapshot",
    entryPoint: "settings:desktop",
    label: "Refresh Diagnostics",
    expectedAction:
      "Reload desktop version, window, display, clipboard, and path diagnostics.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-open-settings-window",
    entryPoint: "settings:desktop",
    label: "Open Desktop Settings Window",
    expectedAction:
      "Open a detached settings window focused on the desktop section.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-show-window",
    entryPoint: "settings:desktop",
    label: "Show Window",
    expectedAction: "Show the main desktop window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-hide-window",
    entryPoint: "settings:desktop",
    label: "Hide Window",
    expectedAction: "Hide the main desktop window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-focus-window",
    entryPoint: "settings:desktop",
    label: "Focus Window",
    expectedAction: "Focus the main desktop window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-minimize-window",
    entryPoint: "settings:desktop",
    label: "Minimize Window",
    expectedAction: "Minimize the main desktop window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-maximize-toggle",
    entryPoint: "settings:desktop",
    label: "Toggle Maximize",
    expectedAction: "Maximize or unmaximize the main desktop window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-notify",
    entryPoint: "settings:desktop",
    label: "Send Test Notification",
    expectedAction: "Send a desktop notification.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-restart-agent",
    entryPoint: "settings:desktop",
    label: "Restart Agent",
    expectedAction: "Restart the desktop agent backend.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-relaunch-app",
    entryPoint: "settings:desktop",
    label: "Relaunch app",
    expectedAction: "Relaunch the desktop shell.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-toggle-auto-launch",
    entryPoint: "settings:desktop",
    label: "Toggle Auto-launch",
    expectedAction: "Enable or disable auto-launch.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-toggle-hidden-launch",
    entryPoint: "settings:desktop",
    label: "Toggle Hidden Start",
    expectedAction:
      "Toggle launching the app hidden when auto-launch is enabled.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-open-file-dialog",
    entryPoint: "settings:desktop",
    label: "Open Files Dialog",
    expectedAction: "Open a native file chooser.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-open-folder-dialog",
    entryPoint: "settings:desktop",
    label: "Open Folder Dialog",
    expectedAction: "Open a native directory chooser.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-save-dialog",
    entryPoint: "settings:desktop",
    label: "Save File Dialog",
    expectedAction: "Open a native save dialog.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-clipboard-read",
    entryPoint: "settings:desktop",
    label: "Read Clipboard",
    expectedAction:
      "Read text, html, rtf, and format metadata from the system clipboard.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-clipboard-copy",
    entryPoint: "settings:desktop",
    label: "Copy Clipboard Draft",
    expectedAction: "Write text to the system clipboard.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-clipboard-clear",
    entryPoint: "settings:desktop",
    label: "Clear Clipboard",
    expectedAction: "Clear the system clipboard.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-open-path",
    entryPoint: "settings:desktop",
    label: "Open Desktop Path",
    expectedAction: "Open a selected filesystem path using the native shell.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-reveal-path",
    entryPoint: "settings:desktop",
    label: "Reveal Desktop Path",
    expectedAction:
      "Reveal a selected filesystem path in the native file manager.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  ...DESKTOP_WORKSPACE_SURFACES.map(
    (surface): DesktopClickAuditItem => ({
      id: `desktop-surface-${surface.id}`,
      entryPoint: "settings:desktop",
      label: surface.label,
      expectedAction: `Open the detached ${surface.id} surface window.`,
      runtimeRequirement: "desktop",
      coverage: "automated",
    }),
  ),
] as const;

const DESKTOP_ACTION_BUTTON_CLASSNAME =
  "min-h-9 justify-start whitespace-normal text-left sm:min-h-10";

function renderPathList(
  paths: string[],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (paths.length === 0) {
    return (
      <span className="text-muted-strong">
        {t("desktopworkspacesection.NoPathSelectedYet")}
      </span>
    );
  }

  return (
    <ul className="space-y-1 text-xs text-txt">
      {paths.map((path) => (
        <li key={path} className="break-all">
          {path}
        </li>
      ))}
    </ul>
  );
}

export function DesktopWorkspaceSection() {
  const desktopRuntime = isElectrobunRuntime();
  const { relaunchDesktop, restartBackend, t } = useApp();
  const [snapshot, setSnapshot] = useState<DesktopWorkspaceSnapshot | null>(
    null,
  );
  const [loading, setLoading] = useState(desktopRuntime);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [clipboardDraft, setClipboardDraft] = useState("");
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [savePaths, setSavePaths] = useState<string[]>([]);
  const getSurfaceLabel = useCallback(
    (surfaceId: (typeof DESKTOP_WORKSPACE_SURFACES)[number]["id"]) =>
      t(`desktopworkspacesection.surface.${surfaceId}.label`),
    [t],
  );

  const refreshSnapshot = useCallback(async () => {
    if (!desktopRuntime) {
      setSnapshot(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setActionError(null);
    const nextSnapshot = await loadDesktopWorkspaceSnapshot();
    setSnapshot(nextSnapshot);
    setClipboardDraft(
      (current) => current || nextSnapshot.clipboard?.text || "",
    );
    setLoading(false);
  }, [desktopRuntime]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const runAction = useCallback(
    async (
      id: string,
      action: () => Promise<void>,
      message?: string,
      refresh = true,
    ) => {
      setBusyAction(id);
      setActionError(null);
      setActionMessage(null);
      try {
        await action();
        if (refresh) {
          await refreshSnapshot();
        }
        if (message) {
          setActionMessage(message);
        }
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : t("desktopworkspacesection.DesktopActionFailed"),
        );
      } finally {
        setBusyAction(null);
      }
    },
    [refreshSnapshot, t],
  );

  const diagnosticsText = useMemo(() => {
    if (!snapshot) {
      return t("desktopworkspacesection.DesktopDiagnosticsUnavailable");
    }

    const displayLines =
      snapshot.displays.length > 0
        ? snapshot.displays.map(
            (display) =>
              `display:${display.id} ${display.bounds.width}x${display.bounds.height} @ ${display.bounds.x},${display.bounds.y}${display.isPrimary ? " primary" : ""}`,
          )
        : ["display:none"];

    return [
      formatDesktopWorkspaceSummary(snapshot),
      snapshot.power
        ? `power:${snapshot.power.onBattery ? "battery" : "ac"} idle=${snapshot.power.idleState} idleTime=${snapshot.power.idleTime}s`
        : "power:unavailable",
      snapshot.primaryDisplay
        ? `primary:${snapshot.primaryDisplay.bounds.width}x${snapshot.primaryDisplay.bounds.height}`
        : "primary:unavailable",
      snapshot.clipboard
        ? `clipboard:${snapshot.clipboard.formats.join(", ") || "plain-text"}`
        : "clipboard:unavailable",
      ...displayLines,
      ...Object.entries(snapshot.paths).map(
        ([name, path]) => `${name}:${path}`,
      ),
    ].join("\n");
  }, [snapshot, t]);

  if (!desktopRuntime) {
    return (
      <Card className="text-sm text-muted">
        <CardContent className="pt-6">
          {t("desktopworkspacesection.DesktopToolsOnlyAvailable")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          variant="outline"
          size="sm"
          className={DESKTOP_ACTION_BUTTON_CLASSNAME}
          onClick={() => void refreshSnapshot()}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          {t("desktopworkspacesection.RefreshDiagnostics")}
        </Button>
        <Button
          variant="default"
          size="sm"
          className={DESKTOP_ACTION_BUTTON_CLASSNAME}
          onClick={() =>
            void runAction(
              "desktop-open-settings-window",
              async () => openDesktopSettingsWindow("desktop"),
              t("desktopworkspacesection.OpenedDetachedDesktopSettingsWindow"),
              false,
            )
          }
          disabled={busyAction === "desktop-open-settings-window"}
        >
          <Monitor className="mr-1 h-3.5 w-3.5" />
          {t("desktopworkspacesection.OpenDesktopSettingsWindow")}
        </Button>
      </div>

      {(actionError || actionMessage) && (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            actionError
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-ok/40 bg-ok/10 text-ok"
          }`}
          role={actionError ? "alert" : "status"}
        >
          {actionError ?? actionMessage}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t("desktopworkspacesection.Diagnostics")}
            </CardTitle>
            <CardDescription>
              {t("desktopworkspacesection.DiagnosticsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto break-all rounded-xl border border-border bg-bg px-3 py-3 text-[11px] leading-5 text-txt">
              {diagnosticsText}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t("desktopworkspacesection.DetachedSurfaces")}
            </CardTitle>
            <CardDescription>
              {t("desktopworkspacesection.DetachedSurfacesDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {DESKTOP_WORKSPACE_SURFACES.map((surface) => (
                <Button
                  key={surface.id}
                  variant="outline"
                  size="sm"
                  className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                  onClick={() =>
                    void runAction(
                      `desktop-surface-${surface.id}`,
                      async () => openDesktopSurfaceWindow(surface.id),
                      t("desktopworkspacesection.SurfaceOpened", {
                        surface: getSurfaceLabel(surface.id),
                      }),
                      false,
                    )
                  }
                  disabled={busyAction === `desktop-surface-${surface.id}`}
                >
                  {getSurfaceLabel(surface.id)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t("desktopworkspacesection.WindowControls")}
            </CardTitle>
            <CardDescription>
              {t("desktopworkspacesection.WindowControlsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction("desktop-show-window", async () => {
                    await invokeDesktopBridgeRequest<void>({
                      rpcMethod: "desktopShowWindow",
                      ipcChannel: "desktop:showWindow",
                    });
                  })
                }
                disabled={busyAction === "desktop-show-window"}
              >
                {t("desktopworkspacesection.ShowWindow")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction("desktop-hide-window", async () => {
                    await invokeDesktopBridgeRequest<void>({
                      rpcMethod: "desktopHideWindow",
                      ipcChannel: "desktop:hideWindow",
                    });
                  })
                }
                disabled={busyAction === "desktop-hide-window"}
              >
                {t("desktopworkspacesection.HideWindow")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction("desktop-focus-window", async () => {
                    await invokeDesktopBridgeRequest<void>({
                      rpcMethod: "desktopFocusWindow",
                      ipcChannel: "desktop:focusWindow",
                    });
                  })
                }
                disabled={busyAction === "desktop-focus-window"}
              >
                {t("desktopworkspacesection.FocusWindow")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction("desktop-minimize-window", async () => {
                    const method = snapshot?.window.minimized
                      ? "desktopUnminimizeWindow"
                      : "desktopMinimizeWindow";
                    const channel = snapshot?.window.minimized
                      ? "desktop:unminimizeWindow"
                      : "desktop:minimizeWindow";
                    await invokeDesktopBridgeRequest<void>({
                      rpcMethod: method,
                      ipcChannel: channel,
                    });
                  })
                }
                disabled={busyAction === "desktop-minimize-window"}
              >
                {snapshot?.window.minimized
                  ? t("desktopworkspacesection.RestoreWindow")
                  : t("desktopworkspacesection.MinimizeWindow")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={`sm:col-span-2 ${DESKTOP_ACTION_BUTTON_CLASSNAME}`}
                onClick={() =>
                  void runAction("desktop-maximize-toggle", async () => {
                    const method = snapshot?.window.maximized
                      ? "desktopUnmaximizeWindow"
                      : "desktopMaximizeWindow";
                    const channel = snapshot?.window.maximized
                      ? "desktop:unmaximizeWindow"
                      : "desktop:maximizeWindow";
                    await invokeDesktopBridgeRequest<void>({
                      rpcMethod: method,
                      ipcChannel: channel,
                    });
                  })
                }
                disabled={busyAction === "desktop-maximize-toggle"}
              >
                {snapshot?.window.maximized
                  ? t("desktopworkspacesection.UnmaximizeWindow")
                  : t("desktopworkspacesection.MaximizeWindow")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t("desktopworkspacesection.Lifecycle")}
            </CardTitle>
            <CardDescription>
              {t("desktopworkspacesection.LifecycleDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction(
                    "desktop-notify",
                    async () => {
                      await invokeDesktopBridgeRequest<{ id: string }>({
                        rpcMethod: "desktopShowNotification",
                        ipcChannel: "desktop:showNotification",
                        params: {
                          title: t("desktopworkspacesection.NotificationTitle"),
                          body: t("desktopworkspacesection.NotificationBody"),
                          urgency: "normal",
                        },
                      });
                    },
                    t("desktopworkspacesection.NotificationSent"),
                    false,
                  )
                }
                disabled={busyAction === "desktop-notify"}
              >
                {t("desktopworkspacesection.SendTestNotification")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction(
                    "desktop-restart-agent",
                    async () => restartBackend(),
                    t("desktopworkspacesection.AgentRestartRequested"),
                  )
                }
                disabled={busyAction === "desktop-restart-agent"}
              >
                {t("desktopworkspacesection.RestartAgent")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction(
                    "desktop-relaunch-app",
                    async () => relaunchDesktop(),
                    t("desktopworkspacesection.DesktopRelaunchRequested"),
                    false,
                  )
                }
                disabled={busyAction === "desktop-relaunch-app"}
              >
                {t("desktopworkspacesection.Relaunch")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction("desktop-toggle-auto-launch", async () => {
                    await invokeDesktopBridgeRequest<void>({
                      rpcMethod: "desktopSetAutoLaunch",
                      ipcChannel: "desktop:setAutoLaunch",
                      params: {
                        enabled: !(snapshot?.autoLaunch?.enabled ?? false),
                        openAsHidden:
                          snapshot?.autoLaunch?.openAsHidden ?? false,
                      },
                    });
                  })
                }
                disabled={busyAction === "desktop-toggle-auto-launch"}
              >
                {snapshot?.autoLaunch?.enabled
                  ? t("desktopworkspacesection.DisableAutoLaunch")
                  : t("desktopworkspacesection.EnableAutoLaunch")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={`sm:col-span-2 ${DESKTOP_ACTION_BUTTON_CLASSNAME}`}
                onClick={() =>
                  void runAction("desktop-toggle-hidden-launch", async () => {
                    await invokeDesktopBridgeRequest<void>({
                      rpcMethod: "desktopSetAutoLaunch",
                      ipcChannel: "desktop:setAutoLaunch",
                      params: {
                        enabled: snapshot?.autoLaunch?.enabled ?? false,
                        openAsHidden: !(
                          snapshot?.autoLaunch?.openAsHidden ?? false
                        ),
                      },
                    });
                  })
                }
                disabled={busyAction === "desktop-toggle-hidden-launch"}
              >
                {snapshot?.autoLaunch?.openAsHidden
                  ? t("desktopworkspacesection.LaunchVisibleOnLogin")
                  : t("desktopworkspacesection.LaunchHiddenOnLogin")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t("desktopworkspacesection.NativeFileDialogs")}
            </CardTitle>
            <CardDescription>
              {t("desktopworkspacesection.NativeFileDialogsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction(
                    "desktop-open-file-dialog",
                    async () => {
                      const result = await invokeDesktopBridgeRequest<{
                        canceled: boolean;
                        filePaths: string[];
                      }>({
                        rpcMethod: "desktopShowOpenDialog",
                        ipcChannel: "desktop:showOpenDialog",
                        params: {
                          title: t("desktopworkspacesection.SelectFiles"),
                          defaultPath: snapshot?.paths.downloads,
                          canChooseFiles: true,
                          allowsMultipleSelection: true,
                        },
                      });
                      setOpenPaths(result?.filePaths ?? []);
                    },
                    t("desktopworkspacesection.FileDialogCompleted"),
                    false,
                  )
                }
                disabled={busyAction === "desktop-open-file-dialog"}
              >
                {t("desktopworkspacesection.OpenFilesDialog")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction(
                    "desktop-open-folder-dialog",
                    async () => {
                      const result = await invokeDesktopBridgeRequest<{
                        canceled: boolean;
                        filePaths: string[];
                      }>({
                        rpcMethod: "desktopShowOpenDialog",
                        ipcChannel: "desktop:showOpenDialog",
                        params: {
                          title: t("desktopworkspacesection.SelectFolder"),
                          defaultPath: snapshot?.paths.home,
                          canChooseDirectory: true,
                        },
                      });
                      setOpenPaths(result?.filePaths ?? []);
                    },
                    t("desktopworkspacesection.FolderDialogCompleted"),
                    false,
                  )
                }
                disabled={busyAction === "desktop-open-folder-dialog"}
              >
                {t("desktopworkspacesection.OpenFolderDialog")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={`sm:col-span-2 ${DESKTOP_ACTION_BUTTON_CLASSNAME}`}
                onClick={() =>
                  void runAction(
                    "desktop-save-dialog",
                    async () => {
                      const result = await invokeDesktopBridgeRequest<{
                        canceled: boolean;
                        filePaths: string[];
                      }>({
                        rpcMethod: "desktopShowSaveDialog",
                        ipcChannel: "desktop:showSaveDialog",
                        params: {
                          title: t("desktopworkspacesection.SaveFile"),
                          defaultPath: snapshot?.paths.documents,
                          allowedFileTypes: "txt,md,json",
                        },
                      });
                      setSavePaths(result?.filePaths ?? []);
                    },
                    t("desktopworkspacesection.SaveDialogCompleted"),
                    false,
                  )
                }
                disabled={busyAction === "desktop-save-dialog"}
              >
                {t("desktopworkspacesection.SaveFileDialog")}
              </Button>
            </div>
            <div className="space-y-2 rounded-xl border border-border bg-bg px-3 py-3 text-xs text-muted">
              <div>
                <div className="mb-1 font-semibold text-txt">
                  {t("desktopworkspacesection.OpenDialogResult")}
                </div>
                {renderPathList(openPaths, t)}
              </div>
              <div>
                <div className="mb-1 font-semibold text-txt">
                  {t("desktopworkspacesection.SaveDialogResult")}
                </div>
                {renderPathList(savePaths, t)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t("desktopworkspacesection.ClipboardAndPaths")}
            </CardTitle>
            <CardDescription>
              {t("desktopworkspacesection.ClipboardAndPathsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={clipboardDraft}
              onChange={(event) => setClipboardDraft(event.target.value)}
              className="min-h-24 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-txt outline-none"
              placeholder={t("desktopworkspacesection.ClipboardDraft")}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction("desktop-clipboard-read", async () => {
                    const result = await invokeDesktopBridgeRequest<{
                      text?: string;
                    }>({
                      rpcMethod: "desktopReadFromClipboard",
                      ipcChannel: "desktop:readFromClipboard",
                    });
                    setClipboardDraft(result?.text ?? "");
                  })
                }
                disabled={busyAction === "desktop-clipboard-read"}
              >
                {t("desktopworkspacesection.ReadClipboard")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction("desktop-clipboard-copy", async () => {
                    await copyTextToClipboard(clipboardDraft);
                  })
                }
                disabled={busyAction === "desktop-clipboard-copy"}
              >
                {t("desktopworkspacesection.CopyDraft")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                onClick={() =>
                  void runAction("desktop-clipboard-clear", async () => {
                    await invokeDesktopBridgeRequest<void>({
                      rpcMethod: "desktopClearClipboard",
                      ipcChannel: "desktop:clearClipboard",
                    });
                    setClipboardDraft("");
                  })
                }
                disabled={busyAction === "desktop-clipboard-clear"}
              >
                {t("desktopworkspacesection.ClearClipboard")}
              </Button>
              {savePaths[0] && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                    onClick={() =>
                      void runAction(
                        "desktop-open-path",
                        async () => {
                          await invokeDesktopBridgeRequest<void>({
                            rpcMethod: "desktopOpenPath",
                            ipcChannel: "desktop:openPath",
                            params: { path: savePaths[0] },
                          });
                        },
                        t("desktopworkspacesection.OpenedSavedPath"),
                        false,
                      )
                    }
                    disabled={busyAction === "desktop-open-path"}
                  >
                    {t("desktopworkspacesection.OpenSavedPath")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={DESKTOP_ACTION_BUTTON_CLASSNAME}
                    onClick={() =>
                      void runAction(
                        "desktop-reveal-path",
                        async () => {
                          await invokeDesktopBridgeRequest<void>({
                            rpcMethod: "desktopShowItemInFolder",
                            ipcChannel: "desktop:showItemInFolder",
                            params: { path: savePaths[0] },
                          });
                        },
                        t("desktopworkspacesection.RevealedSavedPath"),
                        false,
                      )
                    }
                    disabled={busyAction === "desktop-reveal-path"}
                  >
                    {t("desktopworkspacesection.RevealSavedPath")}
                  </Button>
                </>
              )}
            </div>
            <div className="rounded-xl border border-border bg-bg px-3 py-3 text-xs text-muted">
              {snapshot?.clipboard ? (
                <>
                  <div className="font-semibold text-txt">
                    {t("desktopworkspacesection.Formats")}{" "}
                    {snapshot.clipboard.formats.join(", ") ||
                      t("desktopworkspacesection.PlainText")}
                  </div>
                  <div className="mt-1 break-all">
                    {snapshot.clipboard.text ||
                      t("desktopworkspacesection.ClipboardTextUnavailable")}
                  </div>
                </>
              ) : (
                t("desktopworkspacesection.ClipboardDetailsUnavailable")
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
