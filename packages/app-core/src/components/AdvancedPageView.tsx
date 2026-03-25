/**
 * AdvancedPageView — container for advanced configuration sub-tabs.
 *
 * Sub-tabs:
 *   - Plugins: Feature/connector plugin management
 *   - Skills: Custom agent skills
 *   - Fine-Tuning: Dataset and model training workflows
 *   - Trajectories: LLM call viewer and analysis
 *   - Runtime: Runtime object inspection
 *   - Databases: Tables/media/vector browser
 *   - Lifo: Browser-native terminal sandbox
 *   - Logs: Runtime log viewer
 */

import {
  DatabasePageView,
  LogsPageView,
  PluginsPageView,
  RuntimeView,
  SkillsView,
} from "@miladyai/app-core/components";
import type { Tab } from "@miladyai/app-core/navigation";
import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import React, { useState } from "react";
import { DesktopWorkspaceSection } from "./DesktopWorkspaceSection";
import { FineTuningView } from "./FineTuningView";
import { LifoSandboxView } from "./LifoSandboxView";
import { TrajectoriesView } from "./TrajectoriesView";
import { TrajectoryDetailView } from "./TrajectoryDetailView";

type SubTab =
  // | "actions"
  | "plugins"
  | "skills"
  | "fine-tuning"
  | "trajectories"
  | "runtime"
  | "database"
  | "desktop"
  | "lifo"
  | "logs";

const SUB_TABS: Array<{ id: SubTab; label: string; description: string }> = [
  // {
  //   id: "actions",
  //   label: "Actions",
  //   description: "Custom agent commands and workflows",
  // },
  { id: "plugins", label: "Plugins", description: "Features and connectors" },
  { id: "skills", label: "Skills", description: "Custom agent skills" },
  // {
  //   id: "fine-tuning",
  //   label: "Fine-Tuning",
  //   description: "Dataset and model training workflows",
  // },
  {
    id: "trajectories",
    label: "Trajectories",
    description: "LLM call history and analysis",
  },
  {
    id: "runtime",
    label: "Runtime",
    description: "Deep runtime object introspection and load order",
  },
  {
    id: "database",
    label: "Database",
    description: "Tables, media, and vector browser",
  },
  {
    id: "desktop",
    label: "Desktop",
    description:
      "Native runtime diagnostics, detached windows, file dialogs, clipboard, and shell controls",
  },
  // {
  //   id: "lifo",
  //   label: "Lifo",
  //   description: "Browser-native shell sandbox and file explorer",
  // },
  { id: "logs", label: "Logs", description: "Runtime and service logs" },
];

const MODAL_SUB_TABS = SUB_TABS.filter(
  (t) => t.id !== "plugins" && t.id !== "skills",
);

const ADVANCED_TAB_BUTTON_RESET_CLASSNAME =
  "select-none [&_*]:select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] focus:outline-none focus-visible:outline-none";
const ADVANCED_SHELL_NAV_SURFACE_CLASSNAME =
  "mb-3 shrink-0 border-b border-border/40 pb-3";
const ADVANCED_SHELL_NAV_SCROLL_CLASSNAME =
  "flex gap-1.5 overflow-x-auto overflow-y-hidden pr-2";
const ADVANCED_TAB_BUTTON_BASE_CLASSNAME = `${ADVANCED_TAB_BUTTON_RESET_CLASSNAME} group inline-flex shrink-0 rounded-xl border text-left transition-all duration-150`;
const ADVANCED_TAB_BUTTON_ACTIVE_CLASSNAME =
  "border-accent/25 bg-accent/10 text-txt shadow-[0_1px_4px_rgba(3,5,10,0.06)] dark:shadow-[0_0_0_1px_rgba(var(--accent),0.12),0_0_12px_rgba(var(--accent),0.12)]";
const ADVANCED_TAB_BUTTON_INACTIVE_CLASSNAME =
  "border-transparent bg-transparent text-muted hover:border-border/40 hover:bg-bg/30 hover:text-txt";

function mapTabToSubTab(tab: Tab): SubTab {
  switch (tab) {
    case "plugins":
      return "plugins";
    case "skills":
      return "skills";
    case "fine-tuning":
      return "fine-tuning";
    case "trajectories":
      return "trajectories";
    case "runtime":
      return "runtime";
    case "database":
      return "database";
    case "desktop":
      return "desktop";
    case "lifo":
      return "lifo";
    case "logs":
      return "logs";
    default:
      return "plugins";
  }
}

