/**
 * Apps page — single-surface app browser with optional full-screen game mode.
 */

import type React from "react";
import { useEffect } from "react";
import { useApp } from "../state";
import { useNavigation } from "../state/NavigationContext";
import { AppsView } from "./AppsView";
import { GameView } from "./GameView";

export function AppsPageView({ inModal }: { inModal?: boolean } = {}) {
  const { appsSubTab, setAppsSubTab } = useNavigation();
  const { activeGameViewerUrl } = useApp();
  const hasActiveGame =
    typeof activeGameViewerUrl === "string" &&
    activeGameViewerUrl.trim().length > 0;

  useEffect(() => {
    if (appsSubTab === "games" && !hasActiveGame) {
      setAppsSubTab("browse");
    }
  }, [appsSubTab, hasActiveGame, setAppsSubTab]);

  if (appsSubTab === "games" && hasActiveGame) {
    return <GameView />;
  }

  if (inModal) {
    return (
      <div
        className="settings-content-area"
        style={
          {
            "--accent": "var(--section-accent-apps, #10b981)",
            "--surface": "rgba(255, 255, 255, 0.06)",
            "--s-accent": "#10b981",
            "--s-text-txt": "#10b981",
            "--s-accent-glow": "rgba(16, 185, 129, 0.35)",
            "--s-accent-subtle": "rgba(16, 185, 129, 0.12)",
            "--s-grid-line": "rgba(16, 185, 129, 0.02)",
            "--s-glow-edge": "rgba(16, 185, 129, 0.08)",
          } as React.CSSProperties
        }
      >
        <div className="settings-section-pane pt-4">
          <AppsView />
        </div>
      </div>
    );
  }

  return <AppsView />;
}
