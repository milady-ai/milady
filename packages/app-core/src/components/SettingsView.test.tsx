// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { isElectrobunRuntimeMock, useAppMock } = vi.hoisted(() => ({
  isElectrobunRuntimeMock: vi.fn(),
  useAppMock: vi.fn(),
}));

vi.mock("../bridge", () => ({
  isElectrobunRuntime: isElectrobunRuntimeMock,
}));

vi.mock("../state", () => ({
  useApp: useAppMock,
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { type: "button", ...props }, children),
  Dialog: ({
    children,
  }: {
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => React.createElement(React.Fragment, null, children),
  DialogContent: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogTitle: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", props),
  SectionCard: ({
    children,
    id,
    title,
    description,
    className,
  }: {
    children?: React.ReactNode;
    id?: string;
    title?: React.ReactNode;
    description?: React.ReactNode;
    className?: string;
  }) =>
    React.createElement(
      "section",
      { id, className },
      title,
      description,
      children,
    ),
}));

vi.mock("./CodingAgentSettingsSection", () => ({
  CodingAgentSettingsSection: () =>
    React.createElement("div", null, "CodingAgentSettingsSection"),
}));

vi.mock("./ConfigPageView", () => ({
  ConfigPageView: () => React.createElement("div", null, "ConfigPageView"),
}));

vi.mock("./DesktopWorkspaceSection", () => ({
  DesktopWorkspaceSection: () =>
    React.createElement("div", null, "DesktopWorkspaceSection"),
}));

vi.mock("./ElizaCloudDashboard", () => ({
  CloudDashboard: () => React.createElement("div", null, "CloudDashboard"),
}));

vi.mock("./MediaSettingsSection", () => ({
  MediaSettingsSection: () =>
    React.createElement("div", null, "MediaSettingsSection"),
}));

vi.mock("./PermissionsSection", () => ({
  PermissionsSection: () =>
    React.createElement("div", null, "PermissionsSection"),
}));

vi.mock("./ProviderSwitcher", () => ({
  ProviderSwitcher: () => React.createElement("div", null, "ProviderSwitcher"),
}));

vi.mock("./ReleaseCenterView", () => ({
  ReleaseCenterView: () =>
    React.createElement("div", null, "ReleaseCenterView"),
}));

import { SettingsView } from "./SettingsView";

function createUseAppState() {
  return {
    t: (key: string) => key,
    loadPlugins: vi.fn(),
    setTab: vi.fn(),
    handleReset: vi.fn(),
    exportBusy: false,
    exportPassword: "",
    exportIncludeLogs: false,
    exportError: null,
    exportSuccess: null,
    importBusy: false,
    importPassword: "",
    importFile: null,
    importError: null,
    importSuccess: null,
    handleAgentExport: vi.fn(),
    handleAgentImport: vi.fn(),
    setState: vi.fn(),
  };
}

describe("SettingsView", () => {
  beforeEach(() => {
    isElectrobunRuntimeMock.mockReset();
    useAppMock.mockReset();
    useAppMock.mockReturnValue(createUseAppState());
  });

  it("renders a single media section without a standalone voice section", async () => {
    isElectrobunRuntimeMock.mockReturnValue(false);

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(SettingsView));
    });

    if (!renderer) {
      throw new Error("SettingsView did not render");
    }

    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain("settings.sections.media.label");
    expect(text).not.toContain("settings.sections.voice.label");
    expect(text).toContain("MediaSettingsSection");
  });

  it("keeps desktop workspace inside advanced settings on desktop runtime", async () => {
    isElectrobunRuntimeMock.mockReturnValue(true);

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(SettingsView));
    });

    if (!renderer) {
      throw new Error("SettingsView did not render");
    }

    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain("DesktopWorkspaceSection");
    expect(text).toContain("nav.advanced");
  });
});
