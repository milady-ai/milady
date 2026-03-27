/**
 * Game View — embeds a running app's game client in an iframe.
 *
 * Features:
 * - Full-screen iframe for game client
 * - PostMessage auth for HYPERSCAPE_AUTH / RS_2004SCAPE_AUTH
 * - Split-screen mode with agent logs panel
 * - Connection status indicator
 */

import { Button } from "@miladyai/ui";
import { Check, Copy, Mic, MoreVertical, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client, type ConversationMessage, type LogEntry } from "../api";
import { invokeDesktopBridgeRequest, isElectrobunRuntime } from "../bridge";
import { useBranding } from "../config/branding";
import {
  useDocumentVisibility,
  useIntervalWhenDocumentVisible,
  useRetakeCapture,
  useTimeout,
  useVoiceChat,
} from "../hooks";
import { useApp } from "../state";
import { openExternalUrl } from "../utils";
import type { DesktopClickAuditItem } from "../utils/desktop-workspace";
import { formatTime } from "./format";

const DEFAULT_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";
let gameViewInitTimestamp = 0;
const READY_EVENT_BY_AUTH_TYPE: Record<string, string> = {
  HYPERSCAPE_AUTH: "HYPERSCAPE_READY",
  RS_2004SCAPE_AUTH: "RS_2004SCAPE_READY",
};

