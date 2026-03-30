/**
 * Root App component — routing shell.
 */

import { Keyboard } from "@capacitor/keyboard";
import { isIOS, isNative } from "@miladyai/app-core/platform";
import {
  Button,
  DrawerSheet,
  DrawerSheetContent,
  DrawerSheetHeader,
  DrawerSheetTitle,
  ErrorBoundary,
  Z_MODAL,
} from "@miladyai/ui";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AgentStartupDiagnostics } from "./api/client";
import {
  AdvancedPageView,
  AppsPageView,
  AvatarLoader,
  BugReportModal,
  CharacterEditor,
  ChatView,
  CompanionShell,
  CompanionView,
  ConnectionFailedBanner,
  ConnectorsPageView,
  ConversationsSidebar,
  CustomActionEditor,
  CustomActionsPanel,
  GameViewOverlay,
  Header,
  HeartbeatsView,
  InventoryView,
  KnowledgeView,
  OnboardingWizard,
  PairingView,
  SaveCommandModal,
  SettingsView,
  SharedCompanionScene,
  ShellOverlays,
  StartupFailureView,
  StreamView,
  SystemWarningBanner,
} from "./app-shell-components";
import { CompanionHeader } from "./components/companion/CompanionHeader";
import { DeferredSetupChecklist } from "./components/FlaminaGuide";
import { SceneOverlayDataBridge } from "./components/scene-overlay-bridge";
import { TasksEventsPanel } from "./components/TasksEventsPanel";
import { useActivityEvents } from "./hooks/useActivityEvents";
import {
  BugReportProvider,
  useBugReportState,
  useContextMenu,
  useStreamPopoutNavigation,
} from "./hooks";
import type { Tab } from "./navigation";
import { APPS_ENABLED, COMPANION_ENABLED } from "./navigation";
import { useApp } from "./state";

const CHAT_MOBILE_BREAKPOINT_PX = 820;
const CHAT_DESKTOP_COMPOSER_UNDERLAY_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-0 h-[5.75rem]";

function formatStartupElapsed(sec: number): string {
  if (sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function resolveAgentLoaderCopy(
  agentStarting: boolean,
  onboardingLoading: boolean,
  elapsedSec: number,
  startup: AgentStartupDiagnostics | undefined,
): { label: string; progress?: number } {
  const elapsed =
    elapsedSec > 0 ? ` · ${formatStartupElapsed(elapsedSec)} elapsed` : "";
  if (startup?.embeddingPhase === "downloading") {
    const detail = startup.embeddingDetail?.trim();
    const base = `Downloading embedding model (GGUF)${elapsed}`;
    return {
      label: detail
        ? `${base} · ${detail}`
        : `${base} · first run can take several minutes`,
      progress: startup.embeddingProgressPct,
    };
  }
  if (startup?.embeddingPhase === "loading") {
    return {
      label: `Loading embedding model${elapsed}`,
      progress: startup.embeddingProgressPct,
    };
  }
  if (startup?.embeddingPhase === "checking") {
    return { label: `Checking embedding model${elapsed}` };
  }
  if (agentStarting || onboardingLoading) {
    return {
      label: `Starting agent${elapsed} · plugins and local models may take a while`,
    };
  }
  return { label: `Starting systems${elapsed}` };
}

function resolveOnboardingHandoffCopy(
  phase: string,
  error: string | null,
): { detail: string; title: string } {
  switch (phase) {
    case "provisioning":
      return {
        title: "Provisioning your agent",
        detail: "Preparing the runtime before your companion opens.",
      };
    case "starting-backend":
      return {
        title: "Starting the local agent",
        detail:
          "Waking up the embedded backend so companion mode can take over in place.",
      };
    case "saving":
      return {
        title: "Saving your setup",
        detail: "Persisting the onboarding choices for the new agent session.",
      };
    case "restarting":
      return {
        title: "Restarting your agent",
        detail:
          "Hot-swapping the runtime without reloading the companion shell.",
      };
    case "bootstrapping":
      return {
        title: "Starting your first conversation",
        detail:
          "Creating a fresh chat thread and asking the agent to greet you.",
      };
    case "error":
      return {
        title: "Setup hit a problem",
        detail:
          error?.trim() || "The agent could not finish the onboarding handoff.",
      };
    case "fading":
    default:
      return {
        title: "Opening your companion",
        detail: "Handing off from onboarding into companion mode.",
      };
  }
}

/** Check if we're in pop-out mode (StreamView only, no chrome). */
function useIsPopout(): boolean {
  const [popout] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(
      window.location.search || window.location.hash.split("?")[1] || "",
    );
    return params.has("popout") && params.get("popout") !== "false";
  });
  return popout;
}

