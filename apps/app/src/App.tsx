/**
 * Root App component — routing shell.
 */

import { useState, useEffect, useCallback } from "react";
import { useApp } from "./AppContext.js";
import { Header } from "./components/Header.js";
import { Nav } from "./components/Nav.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { EmotePicker } from "./components/EmotePicker.js";
import { SaveCommandModal } from "./components/SaveCommandModal.js";
import { PairingView } from "./components/PairingView.js";
import { OnboardingWizard } from "./components/OnboardingWizard.js";
import { ChatView } from "./components/ChatView.js";
import { ConversationsSidebar } from "./components/ConversationsSidebar.js";
import { AutonomousPanel } from "./components/AutonomousPanel.js";
import { CustomActionsPanel } from "./components/CustomActionsPanel.js";
import { CustomActionEditor } from "./components/CustomActionEditor.js";
import { WorkspaceNotesPanel } from "./components/WorkspaceNotesPanel.js";
import { AppsPageView } from "./components/AppsPageView.js";
import { AdvancedPageView } from "./components/AdvancedPageView.js";
import { CharacterView } from "./components/CharacterView.js";
import { ConnectorsPageView } from "./components/ConnectorsPageView.js";
import { InventoryView } from "./components/InventoryView.js";
import { KnowledgeView } from "./components/KnowledgeView.js";
import { SettingsView } from "./components/SettingsView.js";
import { LoadingScreen } from "./components/LoadingScreen.js";
import { useContextMenu } from "./hooks/useContextMenu.js";
import { TerminalPanel } from "./components/TerminalPanel.js";
import { client } from "./api-client";
import { type Tab } from "./navigation.js";

function ViewRouter() {
  const { tab } = useApp();
  switch (tab) {
    case "chat": return <ChatView />;
    case "apps": return <AppsPageView />;
    case "character": return <CharacterView />;
    case "wallets": return <InventoryView />;
    case "knowledge": return <KnowledgeView />;
    case "connectors": return <ConnectorsPageView />;
    case "advanced":
    case "plugins":
    case "skills":
    case "actions":
    case "triggers":
    case "fine-tuning":
    case "trajectories":
    case "runtime":
    case "database":
    case "logs":
      return <AdvancedPageView />;
    case "voice":
    case "settings": return <SettingsView />;
    default: return <ChatView />;
  }
}