function resolvePostMessageTargetOrigin(viewerUrl: string): string {
  if (viewerUrl.startsWith("/")) return window.location.origin;
  const match = viewerUrl.match(/^https?:\/\/[^/?#]+/i);
  return match?.[0] ?? "*";
}

/** Tag badge colors for logs panel. */
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  agent: { bg: "rgba(99, 102, 241, 0.15)", fg: "rgb(99, 102, 241)" },
  game: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  autonomy: { bg: "rgba(245, 158, 11, 0.15)", fg: "rgb(245, 158, 11)" },
  websocket: { bg: "rgba(20, 184, 166, 0.15)", fg: "rgb(20, 184, 166)" },
};

export const DESKTOP_GAME_CLICK_AUDIT: readonly DesktopClickAuditItem[] = [
  {
    id: "game-native-refresh",
    entryPoint: "game",
    label: "Refresh Native Window State",
    expectedAction: "Refresh canvas bounds and GPU window state.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "game-native-focus",
    entryPoint: "game",
    label: "Focus Game Window",
    expectedAction: "Focus the native game canvas window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "game-native-visibility",
    entryPoint: "game",
    label: "Show/Hide Game Window",
    expectedAction: "Show or hide the native game canvas window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "game-native-snapshot",
    entryPoint: "game",
    label: "Snapshot Game Window",
    expectedAction: "Capture a native snapshot of the game canvas window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "game-gpu-window",
    entryPoint: "game",
    label: "Launch GPU Diagnostics",
    expectedAction: "Create or focus a safe GPU diagnostics window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
] as const;

export function DesktopGameWindowControls({
  gameWindowId,
}: {
  gameWindowId: string | null;
}) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boundsLabel, setBoundsLabel] = useState("Bounds unavailable.");
  const [gpuWindowId, setGpuWindowId] = useState<string | null>(null);
  const branding = useBranding();

  const refresh = useCallback(async () => {
    if (!gameWindowId) {
      setBoundsLabel("Waiting for native game window.");
    } else {
      const bounds = await invokeDesktopBridgeRequest<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>({
        rpcMethod: "canvasGetBounds",
        ipcChannel: "canvas:getBounds",
        params: { id: gameWindowId },
      });
      if (bounds) {
        setBoundsLabel(
          `${bounds.width}x${bounds.height} @ ${bounds.x},${bounds.y}`,
        );
      }
    }

    const gpuWindows = await invokeDesktopBridgeRequest<{
      windows: Array<{ id: string }>;
    }>({
      rpcMethod: "gpuWindowList",
      ipcChannel: "gpuWindow:list",
    });
    setGpuWindowId(gpuWindows?.windows[0]?.id ?? null);
  }, [gameWindowId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (
      id: string,
      action: () => Promise<void>,
      successMessage?: string,
      refreshAfter = true,
    ) => {
      setBusyAction(id);
      setError(null);
      setMessage(null);
      try {
        await action();
        if (refreshAfter) {
          await refresh();
        }
        if (successMessage) {
          setMessage(successMessage);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Native game action failed.",
        );
      } finally {
        setBusyAction(null);
      }
    },
    [refresh],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded border border-border px-2 py-1 text-[10px] text-muted">
        {boundsLabel}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shadow-sm hover:border-accent"
        onClick={() =>
          void runAction(
            "game-native-refresh",
            async () => {},
            "Native game state refreshed.",
          )
        }
        disabled={busyAction === "game-native-refresh"}
      >
        Refresh Native State
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shadow-sm hover:border-accent"
        onClick={() =>
          void runAction(
            "game-native-focus",
            async () => {
              if (!gameWindowId) {
                throw new Error("Game window not ready yet.");
              }
              await invokeDesktopBridgeRequest<void>({
                rpcMethod: "canvasFocus",
                ipcChannel: "canvas:focus",
                params: { id: gameWindowId },
              });
            },
            "Focused native game window.",
            false,
          )
        }
        disabled={!gameWindowId || busyAction === "game-native-focus"}
      >
        Focus Window
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shadow-sm hover:border-accent"
        onClick={() =>
          void runAction(
            "game-native-show",
            async () => {
              if (!gameWindowId) {
                throw new Error("Game window not ready yet.");
              }
              await invokeDesktopBridgeRequest<void>({
                rpcMethod: "canvasShow",
                ipcChannel: "canvas:show",
                params: { id: gameWindowId },
              });
            },
            "Shown native game window.",
            false,
          )
        }
        disabled={!gameWindowId || busyAction === "game-native-show"}
      >
        Show Window
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shadow-sm hover:border-accent"
        onClick={() =>
          void runAction(
            "game-native-hide",
            async () => {
              if (!gameWindowId) {
                throw new Error("Game window not ready yet.");
              }
              await invokeDesktopBridgeRequest<void>({
                rpcMethod: "canvasHide",
                ipcChannel: "canvas:hide",
                params: { id: gameWindowId },
              });
            },
            "Hid native game window.",
            false,
          )
        }
        disabled={!gameWindowId || busyAction === "game-native-hide"}
      >
        Hide Window
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shadow-sm hover:border-accent"
        onClick={() =>
          void runAction(
            "game-native-snapshot",
            async () => {
              if (!gameWindowId) {
                throw new Error("Game window not ready yet.");
              }
              const snapshot = await invokeDesktopBridgeRequest<{
                data: string;
              } | null>({
                rpcMethod: "canvasSnapshot",
                ipcChannel: "canvas:snapshot",
                params: { id: gameWindowId, format: "png" },
              });
              if (!snapshot?.data) {
                throw new Error("Snapshot unavailable.");
              }
            },
            "Captured native game snapshot.",
            false,
          )
        }
        disabled={!gameWindowId || busyAction === "game-native-snapshot"}
      >
        Snapshot Window
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shadow-sm hover:border-accent"
        onClick={() =>
          void runAction(
            "game-gpu-window",
            async () => {
              const created = await invokeDesktopBridgeRequest<{ id: string }>({
                rpcMethod: "gpuWindowCreate",
                ipcChannel: "gpuWindow:create",
                params: {
                  id: "gpu-diagnostics",
                  title: `${branding.appName} GPU Diagnostics`,
                  width: 640,
                  height: 360,
                },
              });
              const nextGpuWindowId = created?.id ?? gpuWindowId;
              if (nextGpuWindowId) {
                await invokeDesktopBridgeRequest<void>({
                  rpcMethod: "gpuWindowShow",
                  ipcChannel: "gpuWindow:show",
                  params: { id: nextGpuWindowId },
                });
                await invokeDesktopBridgeRequest<void>({
                  rpcMethod: "gpuWindowGetInfo",
                  ipcChannel: "gpuWindow:getInfo",
                  params: { id: nextGpuWindowId },
                });
                setGpuWindowId(nextGpuWindowId);
              }
            },
            "GPU diagnostics window ready.",
          )
        }
        disabled={busyAction === "game-gpu-window"}
      >
        Launch GPU Diagnostics
      </Button>
      {gpuWindowId && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs shadow-sm hover:border-accent"
            onClick={() =>
              void runAction(
                "game-gpu-show",
                async () => {
                  await invokeDesktopBridgeRequest<void>({
                    rpcMethod: "gpuWindowShow",
                    ipcChannel: "gpuWindow:show",
                    params: { id: gpuWindowId },
                  });
                },
                "GPU diagnostics window shown.",
                false,
              )
            }
            disabled={busyAction === "game-gpu-show"}
          >
            Show GPU Window
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs shadow-sm hover:border-accent"
            onClick={() =>
              void runAction(
                "game-gpu-hide",
                async () => {
                  await invokeDesktopBridgeRequest<void>({
                    rpcMethod: "gpuWindowHide",
                    ipcChannel: "gpuWindow:hide",
                    params: { id: gpuWindowId },
                  });
                },
                "GPU diagnostics window hidden.",
                false,
              )
            }
            disabled={busyAction === "game-gpu-hide"}
          >
            Hide GPU Window
          </Button>
        </>
      )}
      {(message || error) && (
        <span className={`text-[10px] ${error ? "text-danger" : "text-ok"}`}>
          {error ?? message}
        </span>
      )}
    </div>
  );
}