export function AdvancedPageView({ inModal }: { inModal?: boolean } = {}) {
  const { tab, setTab } = useApp();
  const [selectedTrajectoryId, setSelectedTrajectoryId] = useState<
    string | null
  >(null);

  const currentSubTab = mapTabToSubTab(tab);
  const tabs = inModal ? MODAL_SUB_TABS : SUB_TABS;

  const handleSubTabChange = (subTab: SubTab) => {
    setSelectedTrajectoryId(null);
    setTab(subTab as Tab);
  };

  const renderSubTabButton = (
    subTab: { id: SubTab; label: string; description: string },
    options?: { compact?: boolean },
  ) => {
    const isActive = currentSubTab === subTab.id;
    const compact = options?.compact ?? false;

    return (
      <Button
        variant="ghost"
        key={subTab.id}
        aria-current={isActive ? "page" : undefined}
        className={`${ADVANCED_TAB_BUTTON_BASE_CLASSNAME} ${
          compact
            ? "items-center px-3 py-2.5"
            : "min-h-9 items-center whitespace-nowrap px-2.5 py-1.5"
        } ${
          isActive
            ? ADVANCED_TAB_BUTTON_ACTIVE_CLASSNAME
            : ADVANCED_TAB_BUTTON_INACTIVE_CLASSNAME
        }`}
        onClick={() => handleSubTabChange(subTab.id)}
        title={subTab.description}
        data-testid={`advanced-subtab-${subTab.id}`}
      >
        <div className="text-left">
          <div
            className={`text-[13px] ${
              isActive ? "font-semibold text-txt" : "font-medium"
            }`}
          >
            {subTab.label}
          </div>
        </div>
      </Button>
    );
  };

  const renderContent = () => {
    switch (currentSubTab) {
      // case "actions":
      //   return <CustomActionsView />;
      case "plugins":
        return <PluginsPageView />;
      case "skills":
        return <SkillsView />;
      case "fine-tuning":
        return <FineTuningView />;
      case "trajectories":
        if (selectedTrajectoryId) {
          return (
            <TrajectoryDetailView
              trajectoryId={selectedTrajectoryId}
              onBack={() => setSelectedTrajectoryId(null)}
            />
          );
        }
        return (
          <TrajectoriesView
            key={selectedTrajectoryId === null ? "list" : "hidden"}
            onSelectTrajectory={setSelectedTrajectoryId}
          />
        );
      case "runtime":
        return <RuntimeView />;
      case "database":
        return <DatabasePageView />;
      case "desktop":
        return <DesktopWorkspaceSection />;
      case "lifo":
        return <LifoSandboxView />;
      case "logs":
        return <LogsPageView />;
      default:
        return <PluginsPageView />;
    }
  };

  return (
    <div
      className={
        inModal ? "settings-modal-layout" : "flex flex-col h-full min-h-0"
      }
    >
      {inModal ? (
        <nav className="settings-icon-sidebar">
          {tabs.map((subTab) => renderSubTabButton(subTab, { compact: true }))}
        </nav>
      ) : (
        <div className={ADVANCED_SHELL_NAV_SURFACE_CLASSNAME}>
          <div
            className={ADVANCED_SHELL_NAV_SCROLL_CLASSNAME}
            aria-label="Advanced navigation"
            data-testid="advanced-subtab-nav"
          >
            {tabs.map((subTab) => renderSubTabButton(subTab))}
          </div>
        </div>
      )}

      <div
        className={
          inModal ? "settings-content-area" : "flex-1 min-h-0 overflow-y-auto"
        }
        style={
          inModal
            ? ({
                "--accent":
                  "var(--section-accent-advanced, var(--accent, #7b8fb5))",
                "--surface": "rgba(255, 255, 255, 0.06)",
                "--s-accent":
                  "var(--section-accent-advanced, var(--accent, #7b8fb5))",
                "--s-text-txt":
                  "var(--section-accent-advanced, var(--accent, #7b8fb5))",
                "--s-accent-glow":
                  "color-mix(in srgb, var(--section-accent-advanced, var(--accent, #7b8fb5)) 35%, transparent)",
                "--s-accent-subtle":
                  "color-mix(in srgb, var(--section-accent-advanced, var(--accent, #7b8fb5)) 12%, transparent)",
                "--s-grid-line":
                  "color-mix(in srgb, var(--section-accent-advanced, var(--accent, #7b8fb5)) 2%, transparent)",
                "--s-glow-edge":
                  "color-mix(in srgb, var(--section-accent-advanced, var(--accent, #7b8fb5)) 8%, transparent)",
              } as React.CSSProperties)
            : undefined
        }
      >
        {inModal ? (
          <div className="settings-section-pane pt-4">{renderContent()}</div>
        ) : (
          renderContent()
        )}
      </div>
    </div>
  );
}
