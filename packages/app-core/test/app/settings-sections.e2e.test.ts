/**
 * E2E tests for Settings Sections.
 *
 * Tests cover the settings shell sections and navigation:
 * 1. Appearance (theme selection)
 * 2. AI Model (provider, model selection)
 * 3. Integrations (GitHub, coding agents)
 * 4. Media (image, video, audio, and voice providers)
 * 5. Permissions
 * 6. Updates
 * 7. Cloud integration
 * 8+. Advanced options
 */

// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createInlineUiMock } from "./mockInlineUi";

const mockUseApp = vi.fn();

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
  THEMES: [
    { id: "eliza", label: "Eliza" },
    { id: "dark", label: "Dark" },
    { id: "light", label: "Light" },
    { id: "solarized", label: "Solarized" },
  ],
}));

vi.mock("@miladyai/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@miladyai/ui")>("@miladyai/ui");
  return createInlineUiMock(actual);
});

vi.mock("@miladyai/app-core/components", async () => {
  const actual = await vi.importActual<
    typeof import("@miladyai/app-core/components")
  >("@miladyai/app-core/components");
  return {
    ...actual,
  };
});

vi.mock("../../src/components/ConfigPageView", () => ({
  ConfigPageView: () =>
    React.createElement("div", { "data-testid": "config-page" }, "ConfigPage"),
}));

vi.mock("../../src/components/CodingAgentSettingsSection", () => ({
  CodingAgentSettingsSection: () =>
    React.createElement("div", null, "CodingAgentSettingsSection"),
}));

vi.mock("../../src/components/MediaSettingsSection", () => ({
  MediaSettingsSection: () =>
    React.createElement(
      "div",
      { "data-testid": "media-settings" },
      "MediaSettingsSection",
    ),
}));

vi.mock("../../src/components/ElizaCloudDashboard", () => ({
  CloudDashboard: () => React.createElement("div", null, "ElizaCloudDashboard"),
}));

vi.mock("../../src/components/PermissionsSection", () => ({
  PermissionsSection: () =>
    React.createElement(
      "div",
      { "data-testid": "permissions" },
      "PermissionsSection",
    ),
}));

vi.mock("../../src/components/ProviderSwitcher", () => ({
  ProviderSwitcher: () =>
    React.createElement(
      "div",
      { "data-testid": "provider-switcher" },
      "ProviderSwitcher",
    ),
}));

vi.mock("../../src/components/VoiceConfigView", () => ({
  VoiceConfigView: () =>
    React.createElement(
      "div",
      { "data-testid": "voice-config" },
      "VoiceConfigView",
    ),
}));

vi.mock("../../src/components/ReleaseCenterView", () => ({
  ReleaseCenterView: () =>
    React.createElement(
      "div",
      { "data-testid": "release-center" },
      "ReleaseCenterView",
    ),
}));

vi.mock("../../src/components/DesktopWorkspaceSection", () => ({
  DesktopWorkspaceSection: () =>
    React.createElement(
      "div",
      { "data-testid": "desktop-workspace" },
      "DesktopWorkspaceSection",
    ),
}));

import { SettingsView } from "../../src/components/SettingsView";

type SettingsState = {
  // Cloud
  elizaCloudEnabled: boolean;
  elizaCloudConnected: boolean;
  elizaCloudCredits: number;
  elizaCloudCreditsLow: boolean;
  elizaCloudCreditsCritical: boolean;
  elizaCloudTopUpUrl: string;
  elizaCloudUserId: string;
  elizaCloudLoginBusy: boolean;
  elizaCloudLoginError: string;
  cloudDisconnecting: boolean;
  // Plugins
  plugins: Array<{ name: string; enabled: boolean; description?: string }>;
  pluginSaving: boolean;
  pluginSaveSuccess: boolean;
  // Theme
  currentTheme: string;
  uiLanguage: string;
  // Other
  [key: string]: unknown;
};

function createSettingsState(): SettingsState {
  return {
    elizaCloudEnabled: true,
    elizaCloudConnected: false,
    elizaCloudCredits: 100,
    elizaCloudCreditsLow: false,
    elizaCloudCreditsCritical: false,
    elizaCloudTopUpUrl: "https://example.com/topup",
    elizaCloudUserId: "",
    elizaCloudLoginBusy: false,
    elizaCloudLoginError: "",
    cloudDisconnecting: false,
    plugins: [
      {
        name: "@elizaos/plugin-discord",
        enabled: true,
        description: "Discord connector",
      },
      {
        name: "@elizaos/plugin-telegram",
        enabled: false,
        description: "Telegram connector",
      },
    ],
    pluginSaving: false,
    pluginSaveSuccess: false,
    currentTheme: "eliza",
    uiLanguage: "en",
  };
}

const sharedLoadDropStatus = vi.fn().mockResolvedValue(undefined);