function TabScrollView({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-shell-scroll-region="true"
      className={`flex-1 min-h-0 min-w-0 w-full overflow-y-auto ${className}`}
    >
      {children}
    </div>
  );
}

function TabContentView({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 min-h-0 min-w-0 w-full overflow-hidden">
      {children}
    </div>
  );
}

function isCharacterTab(tab: Tab): boolean {
  return tab === "character" || tab === "character-select";
}

function ViewRouter({
  characterSceneVisible = false,
}: {
  characterSceneVisible?: boolean;
}) {
  const { tab } = useApp();
  const view = (() => {
    switch (tab) {
      case "chat":
        return <ChatView />;
      case "companion":
        return COMPANION_ENABLED ? <CompanionView /> : <ChatView />;
      case "stream":
        return <StreamView />;
      case "apps":
        // Apps disabled in production builds; fall through to chat
        return APPS_ENABLED ? (
          <TabScrollView>
            <AppsPageView />
          </TabScrollView>
        ) : (
          <ChatView />
        );
      case "character":
      case "character-select":
        return (
          <TabScrollView>
            <CharacterEditor sceneOverlay={characterSceneVisible} />
          </TabScrollView>
        );
      case "wallets":
        return (
          <TabScrollView>
            <InventoryView />
          </TabScrollView>
        );
      case "knowledge":
        return (
          <TabScrollView>
            <KnowledgeView />
          </TabScrollView>
        );
      case "connectors":
        return (
          <TabScrollView>
            <ConnectorsPageView />
          </TabScrollView>
        );
      case "triggers":
        return (
          <TabContentView>
            <HeartbeatsView />
          </TabContentView>
        );
      case "voice":
        return (
          <TabScrollView className="[scrollbar-gutter:stable] [scroll-padding-top:7rem]">
            <SettingsView key="settings-media" initialSection="media" />
          </TabScrollView>
        );
      case "settings":
        return (
          <TabScrollView className="[scrollbar-gutter:stable] [scroll-padding-top:7rem]">
            <SettingsView key="settings-root" />
          </TabScrollView>
        );
      case "advanced":
      case "plugins":
      case "skills":
      case "actions":
      case "fine-tuning":
      case "trajectories":
      case "runtime":
      case "database":
      case "desktop":
      case "logs":
      case "security":
        return (
          <TabContentView>
            <AdvancedPageView />
          </TabContentView>
        );
      default:
        return <ChatView />;
    }
  })();

  return <ErrorBoundary>{view}</ErrorBoundary>;
}

