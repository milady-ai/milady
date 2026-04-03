/**
 * Root App component — routing shell.
 */

import { Keyboard } from "@capacitor/keyboard";
import { subscribeDesktopBridgeEvent } from "@miladyai/app-core/bridge";
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
import {
  AdvancedPageView,
  AppsPageView,
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
  HeartbeatsDesktopShell,
  HeartbeatsView,
  InventoryView,
  KnowledgeView,
  OnboardingWizard,
  SaveCommandModal,
  SettingsView,
  SharedCompanionScene,
  ShellOverlays,
  StartupShell,
  StreamView,
  SystemWarningBanner,
} from "./app-shell-components";
import { CompanionHeader } from "./components/companion/CompanionHeader";
import { DeferredSetupChecklist } from "./components/cloud/FlaminaGuide";
import { TasksEventsPanel } from "./components/chat/TasksEventsPanel";
import {
  BugReportProvider,
  useBugReportState,
  useContextMenu,
  useStreamPopoutNavigation,
} from "./hooks";
import { useActivityEvents } from "./hooks/useActivityEvents";
import type { Tab } from "./navigation";
import { APPS_ENABLED, COMPANION_ENABLED } from "./navigation";
import { useApp } from "./state";

const CHAT_MOBILE_BREAKPOINT_PX = 820;
const CHAT_DESKTOP_COMPOSER_UNDERLAY_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-0 h-[5.75rem]";

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
          <TabContentView>
            <SettingsView key="settings-media" initialSection="media" />
          </TabContentView>
        );
      case "settings":
        return (
          <TabContentView>
            <SettingsView key="settings-root" />
          </TabContentView>
        );
      case "advanced":
      case "plugins":
      case "skills":
      case "fine-tuning":
      case "trajectories":
      case "runtime":
      case "database":
      case "desktop":
      case "logs":
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
    startupError,
    startupCoordinator,
    onboardingComplete,
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
    handleSaveCharacter,
    characterSaving,
    characterSaveSuccess,
    agentStatus,
    unreadConversations,
    activeGameViewerUrl,
    gameOverlayEnabled,
    t,
  } = useApp();

  const isPopout = useIsPopout();
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
    startupCoordinator.phase === "ready" &&
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
  const [desktopShuttingDown, setDesktopShuttingDown] = useState(false);

  const isChat = tab === "chat";
  const isWallets = tab === "wallets";
  const isConnectors = tab === "connectors";
  const isHeartbeats = tab === "triggers";
  const isKnowledge = tab === "knowledge";
  const isSettingsPage = tab === "settings" || tab === "voice";
  const isAdvancedPage =
    tab === "advanced" ||
    tab === "plugins" ||
    tab === "skills" ||
    tab === "fine-tuning" ||
    tab === "trajectories" ||
    tab === "runtime" ||
    tab === "database" ||
    tab === "desktop" ||
    tab === "logs";
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

  useEffect(() => {
    return subscribeDesktopBridgeEvent({
      rpcMessage: "desktopShutdownStarted",
      ipcChannel: "desktop:shutdownStarted",
      listener: () => {
        setDesktopShuttingDown(true);
      },
    });
  }, []);

  const bugReport = useBugReportState();
  // Loading is handled entirely by StartupShell — no separate loader needed.

  useEffect(() => {
    // Safety-net watchdog: the coordinator has its own timeouts per phase, but
    // this catches any edge case where the coordinator gets stuck in a loading
    // phase. During "starting-runtime" the agent-wait loop has its own sliding
    // deadline (up to 900s for embedding downloads), so we only watch the
    // pre-runtime phases.
    const STARTUP_TIMEOUT_MS = 300_000;
    const coordinatorPolling =
      startupCoordinator.phase === "polling-backend" ||
      startupCoordinator.phase === "restoring-session";
    if (coordinatorPolling && !startupError) {
      const timer = setTimeout(() => {
        startupCoordinator.retry();
      }, STARTUP_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [startupCoordinator.phase, startupError, startupCoordinator.retry]);

  // Agent startup must not hide onboarding: after reset the runtime often goes
  // to "starting" while we need to show the wizard immediately.
  const blockOnboardingForShell = onboardingLoading;

  // Pop-out mode — render only StreamView, skip startup gates.
  // Platform init is skipped in main.tsx; AppProvider hydrates WS in background.
  if (isPopout) {
    return (
      <div className="flex flex-col h-screen w-screen font-body text-txt bg-bg overflow-hidden">
        <StreamView />
      </div>
    );
  }

  // StartupCoordinator gate — the coordinator is the sole startup authority.
  // Non-ready phases are handled by StartupShell (which renders the appropriate
  // view for each coordinator phase: loading, pairing, onboarding, or error).
  if (startupCoordinator.phase !== "ready") {
    return (
      <BugReportProvider value={bugReport}>
        <StartupShell />
        <BugReportModal />
      </BugReportProvider>
    );
  }

  // Coordinator is at "ready" — the app shell renders. No legacy onboarding
  // overlays — the coordinator handled all of that before reaching ready.

  const shellContent = companionShellVisible ? (
    <CompanionShell tab={effectiveTab} actionNotice={actionNotice} />
  ) : tab === "stream" ? (
    <div
      key="stream-shell"
      className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg"
    >
      <Header />
      <main className="flex-1 min-h-0 overflow-hidden">
        <StreamView />
      </main>
    </div>
  ) : isChat ? (
    <div
      key="chat-shell"
      className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg"
    >
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
                    key="chat-sidebar-mobile"
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
            <ConversationsSidebar key="chat-sidebar-desktop" />
            <main className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
              <DeferredSetupChecklist
                className="mx-3 mb-3 mt-3 xl:mx-5"
                onOpenTask={handleDeferredTaskOpen}
              />
              <ChatView key="chat-view-desktop" />
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
  ) : isHeartbeats ? (
    <div
      key="heartbeats-shell"
      className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg"
    >
      <Header />
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <HeartbeatsDesktopShell key="heartbeats-view-desktop" />
      </div>
    </div>
  ) : isConnectors ? (
    <div
      key="connectors-shell"
      className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg"
    >
      <Header />
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <ConnectorsPageView />
      </div>
    </div>
  ) : isKnowledge ? (
    <div
      key="knowledge-shell"
      className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg"
    >
      <Header />
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <KnowledgeView />
      </div>
    </div>
  ) : isSettingsPage ? (
    <div
      key={`settings-shell-${tab}`}
      className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg"
    >
      <Header />
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <SettingsView
          key={tab === "voice" ? "settings-media" : "settings-root"}
          initialSection={tab === "voice" ? "media" : undefined}
        />
      </div>
    </div>
  ) : isWallets ? (
    <div
      key="wallets-shell"
      className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg"
    >
      <Header />
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <InventoryView />
      </div>
    </div>
  ) : isAdvancedPage ? (
    <div
      key={`advanced-shell-${tab}`}
      className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg"
    >
      <Header />
      <div className="flex flex-1 min-h-0 min-w-0">
        <AdvancedPageView />
      </div>
    </div>
  ) : characterSceneVisible ? (
    <div
      key="character-shell"
      className="relative flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-transparent"
    >
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
    <div
      key={`tab-shell-${tab}`}
      className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg"
    >
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

  return (
    <BugReportProvider value={bugReport}>
      {/*
        If we are in the crossfade phase, mount the shell but cover it with the fading onboarding layer.
      */}
      {appShell}

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
      {desktopShuttingDown ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-bg/80 backdrop-blur-sm"
          aria-label="Shutting down"
          aria-live="polite"
        >
          <div className="rounded-2xl border border-border/60 bg-card/95 px-6 py-5 text-center shadow-2xl">
            <div className="text-base font-semibold text-txt">
              Shutting down…
            </div>
            <div className="mt-1 text-sm text-muted">
              Closing services and saving state.
            </div>
          </div>
        </div>
      ) : null}
    </BugReportProvider>
  );
}
