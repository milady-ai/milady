// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { testT } from "../../../../../test/helpers/i18n";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("./DatabasePageView", () => ({
  DatabasePageView: ({ contentHeader }: { contentHeader?: React.ReactNode }) =>
    React.createElement("div", null, contentHeader, "database-view"),
}));

vi.mock("./LogsPageView", () => ({
  LogsPageView: ({ contentHeader }: { contentHeader?: React.ReactNode }) =>
    React.createElement("div", null, contentHeader, "logs-view"),
}));

vi.mock("./PluginsPageView", () => ({
  PluginsPageView: ({ contentHeader }: { contentHeader?: React.ReactNode }) =>
    React.createElement("div", null, contentHeader, "plugins-view"),
}));

vi.mock("./RelationshipsView", () => ({
  RelationshipsView: ({ contentHeader }: { contentHeader?: React.ReactNode }) =>
    React.createElement("div", null, contentHeader, "relationships-view"),
}));

vi.mock("./RuntimeView", () => ({
  RuntimeView: ({ contentHeader }: { contentHeader?: React.ReactNode }) =>
    React.createElement("div", null, contentHeader, "runtime-view"),
}));

vi.mock("./SkillsView", () => ({
  SkillsView: ({ contentHeader }: { contentHeader?: React.ReactNode }) =>
    React.createElement("div", null, contentHeader, "skills-view"),
}));

vi.mock("@miladyai/ui", () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
  Button: React.forwardRef(
    (props: Record<string, unknown>, ref: React.Ref<HTMLButtonElement>) =>
      React.createElement("button", { type: "button", ...props, ref }),
  ),
  SegmentedControl: ({
    items,
    value,
    onValueChange,
    ...props
  }: {
    items: Array<{
      label: React.ReactNode;
      testId?: string;
      value: string;
    }>;
    onValueChange: (value: string) => void;
    value: string;
  }) =>
    React.createElement(
      "div",
      props,
      items.map((item) =>
        React.createElement(
          "button",
          {
            key: item.value,
            type: "button",
            "aria-pressed": item.value === value,
            "data-testid": item.testId,
            className:
              item.value === value
                ? "border-accent/26 text-txt-strong px-3"
                : "px-3",
            onClick: () => onValueChange(item.value),
          },
          item.label,
        ),
      ),
    ),
}));

vi.mock("../settings/DesktopWorkspaceSection", () => ({
  DesktopWorkspaceSection: ({
    contentHeader,
  }: {
    contentHeader?: React.ReactNode;
  }) => React.createElement("div", null, contentHeader, "desktop"),
}));

vi.mock("../settings/FineTuningView", () => ({
  FineTuningView: ({ contentHeader }: { contentHeader?: React.ReactNode }) =>
    React.createElement("div", null, contentHeader, "fine-tuning"),
}));

vi.mock("./TrajectoriesView", () => ({
  TrajectoriesView: ({ contentHeader }: { contentHeader?: React.ReactNode }) =>
    React.createElement("div", null, contentHeader, "trajectories"),
}));

vi.mock("./TrajectoryDetailView", () => ({
  TrajectoryDetailView: () => React.createElement("div", null, "trajectory"),
}));

import { AdvancedPageView } from "./AdvancedPageView";

describe("AdvancedPageView", () => {
  it("injects the shared advanced sub-nav into the standard content pane", async () => {
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
    expect(String(activeButton.props.className)).toContain("px-3");
    expect(activeButton.props["aria-pressed"]).toBe(true);
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

  it("keeps the shared advanced header container when fine-tuning is active", async () => {
    const setTab = vi.fn();
    mockUseApp.mockReturnValue({
      tab: "fine-tuning",
      setTab,
      t: (key: string, vars?: Record<string, unknown>) => testT(key, vars),
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AdvancedPageView));
    });

    expect(
      tree.root.findByProps({ "data-testid": "advanced-subtab-nav" }),
    ).toBeDefined();
    expect(
      tree.root.findAll(
        (node) =>
          Array.isArray(node.children) && node.children.includes("fine-tuning"),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("renders the relationships advanced workspace when the relationships tab is active", async () => {
    const setTab = vi.fn();
    mockUseApp.mockReturnValue({
      tab: "relationships",
      setTab,
      t: (key: string, vars?: Record<string, unknown>) => testT(key, vars),
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AdvancedPageView));
    });

    expect(
      tree.root.findAll(
        (node) =>
          Array.isArray(node.children) &&
          node.children.includes("relationships-view"),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findByProps({ "data-testid": "advanced-subtab-relationships" })
        .props["aria-pressed"],
    ).toBe(true);
  });
});