export function App() {
  const {
    onboardingLoading,
    onboardingHandoffError,
    onboardingHandoffPhase,
    startupPhase,
    startupError,
    authRequired,
    onboardingComplete,
    retryStartup,
    tab,
    setTab,
    setState,
    actionNotice,
    uiShellMode,
    switchShellView,
    uiLanguage,
    setUiLanguage,
    uiTheme,
    setUiTheme,
    chatAgentVoiceMuted,
    cancelOnboardingHandoff,
    handleSaveCharacter,
    characterSaving,
    characterSaveSuccess,
    agentStatus,
    unreadConversations,
    activeGameViewerUrl,
    gameOverlayEnabled,
    retryOnboardingHandoff,
    t,
  } = useApp();

  const isPopout = useIsPopout();
  const onboardingHandoffActive =
    onboardingHandoffPhase != null && onboardingHandoffPhase !== "idle";
  const shellMode =
    tab === "character" || tab === "character-select"
      ? "native"
      : (uiShellMode ?? "companion");
  const effectiveTab: Tab =
    shellMode === "companion"
      ? "companion"
      : tab === "companion"
        ? "chat"
        : tab;
  const characterSceneVisible =
    shellMode === "native" &&
    (isCharacterTab(effectiveTab) || isCharacterTab(tab));
  const companionShellVisible = shellMode === "companion";
  // Don't initialize the 3D scene while the system is still booting — this
  // prevents VrmEngine's Three.js setup from blocking the JS thread and
  // delaying WebSocket agent-status updates (which would freeze the loader).
  const companionSceneActive =
    COMPANION_ENABLED &&
    !onboardingLoading &&
    agentStatus?.state !== "starting" &&
    (companionShellVisible || characterSceneVisible);
  const contextMenu = useContextMenu();

  useStreamPopoutNavigation(setTab);

  const [customActionsPanelOpen, setCustomActionsPanelOpen] = useState(false);
  const [customActionsEditorOpen, setCustomActionsEditorOpen] = useState(false);
  const [tasksEventsPanelOpen, setTasksEventsPanelOpen] = useState(false);
  const { events: activityEvents, clearEvents: clearActivityEvents } =
    useActivityEvents();
  const [editingAction, setEditingAction] = useState<
    import("./api").CustomActionDef | null
  >(null);
  const [isChatMobileLayout, setIsChatMobileLayout] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth < CHAT_MOBILE_BREAKPOINT_PX
      : false,
  );
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);

  const isChat = tab === "chat";
  const unreadCount = unreadConversations?.size ?? 0;
  const mobileChatControls = isChatMobileLayout ? (
    <div className="flex items-center gap-2 w-max">
      <Button
        variant="outline"
        size="sm"
        className={`inline-flex items-center gap-2 px-3 py-2 text-[12px] font-semibold transition-all cursor-pointer ${
          mobileConversationsOpen
            ? "border-accent bg-accent-subtle text-txt"
            : "border-border bg-card text-txt hover:border-accent hover:text-txt"
        }`}
        onClick={() => {
          setMobileConversationsOpen(true);
        }}
        aria-label={t("aria.openChatsPanel")}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <title>{t("conversations.chats")}</title>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {t("conversations.chats")}
        {unreadCount > 0 && (
          <span className="inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-accent text-accent-fg text-[10px] font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>
    </div>
  ) : undefined;

  // Keep hook order stable across onboarding/auth state transitions.
  // Otherwise React can throw when onboarding completes and the main shell mounts.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setCustomActionsPanelOpen((v) => !v);
    window.addEventListener("toggle-custom-actions-panel", handler);
    return () =>
      window.removeEventListener("toggle-custom-actions-panel", handler);
  }, []);

  const handleEditorSave = useCallback(() => {
    setCustomActionsEditorOpen(false);
    setEditingAction(null);
  }, []);

  const handleDeferredTaskOpen = useCallback(
    (task: "provider" | "rpc" | "permissions" | "voice") => {
      if (task === "voice") {
        setTab("voice");
        return;
      }
      setTab("settings");
    },
    [setTab],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setIsChatMobileLayout(window.innerWidth < CHAT_MOBILE_BREAKPOINT_PX);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isChatMobileLayout) {
      setMobileConversationsOpen(false);
    }
  }, [isChatMobileLayout]);

  useEffect(() => {
    if (!isChat) {
      setMobileConversationsOpen(false);
    }
  }, [isChat]);

  useEffect(() => {
    if (!isNative || !isIOS) {
      return;
    }

    // Disable the iOS WebView scroll only while the companion shell is active.
    void Keyboard.setScroll({ isDisabled: companionShellVisible }).catch(() => {
      // Ignore bridge failures so web and desktop shells keep working.
    });
  }, [companionShellVisible]);

  useEffect(() => {
    if (!isNative || !isIOS) {
      return;
    }

    return () => {
      void Keyboard.setScroll({ isDisabled: false }).catch(() => {
        // Ignore cleanup failures when the native bridge is unavailable.
      });
    };
  }, []);

  const bugReport = useBugReportState();
  const agentStarting = agentStatus?.state === "starting";

  const showFullScreenLoader =
    onboardingComplete &&
    !onboardingHandoffActive &&
    (onboardingLoading || agentStarting);

  const [startupElapsedSec, setStartupElapsedSec] = useState(0);
  useEffect(() => {
    if (!showFullScreenLoader) {
      setStartupElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    setStartupElapsedSec(0);
    const id = window.setInterval(() => {
      setStartupElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [showFullScreenLoader]);

  useEffect(() => {
    const STARTUP_TIMEOUT_MS = 300_000;
    if ((startupPhase as string) !== "ready" && !startupError) {
      const timer = setTimeout(() => {
        retryStartup();
      }, STARTUP_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [startupPhase, startupError, retryStartup]);

  // Agent startup must not hide onboarding: after reset the runtime often goes
  // to "starting" while we need to show the wizard immediately.
  const blockOnboardingForShell = onboardingLoading;

  const [loaderFadingOut, setLoaderFadingOut] = useState(false);
  const showLoaderRef = useRef(true);
  const [showLoader, setShowLoader] = useState(true);

  // Crossfade state for onboarding -> chat
  const [fadingOutOnboarding, setFadingOutOnboarding] = useState(false);
  const prevOnboardingHandoffActiveRef = useRef(onboardingHandoffActive);
  const prevOnboardingCompleteRef = useRef(onboardingComplete);

  useEffect(() => {
    const enteredHandoff =
      !prevOnboardingHandoffActiveRef.current && onboardingHandoffActive;
    const completedOnboarding =
      !prevOnboardingCompleteRef.current && onboardingComplete;

    if (enteredHandoff || completedOnboarding) {
      setFadingOutOnboarding(true);
      const timer = setTimeout(() => {
        setFadingOutOnboarding(false);
      }, 700);
      prevOnboardingHandoffActiveRef.current = onboardingHandoffActive;
      prevOnboardingCompleteRef.current = onboardingComplete;
      return () => clearTimeout(timer);
    }

    if (!onboardingHandoffActive && !onboardingComplete) {
      setFadingOutOnboarding(false);
    }

    prevOnboardingHandoffActiveRef.current = onboardingHandoffActive;
    prevOnboardingCompleteRef.current = onboardingComplete;
  }, [onboardingComplete, onboardingHandoffActive]);

  useEffect(() => {
    if (showFullScreenLoader) {
      showLoaderRef.current = true;
      setShowLoader(true);
      setLoaderFadingOut(false);
    } else if (showLoaderRef.current) {
      showLoaderRef.current = false;
      setLoaderFadingOut(true);
      const timer = setTimeout(() => {
        setShowLoader(false);
        setLoaderFadingOut(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [showFullScreenLoader]);

  // Pop-out mode — render only StreamView, skip startup gates.
  // Platform init is skipped in main.tsx; AppProvider hydrates WS in background.
  if (isPopout) {
    return (
      <div className="flex flex-col h-screen w-screen font-body text-txt bg-bg overflow-hidden">
        <StreamView />
      </div>
    );
  }

  // After loader hooks (stable hook order); do not return startupError before useState above.
  if (startupError) {
    return (
      <BugReportProvider value={bugReport}>
        <StartupFailureView error={startupError} onRetry={retryStartup} />
        <BugReportModal />
      </BugReportProvider>
    );
  }

  if (authRequired && !blockOnboardingForShell) return <PairingView />;
  const showOnboarding =
    ((!onboardingComplete && !onboardingHandoffActive) ||
      fadingOutOnboarding) &&
    !blockOnboardingForShell;

  // We conditionally skip returning early for onboarding so we can mount the app shell
  // behind it during the crossfade. If we are completely before the fade out, we can
  // still return early to prevent the engine from paying the cost of the main shell.
  if (showOnboarding && !fadingOutOnboarding) {
    return <OnboardingWizard />;
  }

  const shellContent = companionShellVisible ? (
    <CompanionShell tab={effectiveTab} actionNotice={actionNotice} />
  ) : tab === "stream" ? (
    <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
      <Header />
      <main className="flex-1 min-h-0 overflow-hidden">
        <StreamView />
      </main>
    </div>
  ) : isChat ? (
    <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
      <Header
        mobileLeft={mobileChatControls}
        tasksEventsPanelOpen={tasksEventsPanelOpen}
        onToggleTasksPanel={() => setTasksEventsPanelOpen((o) => !o)}
      />
      <div className="flex flex-1 min-h-0 relative">
        {!isChatMobileLayout ? (
          <div
            className={CHAT_DESKTOP_COMPOSER_UNDERLAY_CLASS}
            data-chat-shell-composer-underlay
          />
        ) : null}
        {isChatMobileLayout ? (
          <>
            <main className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden pt-2 px-2">
              <DeferredSetupChecklist
                className="mb-3"
                onOpenTask={handleDeferredTaskOpen}
              />
              <ChatView />
            </main>

            {mobileConversationsOpen && (
              <DrawerSheet
                open={mobileConversationsOpen}
                onOpenChange={setMobileConversationsOpen}
              >
                <DrawerSheetContent
                  aria-describedby={undefined}
                  className="h-[min(calc(100dvh-1rem-var(--safe-area-top,0px)-var(--safe-area-bottom,0px)),46rem)] p-0"
                  showCloseButton={false}
                >
                  <DrawerSheetHeader className="sr-only">
                    <DrawerSheetTitle>
                      {t("conversations.chats")}
                    </DrawerSheetTitle>
                  </DrawerSheetHeader>
                  <ConversationsSidebar
                    mobile
                    onClose={() => setMobileConversationsOpen(false)}
                  />
                </DrawerSheetContent>
              </DrawerSheet>
            )}

            {tasksEventsPanelOpen && (
              <DrawerSheet
                open={tasksEventsPanelOpen}
                onOpenChange={setTasksEventsPanelOpen}
              >
                <DrawerSheetContent
                  aria-describedby={undefined}
                  className="h-[min(calc(100dvh-1rem-var(--safe-area-top,0px)-var(--safe-area-bottom,0px)),46rem)] p-0"
                  showCloseButton={false}
                >
                  <DrawerSheetHeader className="sr-only">
                    <DrawerSheetTitle>
                      {t("taskseventspanel.Title", {
                        defaultValue: "Tasks & Events",
                      })}
                    </DrawerSheetTitle>
                  </DrawerSheetHeader>
                  <TasksEventsPanel
                    open
                    onClose={() => setTasksEventsPanelOpen(false)}
                    events={activityEvents}
                    clearEvents={clearActivityEvents}
                    mobile
                  />
                </DrawerSheetContent>
              </DrawerSheet>
            )}
          </>
        ) : (
          <>
            <ConversationsSidebar />
            <main className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
              <DeferredSetupChecklist
                className="mx-3 mb-3 mt-3 xl:mx-5"
                onOpenTask={handleDeferredTaskOpen}
              />
              <ChatView />
            </main>
            <TasksEventsPanel
              open={tasksEventsPanelOpen}
              onClose={() => setTasksEventsPanelOpen(false)}
              events={activityEvents}
              clearEvents={clearActivityEvents}
            />
          </>
        )}
        <CustomActionsPanel
          open={customActionsPanelOpen}
          onClose={() => setCustomActionsPanelOpen(false)}
          onOpenEditor={(action) => {
            setEditingAction(action ?? null);
            setCustomActionsEditorOpen(true);
          }}
        />
      </div>
    </div>
  ) : characterSceneVisible ? (
    <div className="relative flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-transparent">
      <CompanionHeader
        activeShellView="character"
        onShellViewChange={(view) => switchShellView(view)}
        uiLanguage={uiLanguage}
        setUiLanguage={setUiLanguage}
        uiTheme={uiTheme}
        setUiTheme={setUiTheme}
        t={t}
        showCompanionControls
        chatAgentVoiceMuted={chatAgentVoiceMuted}
        onToggleVoiceMute={() =>
          setState("chatAgentVoiceMuted", !chatAgentVoiceMuted)
        }
      />
      <main className="flex flex-1 min-h-0 min-w-0 overflow-hidden px-3 xl:px-5 pb-4 pt-2 xl:pb-6">
        <ViewRouter characterSceneVisible />
      </main>
    </div>
  ) : (
    <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
      <Header />
      <main className="flex flex-1 min-h-0 min-w-0 overflow-hidden px-3 xl:px-5 py-4 xl:py-6">
        <ViewRouter />
      </main>
    </div>
  );

  const appShell = COMPANION_ENABLED ? (
    <SharedCompanionScene
      active={companionSceneActive}
      interactive={companionShellVisible || characterSceneVisible}
    >
      {shellContent}
    </SharedCompanionScene>
  ) : (
    shellContent
  );

  const onboardingHandoffCopy = resolveOnboardingHandoffCopy(
    onboardingHandoffPhase,
    onboardingHandoffError,
  );

  return (
    <BugReportProvider value={bugReport}>
      {/* Bridge React state into the 3D scene overlay panels */}
      {COMPANION_ENABLED && <SceneOverlayDataBridge />}
      {/*
        If we are in the crossfade phase, mount the shell but cover it with the fading onboarding layer.
      */}
      {appShell}

      {showOnboarding && (
        <div
          className={`fixed inset-0 z-[${Z_MODAL}] transition-opacity duration-700`}
          style={{ opacity: fadingOutOnboarding ? 0 : 1 }}
        >
          <OnboardingWizard />
        </div>
      )}

      {onboardingHandoffActive && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center px-4 pb-6 pt-20"
          data-testid="onboarding-handoff-overlay"
        >
          <div className="pointer-events-auto w-full max-w-lg rounded-[24px] border border-border/50 bg-card/92 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.24)] backdrop-blur-md">
            <div className="flex items-start gap-3">
              {onboardingHandoffPhase === "error" ? (
                <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-danger" />
              ) : (
                <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent animate-pulse" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-txt">
                  {onboardingHandoffCopy.title}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {onboardingHandoffCopy.detail}
                </p>
              </div>
            </div>

            {onboardingHandoffPhase === "error" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  data-testid="onboarding-handoff-retry"
                  onClick={() => {
                    void retryOnboardingHandoff();
                  }}
                >
                  Retry
                </Button>
                <Button
                  variant="outline"
                  data-testid="onboarding-handoff-back"
                  onClick={cancelOnboardingHandoff}
                >
                  Back to setup
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Persistent game overlay — stays visible across all tabs */}
      {activeGameViewerUrl && gameOverlayEnabled && tab !== "apps" && (
        <GameViewOverlay />
      )}
      <ShellOverlays actionNotice={actionNotice} />
      <SaveCommandModal
        open={contextMenu.saveCommandModalOpen}
        text={contextMenu.saveCommandText}
        onSave={contextMenu.confirmSaveCommand}
        onClose={contextMenu.closeSaveCommandModal}
      />
      <CustomActionEditor
        open={customActionsEditorOpen}
        action={editingAction}
        onSave={handleEditorSave}
        onClose={() => {
          setCustomActionsEditorOpen(false);
          setEditingAction(null);
        }}
      />
      <ConnectionFailedBanner />
      <SystemWarningBanner />
      {showLoader && (
        <AvatarLoader
          {...(() => {
            const { label, progress } = resolveAgentLoaderCopy(
              agentStarting,
              onboardingLoading,
              startupElapsedSec,
              agentStatus?.startup,
            );
            return { label, progress };
          })()}
          fullScreen
          fadingOut={loaderFadingOut}
        />
      )}
    </BugReportProvider>
  );
}