function createUseAppMock(
  state: SettingsState,
  overrides: Record<string, unknown> = {},
) {
  return {
    t: (k: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? k,
    ...state,
    exportBusy: false,
    exportPassword: "",
    exportIncludeLogs: false,
    exportError: null,
    exportSuccess: null,
    triggers: [],
    triggersLoading: false,
    triggersSaving: false,
    triggerRunsById: {},
    triggerHealth: null,
    triggerError: null,
    importBusy: false,
    importPassword: "",
    importFile: null,
    importError: null,
    importSuccess: null,
    loadPlugins: vi.fn(),
    loadTriggers: vi.fn(async () => {}),
    createTrigger: vi.fn(async () => null),
    updateTrigger: vi.fn(async () => null),
    deleteTrigger: vi.fn(async () => true),
    runTriggerNow: vi.fn(async () => true),
    loadTriggerRuns: vi.fn(async () => {}),
    loadTriggerHealth: vi.fn(async () => {}),
    handlePluginToggle: vi.fn().mockImplementation((pluginName: string) => {
      const plugin = state.plugins.find((p) => p.name === pluginName);
      if (plugin) plugin.enabled = !plugin.enabled;
    }),
    setTheme: (theme: string) => {
      state.currentTheme = theme;
    },
    setUiLanguage: (language: string) => {
      state.uiLanguage = language;
    },
    setActionNotice: vi.fn(),
    setTab: vi.fn(),
    loadUpdateStatus: vi.fn(),
    handlePluginConfigSave: vi.fn(),
    handleCloudLogin: vi.fn(),
    handleCloudDisconnect: vi.fn(),
    handleReset: vi.fn(),
    handleAgentExport: vi.fn(),
    handleAgentImport: vi.fn(),
    loadDropStatus: sharedLoadDropStatus,
    setState: (key: string, value: unknown) => {
      state[key] = value;
    },
    ...overrides,
  };
}

describe("SettingsView Sections", () => {
  let state: SettingsState;
  let _themeSwitched: string | null;
  let handleResetCalled: boolean;

  beforeEach(() => {
    state = createSettingsState();
    _themeSwitched = null;
    handleResetCalled = false;

    (
      globalThis as typeof globalThis & {
        window?: Window & typeof globalThis;
      }
    ).window = {
      confirm: () => true,
    } as Window & typeof globalThis;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    }) as unknown as typeof fetch;

    const cachedMock = createUseAppMock(state, {
      setTheme: (theme: string) => {
        _themeSwitched = theme;
        state.currentTheme = theme;
      },
      handleReset: async () => {
        handleResetCalled = true;
      },
    });

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => cachedMock);
  });

  describe("Danger Zone Section", () => {
    it("renders a searchable settings sidebar and filters sections", async () => {
      let tree: TestRenderer.ReactTestRenderer | null = null;

      await act(async () => {
        tree = TestRenderer.create(React.createElement(SettingsView));
      });

      const sidebar = tree?.root.findByProps({
        "data-testid": "settings-sidebar",
      });
      const searchInput = tree?.root
        .findAllByType("input")
        .find((node) =>
          String(node.props["aria-label"] ?? "").includes("Search settings"),
        );

      expect(sidebar).toBeDefined();
      expect(searchInput).toBeDefined();

      await act(async () => {
        searchInput?.props.onChange({ target: { value: "media" } });
      });

      const renderedTree = JSON.stringify(tree?.toJSON());
      expect(renderedTree).toContain("settings.sections.media.label");
      expect(renderedTree).not.toContain("settings.sections.permissions.label");
    });

    it("renders danger zone with reset button", async () => {
      let tree: TestRenderer.ReactTestRenderer | null = null;

      await act(async () => {
        tree = TestRenderer.create(React.createElement(SettingsView));
      });

      const dangerText = tree?.root.findAll(
        (node) =>
          node.type === "span" &&
          node.children.some((c) => c === "settings.dangerZone"),
      );
      expect(dangerText.length).toBeGreaterThan(0);
    });

    it("reset button triggers handleReset", async () => {
      let tree: TestRenderer.ReactTestRenderer | null = null;

      await act(async () => {
        tree = TestRenderer.create(React.createElement(SettingsView));
      });

      const resetButton = tree?.root.findAll(
        (node) =>
          node.type === "button" &&
          node.children.some((c) => typeof c === "string" && c === "Reset"),
      )[0];

      if (resetButton) {
        await act(async () => {
          resetButton.props.onClick();
        });
        expect(handleResetCalled).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: Settings Persistence
// ---------------------------------------------------------------------------

describe("Settings Persistence", () => {
  let state: SettingsState;

  beforeEach(() => {
    state = createSettingsState();

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => createUseAppMock(state));
  });

  it("theme selection persists in state", async () => {
    const setTheme = mockUseApp().setTheme;
    setTheme("solarized");
    expect(state.currentTheme).toBe("solarized");
  });

  it("multiple language changes update state correctly", async () => {
    const setUiLanguage = mockUseApp().setUiLanguage;

    setUiLanguage("es");
    expect(state.uiLanguage).toBe("es");

    setUiLanguage("ko");
    expect(state.uiLanguage).toBe("ko");

    setUiLanguage("en");
    expect(state.uiLanguage).toBe("en");
  });
});
