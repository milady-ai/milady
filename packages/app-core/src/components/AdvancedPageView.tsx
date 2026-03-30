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
 *   - Logs: Runtime log viewer
 */

import { Button } from "@miladyai/ui";
import type React from "react";
import { useState } from "react";
import type { Tab } from "../navigation";
import { useApp } from "../state";
import { DatabasePageView } from "./DatabasePageView";
import { DesktopWorkspaceSection } from "./DesktopWorkspaceSection";
import {
  DESKTOP_PAGE_CONTENT_CLASSNAME,
  DESKTOP_SEGMENTED_GROUP_CLASSNAME,
  DESKTOP_SEGMENTED_ITEM_ACTIVE_CLASSNAME,
  DESKTOP_SEGMENTED_ITEM_BASE_CLASSNAME,
  DESKTOP_SEGMENTED_ITEM_INACTIVE_CLASSNAME,
} from "./desktop-surface-primitives";
import { FineTuningView } from "./FineTuningView";
import { LogsPageView } from "./LogsPageView";
import { PluginsPageView } from "./PluginsPageView";
import { RuntimeView } from "./RuntimeView";
import { SkillsView } from "./SkillsView";
import { TrajectoriesView } from "./TrajectoriesView";

type SubTab =
  // | "actions"
  | "plugins"
  | "skills"
  | "fine-tuning"
  | "trajectories"
  | "runtime"
  | "database"
  | "desktop"
  | "logs";

const SUB_TABS: Array<{
  id: SubTab;
  labelKey: string;
  descriptionKey: string;
}> = [
  // {
  //   id: "actions",
  //   labelKey: "advancedpageview.Actions",
  //   descriptionKey: "advancedpageview.ActionsDescription",
  // },
  {
    id: "plugins",
    labelKey: "advancedpageview.Plugins",
    descriptionKey: "advancedpageview.PluginsDescription",
  },
  {
    id: "skills",
    labelKey: "advancedpageview.Skills",
    descriptionKey: "advancedpageview.SkillsDescription",
  },
  // {
  //   id: "fine-tuning",
  //   labelKey: "advancedpageview.FineTuning",
  //   descriptionKey: "advancedpageview.FineTuningDescription",
  // },
  {
    id: "trajectories",
    labelKey: "advancedpageview.Trajectories",
    descriptionKey: "advancedpageview.TrajectoriesDescription",
  },
  {
    id: "runtime",
    labelKey: "advancedpageview.Runtime",
    descriptionKey: "advancedpageview.RuntimeDescription",
  },
  {
    id: "database",
    labelKey: "advancedpageview.Database",
    descriptionKey: "advancedpageview.DatabaseDescription",
  },
  {
    id: "desktop",
    labelKey: "advancedpageview.Desktop",
    descriptionKey: "advancedpageview.DesktopDescription",
  },
  {
    id: "logs",
    labelKey: "advancedpageview.Logs",
    descriptionKey: "advancedpageview.LogsDescription",
  },
];

const MODAL_SUB_TABS = SUB_TABS.filter(
  (t) => t.id !== "plugins" && t.id !== "skills",
);

const ADVANCED_TAB_BUTTON_RESET_CLASSNAME =
  "select-none [&_*]:select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] focus:outline-none focus-visible:outline-none";
const ADVANCED_SHELL_NAV_SURFACE_CLASSNAME = "mb-3 shrink-0";
const ADVANCED_SHELL_NAV_SCROLL_CLASSNAME =
  "flex gap-1.5 overflow-x-auto overflow-y-hidden pr-2";
const ADVANCED_TAB_BUTTON_BASE_CLASSNAME = `${ADVANCED_TAB_BUTTON_RESET_CLASSNAME} ${DESKTOP_SEGMENTED_ITEM_BASE_CLASSNAME} group shrink-0 text-left transition-all duration-150`;
const ADVANCED_TAB_BUTTON_ACTIVE_CLASSNAME =
  DESKTOP_SEGMENTED_ITEM_ACTIVE_CLASSNAME;
const ADVANCED_TAB_BUTTON_INACTIVE_CLASSNAME =
  DESKTOP_SEGMENTED_ITEM_INACTIVE_CLASSNAME;

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
    case "logs":
      return "logs";
    default:
      return "plugins";
  }
}

export function AdvancedPageView({ inModal }: { inModal?: boolean } = {}) {
  const { tab, setTab, t } = useApp();
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
    subTab: { id: SubTab; labelKey: string; descriptionKey: string },
    options?: { compact?: boolean },
  ) => {
    const isActive = currentSubTab === subTab.id;
    const compact = options?.compact ?? false;
    const label = t(subTab.labelKey);
    const description = t(subTab.descriptionKey);

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
        title={description}
        data-testid={`advanced-subtab-${subTab.id}`}
      >
        <div className="text-left">
          <div
            className={`text-[13px] ${
              isActive ? "font-semibold text-txt" : "font-medium"
            }`}
          >
            {label}
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
        return (
          <TrajectoriesView
            selectedTrajectoryId={selectedTrajectoryId}
            onSelectTrajectory={setSelectedTrajectoryId}
          />
        );
      case "runtime":
        return <RuntimeView />;
      case "database":
        return <DatabasePageView />;
      case "desktop":
        return <DesktopWorkspaceSection />;
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
          <nav
            className={`${DESKTOP_SEGMENTED_GROUP_CLASSNAME} ${ADVANCED_SHELL_NAV_SCROLL_CLASSNAME}`}
            aria-label={t("aria.advancedNavigation")}
            data-testid="advanced-subtab-nav"
          >
            {tabs.map((subTab) => renderSubTabButton(subTab))}
          </nav>
        </div>
      )}

      <div
        className={
          inModal ? "settings-content-area" : DESKTOP_PAGE_CONTENT_CLASSNAME
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
