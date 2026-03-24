// @vitest-environment jsdom

import React from "react";
import type { ReactTestRenderer } from "react-test-renderer";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const mockUseApp = vi.fn();

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/app-core/components", () => ({
  ChatView: () => React.createElement("div", null, "ChatView"),
  CloudDashboard: () => React.createElement("div", null, "CloudDashboard"),
  CodingAgentSettingsSection: () =>
    React.createElement("div", null, "CodingAgentSettingsSection"),
  ConfigPageView: () => React.createElement("div", null, "ConfigPageView"),
  ConnectorsPageView: () =>
    React.createElement("div", null, "ConnectorsPageView"),
  ConversationsSidebar: () =>
    React.createElement("div", null, "ConversationsSidebar"),
  HeartbeatsView: () => React.createElement("div", null, "HeartbeatsView"),
  MediaSettingsSection: () =>
    React.createElement("div", null, "MediaSettingsSection"),
  PairingView: () => React.createElement("div", null, "PairingView"),
  PermissionsSection: () =>
    React.createElement("div", null, "PermissionsSection"),
  PluginsPageView: () => React.createElement("div", null, "PluginsPageView"),
  ProviderSwitcher: () => React.createElement("div", null, "ProviderSwitcher"),
  ReleaseCenterView: () =>
    React.createElement("div", null, "ReleaseCenterView"),
  SettingsView: () => React.createElement("div", null, "SettingsView"),
  StartupFailureView: () =>
    React.createElement("div", null, "StartupFailureView"),
  VoiceConfigView: () => React.createElement("div", null, "VoiceConfigView"),
}));

// Mock relative to the component under test (shell/DetachedShellRoot.tsx)
// which imports BrowserSurfaceWindow from "../../components" → apps/app/src/components
vi.mock("../../components", () => ({
  BrowserSurfaceWindow: () =>
    React.createElement("div", null, "BrowserSurfaceWindow"),
  ConversationsSidebar: () =>
    React.createElement("div", null, "ConversationsSidebar"),
  ChatView: () => React.createElement("div", null, "ChatView"),
  CloudDashboard: () => React.createElement("div", null, "CloudDashboard"),
  ConnectorsPageView: () =>
    React.createElement("div", null, "ConnectorsPageView"),
  HeartbeatsView: () => React.createElement("div", null, "HeartbeatsView"),
  PluginsPageView: () => React.createElement("div", null, "PluginsPageView"),
  SettingsView: () => React.createElement("div", null, "SettingsView"),
  StartupFailureView: () =>
    React.createElement("div", null, "StartupFailureView"),
  PairingView: () => React.createElement("div", null, "PairingView"),
}));

vi.mock("../../platform/window-shell", () => ({
  resolveDetachedShellTarget: (route: { tab?: string; section?: string }) => ({
    tab: route.tab ?? "chat",
    settingsSection: route.section,
  }),
}));

import { DetachedShellRoot } from "../DetachedShellRoot";

function appState(overrides: Record<string, unknown> = {}) {
  return {
    authRequired: false,
    onboardingComplete: true,
    onboardingLoading: false,
    retryStartup: vi.fn(),
    startupError: null,
    t: (key: string) => key,
    ...overrides,
  };
}

describe("DetachedShellRoot", () => {
  it("renders a skip-to-content link", async () => {
    mockUseApp.mockReturnValue(appState());
    let tree: ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <DetachedShellRoot route={{ mode: "surface", tab: "chat" } as any} />,
      );
    });
    const skipLink = tree?.root.findAll(
      (node) => node.type === "a" && node.props.href === "#detached-main",
    );
    expect(skipLink?.length).toBeGreaterThanOrEqual(1);
    expect(skipLink?.[0].props.className).toContain("sr-only");
  });

  it("renders a main element with id (implicit role)", async () => {
    mockUseApp.mockReturnValue(appState());
    let tree: ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <DetachedShellRoot route={{ mode: "surface", tab: "chat" } as any} />,
      );
    });
    const main = tree?.root.findAll(
      (node) => node.type === "main" && node.props.id === "detached-main",
    );
    expect(main?.length).toBe(1);
    // No explicit role="main" — <main> carries it implicitly
    expect(main?.[0].props.role).toBeUndefined();
  });

  it("wraps ConversationsSidebar in nav with translated aria-label", async () => {
    mockUseApp.mockReturnValue(appState());
    let tree: ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <DetachedShellRoot route={{ mode: "surface", tab: "chat" } as any} />,
      );
    });
    const navs = tree?.root.findAll(
      (node) => node.type === "nav" && node.props["aria-label"],
    );
    expect(navs?.length).toBeGreaterThanOrEqual(1);
    // aria-label should come from t(), not hardcoded English
    expect(navs?.[0].props["aria-label"]).toBe("chat.conversations");
  });
});