export function App() {
  type DashboardNotesMode = "edit" | "view" | "split";
  type MobilePanel = "none" | "conversations" | "autonomous" | "notes" | "actions";

  const {
    onboardingLoading,
    startupPhase,
    authRequired,
    onboardingComplete,
    tab,
    actionNotice,
    handleStart,
    handleStop,
    handlePauseResume,
    handleRestart,
    setTab,
    setActionNotice,
    openCommandPalette,
    loadPlugins,
    loadSkills,
    loadLogs,
    loadWorkbench,
  } = useApp();
  const contextMenu = useContextMenu();

  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(
    () => typeof window === "undefined" || window.innerWidth < 1024,
  );
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("none");
  const [customActionsPanelOpen, setCustomActionsPanelOpen] = useState(false);
  const [customActionsEditorOpen, setCustomActionsEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<import("./api-client").CustomActionDef | null>(null);
  const [customActionSeedPrompt, setCustomActionSeedPrompt] = useState("");
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [notesPanelMode, setNotesPanelMode] = useState<DashboardNotesMode>("edit");
  const [notesPanelSeedText, setNotesPanelSeedText] = useState("");

  const hideChatMainForMobilePanel = isMobileViewport && mobilePanel !== "none";
  const setMobilePanelVisible = useCallback(
    (panel: MobilePanel) => {
      if (!isMobileViewport) return;
      setMobilePanel((current) => (current === panel ? "none" : panel));
    },
    [isMobileViewport],
  );

  const clearMobilePanel = useCallback(() => {
    if (!isMobileViewport) return;
    setMobilePanel("none");
  }, [isMobileViewport]);

  const openNotesPanel = useCallback((mode: DashboardNotesMode, seedText = "") => {
    setTab("chat");
    setCustomActionsPanelOpen(false);
    setCustomActionsEditorOpen(false);
    setNotesPanelMode(mode);
    setNotesPanelSeedText(seedText.trim());
    setNotesPanelOpen(true);
    if (isMobileViewport) {
      setMobilePanel("notes");
    }
  }, [isMobileViewport, setTab]);

  const openAutonomousPanel = useCallback(() => {
    if (isMobileViewport) {
      setMobilePanelVisible("autonomous");
    }
    setCustomActionsPanelOpen(false);
    setCustomActionsEditorOpen(false);
    setNotesPanelOpen(false);
  }, [isMobileViewport, setMobilePanelVisible]);

  const openConversationsPanel = useCallback(() => {
    if (isMobileViewport) {
      setMobilePanelVisible("conversations");
    }
    setCustomActionsPanelOpen(false);
    setCustomActionsEditorOpen(false);
    setNotesPanelOpen(false);
  }, [isMobileViewport, setMobilePanelVisible]);

  const openActionsPanel = useCallback(() => {
    setNotesPanelOpen(false);
    setCustomActionsEditorOpen(false);
    if (isMobileViewport) {
      setMobilePanel("actions");
    } else {
      setCustomActionsPanelOpen(true);
    }
  }, [isMobileViewport]);

  const closeNotesPanel = useCallback(() => {
    setNotesPanelOpen(false);
    setNotesPanelSeedText("");
    if (isMobileViewport) {
      clearMobilePanel();
    }
  }, [isMobileViewport, clearMobilePanel]);

  const closeActionsPanel = useCallback(() => {
    setCustomActionsPanelOpen(false);
    if (isMobileViewport) {
      clearMobilePanel();
    }
  }, [isMobileViewport, clearMobilePanel]);

  useEffect(() => {
    const handleResize = () => {
      const nextIsMobile = window.innerWidth < 1024;
      setIsMobileViewport(nextIsMobile);
      if (!nextIsMobile) {
        setMobilePanel("none");
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isValidTab = useCallback((value: string | undefined): value is Tab => {
    if (typeof value !== "string") return false;
    return (
      value === "chat" ||
      value === "apps" ||
      value === "character" ||
      value === "wallets" ||
      value === "knowledge" ||
      value === "connectors" ||
      value === "triggers" ||
      value === "plugins" ||
      value === "skills" ||
      value === "actions" ||
      value === "advanced" ||
      value === "fine-tuning" ||
      value === "trajectories" ||
      value === "voice" ||
      value === "runtime" ||
      value === "database" ||
      value === "settings" ||
      value === "logs"
    );
  }, []);

  // Keep hook order stable across onboarding/auth state transitions.
  // Otherwise React can throw when onboarding completes and the main shell mounts.
  useEffect(() => {
    const handler = () => {
      if (isMobileViewport) {
        setMobilePanel((current) => {
          const shouldOpen = current !== "actions";
          setNotesPanelOpen(false);
          setCustomActionsPanelOpen(shouldOpen);
          setCustomActionsEditorOpen(false);
          return shouldOpen ? "actions" : "none";
        });
        return;
      }

      setCustomActionsPanelOpen((v) => !v);
    };
    window.addEventListener("toggle-custom-actions-panel", handler);

    const handleOpenNotes = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: string; seedText?: string }>)?.detail;
      const mode =
        detail?.mode === "view"
          ? "view"
          : detail?.mode === "split"
            ? "split"
            : "edit";
      openNotesPanel(mode, detail?.seedText);
    };

    const handleOpenActionEditor = (event: Event) => {
      const detail = (event as CustomEvent<{ seedPrompt?: string }>)?.detail;
      setNotesPanelOpen(false);
      setCustomActionsPanelOpen(false);
      setCustomActionSeedPrompt(detail?.seedPrompt?.trim() ?? "");
      setEditingAction(null);
      setCustomActionsEditorOpen(true);
      clearMobilePanel();
    };

    const handleAgentControl = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>)?.detail?.action;
      if (action === "start") {
        void handleStart();
      } else if (action === "stop") {
        void handleStop();
      } else if (action === "pause" || action === "resume") {
        void handlePauseResume();
      } else if (action === "restart") {
        void handleRestart();
      }
    };

    const handleOpenTab = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>)?.detail;
      if (!isValidTab(detail?.tab)) return;
      setNotesPanelOpen(false);
      setCustomActionsPanelOpen(false);
      clearMobilePanel();
      setTab(detail.tab);
    };

    const handleAppCommand = (event: Event) => {
      const detail = (event as CustomEvent<{
        command?: string;
        seedText?: string;
        seedPrompt?: string;
      }>)?.detail;
      const command = detail?.command;
      if (!command) return;

      if (command === "open-command-palette") {
        openCommandPalette();
      } else if (command === "open-notes-new") {
        openNotesPanel("edit", "");
      } else if (command === "open-notes-edit") {
        openNotesPanel("edit");
      } else if (command === "open-notes-split") {
        openNotesPanel("split");
      } else if (command === "open-notes-view") {
        openNotesPanel("view");
      } else if (command === "open-notes-with-seed") {
        openNotesPanel("edit", detail?.seedText);
      } else if (command === "open-custom-actions-panel") {
        setTab("chat");
        openActionsPanel();
      } else if (command === "open-custom-action-editor") {
        setTab("chat");
        setNotesPanelOpen(false);
        setCustomActionsPanelOpen(false);
        setCustomActionSeedPrompt("");
        setEditingAction(null);
        setCustomActionsEditorOpen(true);
        clearMobilePanel();
      } else if (command === "open-custom-action-editor-with-prompt") {
        setTab("chat");
        setNotesPanelOpen(false);
        setCustomActionsPanelOpen(false);
        setCustomActionSeedPrompt(detail?.seedPrompt?.trim() ?? "");
        setEditingAction(null);
        setCustomActionsEditorOpen(true);
        clearMobilePanel();
      } else if (command === "agent-start") {
        void handleStart();
      } else if (command === "agent-stop") {
        void handleStop();
      } else if (command === "agent-pause") {
        void handlePauseResume();
      } else if (command === "agent-resume") {
        void handlePauseResume();
      } else if (command === "agent-restart") {
        void handleRestart();
      } else if (command === "refresh-plugins") {
        void loadPlugins();
      } else if (command === "refresh-skills") {
        void loadSkills();
      } else if (command === "refresh-logs") {
        void loadLogs();
      } else if (command === "refresh-workbench") {
        void loadWorkbench();
      } else {
        setActionNotice(`Unknown dashboard command: ${command}`, "error");
      }
    };

    window.addEventListener("milaidy:open-notes-panel", handleOpenNotes);
    window.addEventListener("milaidy:open-custom-action-editor", handleOpenActionEditor);
    window.addEventListener("milaidy:agent-control", handleAgentControl);
    window.addEventListener("milaidy:open-tab", handleOpenTab);
    window.addEventListener("milaidy:app-command", handleAppCommand);

    return () => {
      window.removeEventListener("toggle-custom-actions-panel", handler);
      window.removeEventListener("milaidy:open-notes-panel", handleOpenNotes);
      window.removeEventListener("milaidy:open-custom-action-editor", handleOpenActionEditor);
      window.removeEventListener("milaidy:agent-control", handleAgentControl);
      window.removeEventListener("milaidy:open-tab", handleOpenTab);
      window.removeEventListener("milaidy:app-command", handleAppCommand);
    };
  }, [
    handleStart,
    handleStop,
    handlePauseResume,
    handleRestart,
    openNotesPanel,
    openCommandPalette,
    isValidTab,
    setTab,
    setActionNotice,
    loadPlugins,
    loadSkills,
    loadLogs,
    loadWorkbench,
    clearMobilePanel,
    setNotesPanelOpen,
    openActionsPanel,
    isMobileViewport,
  ]);

  const handleEditorSave = useCallback(() => {
    setCustomActionsEditorOpen(false);
    setEditingAction(null);
    setCustomActionSeedPrompt("");
  }, []);

  const handleOpenCustomActionFromNotes = useCallback((seedPrompt: string) => {
    setNotesPanelOpen(false);
    setCustomActionsPanelOpen(false);
    setTab("chat");
    setCustomActionSeedPrompt(seedPrompt);
    setEditingAction(null);
    setCustomActionsEditorOpen(true);
  }, [setTab]);

  const handleCreateSkillFromNotes = useCallback(async (noteContent: string, noteTitle = "") => {
    const cleaned = noteContent.trim();
    if (!cleaned) {
      setActionNotice("Cannot create a skill from empty notes.", "error");
      return;
    }

    const firstLine = (noteTitle || cleaned.split("\n").find((line) => line.trim().length > 0) || "NOTES_SKILL").trim();
    const baseName = firstLine.replace(/^(#+\s*)?/, "").trim() || "NOTES_SKILL";
    const safeName = baseName
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 48) || `NOTES_SKILL_${Date.now()}`;

    setActionNotice("Creating skill from notes...", "info", 2500);
    try {
      const result = await client.createSkill(safeName, cleaned);
      setActionNotice(`Created skill "${safeName}".`, "success");
      if (result.path) {
        await client.openSkill(result.skill?.id ?? safeName).catch(() => undefined);
      }
    } catch (err) {
      setActionNotice(`Failed to create skill from notes: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
    }
  }, [setActionNotice]);

  if (onboardingLoading) {
    return <LoadingScreen phase={startupPhase} />;
  }

  if (authRequired) return <PairingView />;
  if (!onboardingComplete) return <OnboardingWizard />;

  const isChat = tab === "chat";
  const isAdvancedTab =
    tab === "advanced" ||
    tab === "plugins" ||
    tab === "skills" ||
    tab === "actions" ||
    tab === "triggers" ||
    tab === "fine-tuning" ||
    tab === "trajectories" ||
      tab === "runtime" ||
      tab === "database" ||
      tab === "logs";

  const mobileActionButtonClass = "inline-flex items-center px-2 py-1 text-[11px] border border-border bg-card text-txt rounded-sm transition-colors hover:border-accent hover:text-accent";

  const mobileTopNavLeft = isMobileViewport ? (
    <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
      <button
        type="button"
        onClick={openConversationsPanel}
        className={mobileActionButtonClass}
        aria-label="Open conversations panel"
      >
        Conversations
      </button>
      <button
        type="button"
        onClick={openAutonomousPanel}
        className={mobileActionButtonClass}
        aria-label="Open autonomous status panel"
      >
        Autonomous
      </button>
      <button
        type="button"
        onClick={() => openNotesPanel("edit")}
        className={mobileActionButtonClass}
        aria-label="Open notes panel"
      >
        Notes
      </button>
      <button
        type="button"
        onClick={openActionsPanel}
        className={mobileActionButtonClass}
        aria-label="Open custom actions panel"
      >
        Actions
      </button>
    </div>
  ) : null;

  return (
    <>
      {isChat ? (
        <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
          <Header />
          <Nav mobileLeft={mobileTopNavLeft} />
          <div className="flex flex-1 min-h-0 relative">
            {(!isMobileViewport || mobilePanel === "conversations") && (
              <ConversationsSidebar
                mobile={isMobileViewport && mobilePanel === "conversations"}
                onClose={clearMobilePanel}
              />
            )}
            <main className={`flex flex-col flex-1 min-w-0 overflow-visible pt-3 px-5 ${
              hideChatMainForMobilePanel ? "hidden" : "flex"
            }`}>
              <ChatView />
            </main>
            {(!isMobileViewport || mobilePanel === "autonomous") && (
              <AutonomousPanel
                mobile={isMobileViewport && mobilePanel === "autonomous"}
                onClose={clearMobilePanel}
              />
            )}
            <CustomActionsPanel
              open={isMobileViewport ? mobilePanel === "actions" : customActionsPanelOpen}
              mobile={isMobileViewport}
              onClose={closeActionsPanel}
              onOpenEditor={(action) => {
                setEditingAction(action ?? null);
                setCustomActionsEditorOpen(true);
              }}
            />
            <WorkspaceNotesPanel
              open={notesPanelOpen}
              mode={notesPanelMode}
              seedText={notesPanelSeedText}
              mobile={isMobileViewport}
              onClose={closeNotesPanel}
              onCreateActionFromNote={handleOpenCustomActionFromNotes}
              onCreateSkillFromNote={handleCreateSkillFromNotes}
            />
          </div>
          <TerminalPanel />
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
          <Header />
          <Nav />
          <main className={`flex-1 min-h-0 py-6 px-5 ${isAdvancedTab ? "overflow-hidden" : "overflow-y-auto"}`}>
            <ViewRouter />
          </main>
          <TerminalPanel />
        </div>
      )}
      <CommandPalette />
      <EmotePicker />
      <SaveCommandModal
        open={contextMenu.saveCommandModalOpen}
        text={contextMenu.saveCommandText}
        onSave={contextMenu.confirmSaveCommand}
        onClose={contextMenu.closeSaveCommandModal}
      />
      <CustomActionEditor
        open={customActionsEditorOpen}
        action={editingAction}
        seedPrompt={customActionSeedPrompt}
        onSave={handleEditorSave}
        onClose={() => {
          setCustomActionsEditorOpen(false);
          setEditingAction(null);
          setCustomActionSeedPrompt("");
        }}
      />
      {actionNotice && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2 rounded-lg text-[13px] font-medium z-[10000] text-white ${
            actionNotice.tone === "error" ? "bg-danger" :
            actionNotice.tone === "success" ? "bg-ok" : "bg-accent"
          }`}
        >
          {actionNotice.text}
        </div>
      )}
    </>
  );
}
