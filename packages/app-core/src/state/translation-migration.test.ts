/**
 * Regression test: components that only need t() must use useTranslation(),
 * not useApp(). This prevents them from re-rendering on unrelated state
 * changes (chat keystrokes, plugin saves, agent status polls, etc.).
 *
 * If this test fails, the listed file has regressed to using useApp()
 * for translation only. Replace `const { t } = useApp()` with
 * `const { t } = useTranslation()` and import from "../state/TranslationContext".
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

/** Files that have been migrated to useTranslation and must stay migrated. */
const MIGRATED_FILES = [
  "components/ApiKeyConfig.tsx",
  "components/BrowserSurfaceWindow.tsx",
  "components/CloudSourceControls.tsx",
  "components/CustomActionEditor.tsx",
  "components/LifoMonitorPanel.tsx",
  "components/LifoSandboxView.tsx",
  "components/MediaGalleryView.tsx",
  "components/ShortcutsOverlay.tsx",
  "components/SubscriptionStatus.tsx",
  "components/stream/ActivityFeed.tsx",
  "components/stream/ChatContent.tsx",
  "components/stream/ChatTicker.tsx",
  "components/stream/IdleContent.tsx",
  "components/stream/StatusBar.tsx",
  "components/stream/StreamSettings.tsx",
  "components/stream/StreamTerminal.tsx",
  "components/stream/StreamVoiceConfig.tsx",
  "components/stream/overlays/built-in/ActionTickerWidget.tsx",
  "components/stream/overlays/built-in/CustomHtmlWidget.tsx",
  "components/stream/overlays/built-in/PeonHudWidget.tsx",
  // Round 2
  "components/CustomActionsPanel.tsx",
  "components/SaveCommandModal.tsx",
  "components/ConfigSaveFooter.tsx",
  "components/CodingAgentSettingsSection.tsx",
  "components/SecretsView.tsx",
  "components/CustomActionsView.tsx",
  "components/LogsPageView.tsx",
  "components/DatabaseView.tsx",
  "components/VectorBrowserView.tsx",
  "components/TrajectoriesView.tsx",
  "components/apps/AppDetailPane.tsx",
  "components/apps/AppsCatalogGrid.tsx",
  "components/StartupFailureView.tsx",
  "components/AvatarSelector.tsx",
  "components/WhatsAppQrOverlay.tsx",
  "components/RuntimeView.tsx",
  "components/permissions/StreamingPermissions.tsx",
  "components/VoiceConfigView.tsx",
  "components/MessageContent.tsx",
  "components/ConfigPageView.tsx",
  "components/ConnectionFailedBanner.tsx",
  "components/KnowledgeView.tsx",
  "components/ElizaCloudDashboard.tsx",
  "components/MediaSettingsSection.tsx",
  "components/PermissionsSection.tsx",
  // Config
  "config/config-field.tsx",
  "config/config-renderer.tsx",
  "config/ui-renderer.tsx",
  // Round 3 — split t from mixed useApp destructuring
  "components/TrajectoryDetailView.tsx",
  "components/BugReportModal.tsx",
  "components/CompanionSceneHost.tsx",
  "components/DatabasePageView.tsx",
  "components/FineTuningView.tsx",
  "components/ChatMessage.tsx",
  "components/EmotePicker.tsx",
  "components/BscTradePanel.tsx",
  "components/onboarding/PermissionsStep.tsx",
  "components/onboarding/IdentityStep.tsx",
  "components/onboarding/OnboardingStepNav.tsx",
  "components/onboarding/connection/ConnectionProviderGridScreen.tsx",
  "components/onboarding/connection/ConnectionHostingScreen.tsx",
];

describe("useTranslation migration", () => {
  for (const rel of MIGRATED_FILES) {
    it(`${rel} uses useTranslation, not useApp for t()`, () => {
      const filePath = resolve(ROOT, rel);
      const content = readFileSync(filePath, "utf8");

      // Should NOT have `const { t } = useApp()`
      const useAppTOnly = /const\s*\{\s*t\s*\}\s*=\s*useApp\(\)/.test(content);
      expect(
        useAppTOnly,
        `${rel} regressed: replace \`const { t } = useApp()\` with \`const { t } = useTranslation()\``,
      ).toBe(false);

      // Should have useTranslation import
      expect(content).toContain("useTranslation");
    });
  }
});