export function GameView() {
  const { setTimeout } = useTimeout();
  const {
    activeGameApp,
    activeGameDisplayName,
    activeGameViewerUrl,
    activeGameSandbox,
    activeGamePostMessageAuth,
    activeGamePostMessagePayload,
    gameOverlayEnabled,
    chatInput,
    chatSending,
    conversationMessages,
    conversations,
    activeConversationId,
    handleChatSend,
    handleSelectConversation,
    handleNewConversation,
    agentStatus,
    copyToClipboard,
    plugins,
    logs,
    loadLogs,
    setState,
    setActionNotice,
    t,
  } = useApp();
  const agentName = agentStatus?.agentName || "Agent";
  const isElectrobun = isElectrobunRuntime();
  const [stopping, setStopping] = useState(false);
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [whisperMsgCount, setWhisperMsgCount] = useState(conversationMessages.length);
  const [whisperVisible, setWhisperVisible] = useState(false);
  const docVisible = useDocumentVisibility();
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [retakeCapture, setRetakeCapture] = useState(false);
  const [gameWindowId, setGameWindowId] = useState<string | null>(null);
  const gameWindowIdRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const authSentRef = useRef(false);
  const viewerSessionRef = useRef<string>("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [showConversations, setShowConversations] = useState(false);

  // Stream iframe frames to retake.tv when capture is active
  useRetakeCapture(iframeRef, retakeCapture);

  const setChatInput = useCallback((v: string) => setState("chatInput", v), [setState]);

  // Voice input — speech-to-text using the same hook as ChatView
  const [voiceAlwaysOn, setVoiceAlwaysOn] = useState(false);
  const voiceAlwaysOnRef = useRef(false);
  const handleChatSendRef = useRef(handleChatSend);
  handleChatSendRef.current = handleChatSend;

  const voiceSilenceTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const voiceStopRef = useRef<((opts?: { submit?: boolean }) => Promise<void>) | null>(null);
  const voiceStartRef = useRef<((mode?: "compose" | "push-to-talk") => Promise<void>) | null>(null);

  const voice = useVoiceChat({
    onTranscript: useCallback((text: string) => {
      setState("chatInput", text);
    }, [setState]),
    onTranscriptPreview: useCallback((text: string) => {
      setState("chatInput", text);
      // In LIVE mode, send after 2s of silence
      if (voiceAlwaysOnRef.current && text.trim()) {
        if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
        voiceSilenceTimerRef.current = window.setTimeout(() => {
          voiceSilenceTimerRef.current = null;
          void voiceStopRef.current?.().then(() => {
            window.setTimeout(() => {
              void handleChatSendRef.current("DM");
              window.setTimeout(() => {
                if (voiceAlwaysOnRef.current) void voiceStartRef.current?.("compose");
              }, 300);
            }, 100);
          });
        }, 2000);
      }
    }, [setState]),
  });

  voiceStopRef.current = voice.stopListening;
  voiceStartRef.current = voice.startListening;

  // Keep ref in sync
  useEffect(() => { voiceAlwaysOnRef.current = voiceAlwaysOn; }, [voiceAlwaysOn]);

  // Create fresh chat on mount — module-level guard prevents strict mode duplicates
  useEffect(() => {
    const now = Date.now();
    if (now - gameViewInitTimestamp < 3000) return;
    gameViewInitTimestamp = now;
    void handleNewConversation();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendGame = useCallback(async () => {
    if (!chatInput.trim()) return;
    await handleChatSend("DM");
    setTimeout(() => void loadLogs(), 1500);
    inputRef.current?.focus();
  }, [chatInput, handleChatSend, loadLogs, setTimeout]); // setTimeout from useTimeout()

  // Show new messages in whisper mode for 15 seconds
  useEffect(() => {
    if (conversationMessages.length <= whisperMsgCount) {
      setWhisperMsgCount(conversationMessages.length);
      return;
    }
    setWhisperMsgCount(conversationMessages.length);
    setWhisperVisible(true);
    const timer = window.setTimeout(() => setWhisperVisible(false), 15000);
    return () => window.clearTimeout(timer);
  }, [conversationMessages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close header menu on Escape
  useEffect(() => {
    if (!showHeaderMenu) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setShowHeaderMenu(false); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [showHeaderMenu]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationMessages.length]);
  const postMessageTargetOrigin = useMemo(
    () => resolvePostMessageTargetOrigin(activeGameViewerUrl),
    [activeGameViewerUrl],
  );
  const viewerSessionKey = useMemo(
    () =>
      `${activeGameViewerUrl}::${JSON.stringify(activeGamePostMessagePayload ?? null)}`,
    [activeGamePostMessagePayload, activeGameViewerUrl],
  );

  // Only show retake capture button when the retake connector is enabled
  const retakeEnabled = useMemo(
    () => plugins.some((p) => p.id === "retake" && p.enabled),
    [plugins],
  );

  // Filter logs relevant to the current game
  const gameLogs = useMemo(() => {
    if (!activeGameApp) return [];
    const appKeyword = activeGameApp.toLowerCase().replace("@elizaos/app-", "");
    return logs.filter((entry) => {
      const message = (entry.message ?? "").toLowerCase();
      const source = (entry.source ?? "").toLowerCase();
      const tags = (entry.tags ?? []).map((t) => t.toLowerCase());
      return (
        message.includes(appKeyword) ||
        source.includes(appKeyword) ||
        tags.some((t) => t.includes(appKeyword)) ||
        tags.includes("game") ||
        tags.includes("autonomy") ||
        source.includes("agent")
      );
    });
  }, [activeGameApp, logs]);

  // Auto-refresh logs when panel is open and tab is visible (catch-up on focus).
  useEffect(() => {
    if (!showLogsPanel || !docVisible) return;
    void loadLogs();
  }, [showLogsPanel, docVisible, loadLogs]);

  useIntervalWhenDocumentVisible(
    () => {
      void loadLogs();
    },
    3000,
    showLogsPanel,
  );

  // Open the game URL in an isolated Electrobun BrowserWindow.
  // Runs whenever the viewer URL or game title changes and we're inside the desktop app.
  useEffect(() => {
    if (!isElectrobun || !activeGameViewerUrl) return;

    let cancelled = false;

    void invokeDesktopBridgeRequest<{ id: string }>({
      rpcMethod: "gameOpenWindow",
      ipcChannel: "game:openWindow",
      params: {
        url: activeGameViewerUrl,
        title: activeGameDisplayName || activeGameApp || "Game",
      },
    })
      .then((result) => {
        if (cancelled) return;
        if (result?.id) {
          gameWindowIdRef.current = result.id;
          setGameWindowId(result.id);
          setConnectionStatus("connected");
        }
      })
      .catch((err) => {
        console.warn("[GameView] game:openWindow failed:", err);
        // Fall through — iframe fallback is still rendered
      });

    return () => {
      cancelled = true;
      // Close the game window when GameView unmounts or the URL changes
      if (gameWindowIdRef.current) {
        void invokeDesktopBridgeRequest({
          rpcMethod: "canvasDestroyWindow",
          ipcChannel: "canvas:destroyWindow",
          params: { id: gameWindowIdRef.current },
        }).catch(() => {});
        gameWindowIdRef.current = null;
        setGameWindowId(null);
      }
    };
  }, [activeGameViewerUrl, activeGameApp, activeGameDisplayName, isElectrobun]);

  // Reset auth handshake state when the active viewer session changes.
  useEffect(() => {
    if (viewerSessionRef.current !== viewerSessionKey) {
      viewerSessionRef.current = viewerSessionKey;
      authSentRef.current = false;
    }
    if (activeGamePostMessageAuth) {
      setConnectionStatus("connecting");
      return;
    }
    // No auth required, assume connected once iframe loads.
    setConnectionStatus("connected");
  }, [activeGamePostMessageAuth, viewerSessionKey]);

  const resetActiveGameState = useCallback(() => {
    setState("activeGameApp", "");
    setState("activeGameDisplayName", "");
    setState("activeGameViewerUrl", "");
    setState("activeGameSandbox", DEFAULT_VIEWER_SANDBOX);
    setState("activeGamePostMessageAuth", false);
    setState("activeGamePostMessagePayload", null);
  }, [setState]);

  useEffect(() => {
    if (!activeGamePostMessageAuth || !activeGamePostMessagePayload) return;
    if (authSentRef.current) return;
    const expectedReadyType =
      READY_EVENT_BY_AUTH_TYPE[activeGamePostMessagePayload.type];
    if (!expectedReadyType) return;

    const onMessage = (event: MessageEvent<{ type?: string }>) => {
      if (authSentRef.current) return;
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) return;
      if (event.data?.type !== expectedReadyType) return;
      if (
        postMessageTargetOrigin !== "*" &&
        event.origin !== postMessageTargetOrigin
      ) {
        return;
      }
      iframeWindow.postMessage(
        activeGamePostMessagePayload,
        postMessageTargetOrigin,
      );
      authSentRef.current = true;
      setConnectionStatus("connected");
      setActionNotice("Viewer auth sent.", "info", 1800);
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [
    activeGamePostMessageAuth,
    activeGamePostMessagePayload,
    postMessageTargetOrigin,
    setActionNotice,
  ]);

  const handleOpenInNewTab = useCallback(async () => {
    try {
      await openExternalUrl(activeGameViewerUrl);
    } catch {
      setActionNotice(
        "Popup blocked. Allow popups and try again.",
        "error",
        3600,
      );
    }
  }, [activeGameViewerUrl, setActionNotice]);

  const handleStop = useCallback(async () => {
    if (!activeGameApp) return;
    setStopping(true);
    try {
      const stopResult = await client.stopApp(activeGameApp);
      resetActiveGameState();
      setState("tab", "apps");
      setActionNotice(
        stopResult.message,
        stopResult.success ? "success" : "info",
        stopResult.needsRestart ? 5000 : 3200,
      );
    } catch (err) {
      setActionNotice(
        `Failed to stop: ${err instanceof Error ? err.message : "error"}`,
        "error",
      );
    } finally {
      setStopping(false);
    }
  }, [activeGameApp, resetActiveGameState, setState, setActionNotice]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopyMessage = useCallback((id: string, text: string) => {
    void copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, [copyToClipboard, setTimeout]);

  if (!activeGameViewerUrl) {
    return (
      <div className="flex items-center justify-center py-10 text-muted italic">
        {t("game.noActiveSession")}{" "}
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            setState("tab", "apps");
            setState("appsSubTab", "browse");
          }}
          className="ml-2 font-bold tracking-wide shadow-sm"
        >
          {t("game.backToApps")}
        </Button>
      </div>
    );
  }

  const renderLogsPanel = () => (
    <div className="absolute right-0 top-0 bottom-0 w-80 z-30 bg-card/95 backdrop-blur-sm border-l border-border flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="font-bold text-xs">{t("game.agentActivity")}</span>
        <span className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] px-2 py-0 border-border bg-card hover:border-accent"
          onClick={() => void loadLogs()}
        >
          {t("common.refresh")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] px-2 py-0 border-border bg-card hover:border-accent"
          onClick={() => setShowLogsPanel(false)}
        >
          {t("common.hide")}
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 text-[11px] font-mono">
        {gameLogs.length === 0 ? (
          <div className="text-center py-4 text-muted italic">
            {t("game.noAgentActivity")}
          </div>
        ) : (
          gameLogs.slice(0, 50).map((entry: LogEntry, idx) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: composite key with index as tiebreaker
              key={`${entry.timestamp}-${idx}`}
              className="py-1 border-b border-border/50 flex flex-col gap-0.5"
            >
              <div className="flex items-center gap-1">
                <span className="text-muted text-[10px]">
                  {formatTime(entry.timestamp, { fallback: "—" })}
                </span>
                <span
                  className={`font-semibold text-[10px] uppercase ${
                    entry.level === "error"
                      ? "text-danger"
                      : entry.level === "warn"
                        ? "text-warn"
                        : "text-muted"
                  }`}
                >
                  {entry.level}
                </span>
                {(entry.tags ?? []).slice(0, 2).map((t: string) => {
                  const c = TAG_COLORS[t];
                  return (
                    <span
                      key={t}
                      className="text-[9px] px-1 py-px rounded"
                      style={{
                        background: c ? c.bg : "var(--bg-muted)",
                        color: c ? c.fg : "var(--muted)",
                      }}
                    >
                      {t}
                    </span>
                  );
                })}
              </div>
              <div className="text-txt break-all">{entry.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderBubble = (msg: ConversationMessage) => (
    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-2 group`}>
      <div className={`max-w-[80%] px-3 py-2 text-sm leading-relaxed relative ${msg.role === "user" ? "text-white/70 italic" : "bg-white/10 backdrop-blur-sm rounded-2xl rounded-bl-sm text-white/90"}`}>
        {msg.text}
        <button
          onClick={() => handleCopyMessage(msg.id, msg.text)}
          className={`absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity ${msg.role === "user" ? "-left-6" : "-right-6"}`}
          aria-label={copiedId === msg.id ? t("common.copied") : t("common.copy")}
        >
          {copiedId === msg.id ? (
            <Check className="w-3 h-3 text-ok" />
          ) : (
            <Copy className="w-3 h-3 text-white/30 hover:text-white/70" />
          )}
        </button>
      </div>
    </div>
  );

  const typingDots = (
    <div className="flex justify-start mb-2">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl rounded-bl-sm px-3 py-2">
        <span className="text-[10px] text-white/50 block mb-1">{agentName}</span>
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-white/50 animate-[bounce_1.2s_ease-in-out_infinite]" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-white/50 animate-[bounce_1.2s_ease-in-out_infinite]" style={{ animationDelay: "200ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-white/50 animate-[bounce_1.2s_ease-in-out_infinite]" style={{ animationDelay: "400ms" }} />
        </div>
      </div>
    </div>
  );

  const connectionDot =
    connectionStatus === "connected"
      ? "bg-emerald-400"
      : connectionStatus === "connecting"
        ? "bg-amber-400 animate-pulse"
        : "bg-red-400";

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-black">
      {/* Header bar — outside game, doesn't overlap */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-card/80 border-b border-border/30 shrink-0">
        <span className={`w-2 h-2 rounded-full ${connectionDot}`} />
        <span className="text-txt text-xs font-medium">
          {activeGameDisplayName || activeGameApp}
        </span>
        <span className="flex-1" />
        <div className="relative">
          <button
            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
            className="flex items-center justify-center w-7 h-7 rounded-md text-muted hover:text-txt transition-colors"
            aria-label={t("common.menu")}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
          {showHeaderMenu && (
            <div
              className="absolute right-0 top-9 w-48 rounded-xl bg-card border border-border py-1 shadow-2xl z-50"
              onMouseLeave={() => setShowHeaderMenu(false)}
            >
              <button className="w-full px-3 py-2 text-left text-xs text-txt hover:bg-bg-hover transition-colors" onClick={() => { setShowLogsPanel(!showLogsPanel); setShowHeaderMenu(false); }}>
                {showLogsPanel ? t("game.hideLogs") : t("game.showLogs")}
              </button>
              {retakeEnabled && (
                <button className="w-full px-3 py-2 text-left text-xs text-txt hover:bg-bg-hover transition-colors" onClick={() => { setRetakeCapture(!retakeCapture); setShowHeaderMenu(false); }}>
                  {retakeCapture ? t("game.stopCapture") : t("game.retakeCapture")}
                </button>
              )}
              <button className="w-full px-3 py-2 text-left text-xs text-txt hover:bg-bg-hover transition-colors" onClick={() => { setState("gameOverlayEnabled", !gameOverlayEnabled); setShowHeaderMenu(false); }}>
                {gameOverlayEnabled ? t("game.unpinOverlay") : t("game.keepOnTop")}
              </button>
              <button className="w-full px-3 py-2 text-left text-xs text-txt hover:bg-bg-hover transition-colors" onClick={() => { void handleOpenInNewTab(); setShowHeaderMenu(false); }}>
                {t("game.openInNewTab")}
              </button>
              <div className="border-t border-border my-1" />
              <button className="w-full px-3 py-2 text-left text-xs text-danger hover:bg-bg-hover transition-colors" disabled={stopping} onClick={() => { void handleStop(); setShowHeaderMenu(false); }}>
                {stopping ? t("game.stopping") : t("game.stop")}
              </button>
              <button className="w-full px-3 py-2 text-left text-xs text-txt hover:bg-bg-hover transition-colors" onClick={() => { setState("tab", "apps"); setState("appsSubTab", "browse"); }}>
                {t("game.backToApps")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Game area */}
      <div className="relative flex-1 min-h-0">
      {/* Game iframe — fills entire view */}
      {isElectrobun ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg text-muted gap-3">
          {gameWindowId ? (
            <>
              <span className="text-sm font-semibold text-txt">
                {activeGameDisplayName || activeGameApp}
              </span>
              <span className="text-xs text-muted">
                {t("game.openInNativeWindow")}
              </span>
            </>
          ) : (
            <span className="text-xs italic">{t("game.launching")}</span>
          )}
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={activeGameViewerUrl}
          sandbox={activeGameSandbox}
          className="absolute inset-0 w-full h-full border-none"
          title={activeGameDisplayName || "Game"}
        />
      )}

      {/* Chat overlay */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none flex flex-col items-center pb-4 px-4">
        {/* Conversation picker */}
        {showConversations && (
          <div className="w-full max-w-lg pointer-events-auto mb-3 rounded-2xl bg-black/20 backdrop-blur-sm border border-white/5 max-h-48 overflow-y-auto p-3 scrollbar-hide">
            <button
              onClick={() => { void handleNewConversation(); setShowConversations(false); setChatExpanded(true); }}
              className="w-full px-3 py-2 text-left text-xs text-white/80 hover:bg-white/10 transition-colors border-b border-white/5 font-medium"
            >
              {t("common.newChat")}
            </button>
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => { void handleSelectConversation(conv.id); setShowConversations(false); setChatExpanded(true); }}
                className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 ${conv.id === activeConversationId ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white/90"}`}
              >
                <span className="truncate flex-1">{conv.title || conv.id.slice(0, 8)}</span>
                <span className="text-[10px] text-white/30 shrink-0">{new Date(conv.updatedAt ?? conv.createdAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        )}

        {/* Controls */}
        {conversationMessages.length > 0 && (
          <div className="flex items-center gap-3 py-1.5 px-4 pointer-events-auto mb-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
            <button onClick={() => setChatExpanded((p) => !p)} className="text-[11px] text-white/50 hover:text-white/80 transition-colors">
              {chatExpanded ? t("common.hide") : `${conversationMessages.length} ${conversationMessages.length === 1 ? "message" : "messages"}`}
            </button>
            <button onClick={() => setShowConversations((p) => !p)} className="text-[11px] text-white/50 hover:text-white/80 transition-colors">
              {showConversations ? t("common.close") : t("common.chats")}
            </button>
          </div>
        )}

        {/* Expanded — full conversation */}
        {chatExpanded && conversationMessages.length > 0 && (
          <div className="w-full max-w-lg pointer-events-auto mb-3 overflow-y-auto overflow-x-hidden max-h-72 rounded-2xl bg-black/20 backdrop-blur-sm border border-white/5 p-3" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(240,178,50,0.3) transparent" }}>
            {conversationMessages.filter((m) => m.text.trim()).map(renderBubble)}
            {chatSending && typingDots}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Whisper mode — recent messages fade in/out */}
        {!chatExpanded && whisperVisible && conversationMessages.length > 0 && (
          <div className="w-full max-w-lg flex flex-col gap-2 mb-3 transition-opacity duration-1000" style={{ opacity: whisperVisible ? 1 : 0 }}>
            {conversationMessages.slice(-4).filter((m) => m.text.trim()).map(renderBubble)}
          </div>
        )}

        {/* Typing indicator when collapsed */}
        {chatSending && !chatExpanded && (
          <div className="w-full max-w-lg mb-3">{typingDots}</div>
        )}

        {/* Input bar */}
        <div className="w-full max-w-lg pointer-events-auto">
          <div className="flex items-center gap-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 shadow-lg">
            <input
              ref={inputRef}
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSendGame(); } }}
              placeholder={t("game.chatPlaceholder")}
              className="flex-1 bg-transparent border-none outline-none text-white/90 text-sm placeholder:text-white/30"
              autoFocus
            />
            {voice.supported && (
              <>
                <button
                  onClick={() => {
                    if (voiceAlwaysOn) {
                      setVoiceAlwaysOn(false);
                      if (voice.isListening) void voice.stopListening();
                    } else if (voice.isListening) {
                      void voice.stopListening();
                    } else {
                      void voice.startListening("compose");
                    }
                  }}
                  onPointerDown={(e) => { if (!voice.isListening && !voiceAlwaysOn && e.button === 0) { e.preventDefault(); void voice.startListening("push-to-talk"); } }}
                  onPointerUp={() => {
                    if (voice.captureMode === "push-to-talk") {
                      void voice.stopListening({ submit: true }).then(() => {
                        window.setTimeout(() => { void handleSendGame(); }, 100);
                      });
                    }
                  }}
                  onPointerLeave={() => {
                    if (voice.captureMode === "push-to-talk") {
                      void voice.stopListening({ submit: true }).then(() => {
                        window.setTimeout(() => { void handleSendGame(); }, 100);
                      });
                    }
                  }}
                  className={`transition-colors ${voice.isListening ? "text-red-400 hover:text-red-300" : "text-white/40 hover:text-white/80"}`}
                  aria-label={voice.isListening ? t("chat.listening") : t("game.chatPlaceholder")}
                >
                  <Mic className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    const next = !voiceAlwaysOn;
                    setVoiceAlwaysOn(next);
                    if (next && !voice.isListening) void voice.startListening("compose");
                    if (!next && voice.isListening) void voice.stopListening();
                  }}
                  className={`text-[9px] font-bold px-1 rounded transition-colors ${voiceAlwaysOn ? "text-red-400 bg-red-400/20" : "text-white/30 hover:text-white/60"}`}
                  title={t("game.liveVoiceMode")}
                >
                  LIVE
                </button>
              </>
            )}
            <button
              onClick={() => void handleSendGame()}
              disabled={!chatInput.trim()}
              className="text-white/40 hover:text-white/80 transition-colors disabled:opacity-30"
              aria-label={t("common.send")}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Logs panel */}
      {showLogsPanel && renderLogsPanel()}

      {/* Desktop controls */}
      {isElectrobun && gameWindowId && (
        <div className="absolute top-12 right-4 z-20">
          <DesktopGameWindowControls gameWindowId={gameWindowId} />
        </div>
      )}
      </div>
    </div>
  );
}
