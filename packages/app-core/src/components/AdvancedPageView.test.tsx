// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { testT } from "../../../../test/helpers/i18n";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("./DatabasePageView", () => ({
  DatabasePageView: () => React.createElement("div", null, "database-view"),
}));

vi.mock("./LogsPageView", () => ({
  LogsPageView: () => React.createElement("div", null, "logs-view"),
}));

vi.mock("./PluginsPageView", () => ({
  PluginsPageView: () => React.createElement("div", null, "plugins-view"),
}));

vi.mock("./RuntimeView", () => ({
  RuntimeView: () => React.createElement("div", null, "runtime-view"),
}));

vi.mock("./SkillsView", () => ({
  SkillsView: () => React.createElement("div", null, "skills-view"),
}));

vi.mock("@miladyai/ui", () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
  Button: React.forwardRef(
    (props: Record<string, unknown>, ref: React.Ref<HTMLButtonElement>) =>
      React.createElement("button", { type: "button", ...props, ref }),
  ),
}));

vi.mock("./DesktopWorkspaceSection", () => ({
  DesktopWorkspaceSection: () => React.createElement("div", null, "desktop"),
}));

vi.mock("./FineTuningView", () => ({
  FineTuningView: () => React.createElement("div", null, "fine-tuning"),
}));

vi.mock("./TrajectoriesView", () => ({
  TrajectoriesView: () => React.createElement("div", null, "trajectories"),
}));

vi.mock("./TrajectoryDetailView", () => ({
  TrajectoryDetailView: () => React.createElement("div", null, "trajectory"),
}));

import { AdvancedPageView } from "./AdvancedPageView";

describe("AdvancedPageView", () => {
  it("renders the compact advanced sub-nav with an active tab in the standard layout", async () => {
    const setTab = vi.fn();
    mockUseApp.mockReturnValue({
      tab: "skills",
      setTab,
      t: (key: string, vars?: Record<string, unknown>) => testT(key, vars),
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AdvancedPageView));
    });

    const nav = tree.root.findByProps({ "data-testid": "advanced-subtab-nav" });
    const activeButton = tree.root.findByProps({
      "data-testid": "advanced-subtab-skills",
    });

    expect(nav).toBeDefined();
    expect(String(activeButton.props.className)).toContain("border-accent/26");
    expect(String(activeButton.props.className)).toContain("text-txt-strong");
    expect(String(activeButton.props.className)).toContain("px-2.5");
    expect(activeButton.props["aria-current"]).toBe("page");
  });

  it("renders compact advanced sub-nav buttons in the modal layout", async () => {
    const setTab = vi.fn();
    mockUseApp.mockReturnValue({
      tab: "runtime",
      setTab,
      t: (key: string, vars?: Record<string, unknown>) => testT(key, vars),
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(AdvancedPageView, { inModal: true }),
      );
    });

    const runtimeButton = tree.root.findByProps({
      "data-testid": "advanced-subtab-runtime",
    });

    expect(String(runtimeButton.props.className)).toContain("inline-flex");
    expect(String(runtimeButton.props.className)).toContain("px-3");
    expect(runtimeButton.props["aria-current"]).toBe("page");
  });
});
