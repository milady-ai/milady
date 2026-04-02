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

import { Button, SegmentedControl } from "@miladyai/ui";
import type React from "react";
import { useState } from "react";
import type { Tab } from "../../navigation";
import { useApp } from "../../state";
import { DatabasePageView } from "./DatabasePageView";
import { DesktopWorkspaceSection } from "../settings/DesktopWorkspaceSection";
import { FineTuningView } from "../settings/FineTuningView";
import { LogsPageView } from "./LogsPageView";
import { PluginsPageView } from "./PluginsPageView";
import { RuntimeView } from "./RuntimeView";
import { SkillsView } from "./SkillsView";
import { TrajectoriesView } from "./TrajectoriesView";

type SubTab =
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
  const advancedSubTabItems = tabs.map((subTab) => ({
    value: subTab.id,
    label: t(subTab.labelKey),
    testId: `advanced-subtab-${subTab.id}`,
  }));
  const advancedContentHeader = inModal ? undefined : (
    <SegmentedControl
      value={currentSubTab}
      onValueChange={handleSubTabChange}
      items={advancedSubTabItems}
      buttonClassName="min-h-9 whitespace-nowrap px-3 py-2.5"
      data-testid="advanced-subtab-nav"
      aria-label={t("aria.advancedNavigation")}
    />
  );

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
        className={`${ADVANCED_TAB_BUTTON_RESET_CLASSNAME} inline-flex select-none items-center rounded-xl border transition-all duration-150 ${
          compact ? "px-3 py-2.5" : "min-h-9 whitespace-nowrap px-2.5 py-1.5"
        } ${
          isActive
            ? "border-accent/26 bg-accent/14 text-txt-strong shadow-sm"
            : "border-transparent text-muted-strong hover:bg-card/60 hover:text-txt"
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
        return <PluginsPageView contentHeader={advancedContentHeader} />;
      case "skills":
        return <SkillsView contentHeader={advancedContentHeader} />;
      case "fine-tuning":
        return <FineTuningView contentHeader={advancedContentHeader} />;
      case "trajectories":
        return (
          <TrajectoriesView
            contentHeader={advancedContentHeader}
            selectedTrajectoryId={selectedTrajectoryId}
            onSelectTrajectory={setSelectedTrajectoryId}
          />
        );
      case "runtime":
        return <RuntimeView contentHeader={advancedContentHeader} />;
      case "database":
        return <DatabasePageView contentHeader={advancedContentHeader} />;
      case "desktop":
        return (
          <DesktopWorkspaceSection contentHeader={advancedContentHeader} />
        );
      case "logs":
        return <LogsPageView contentHeader={advancedContentHeader} />;
      default:
        return <PluginsPageView contentHeader={advancedContentHeader} />;
    }
  };

  return (
    <div
      className={
        inModal
          ? "settings-modal-layout"
          : "flex w-full flex-col h-full min-h-0"
      }
    >
      {inModal ? (
        <nav className="settings-icon-sidebar">
          {tabs.map((subTab) => renderSubTabButton(subTab, { compact: true }))}
        </nav>
      ) : null}

      <div
        className={
          inModal
            ? "settings-content-area"
            : "flex w-full min-h-0 flex-1 flex-col"
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
