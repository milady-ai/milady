// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";

const hoisted = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockClient: {
    getTrajectories: vi.fn(),
    exportTrajectories: vi.fn(),
  },
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => hoisted.mockUseApp(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: hoisted.mockClient,
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    variant?: string;
    size?: string;
    "aria-pressed"?: boolean;
  }) =>
    React.createElement(
      "button",
      { type: "button", onClick, disabled, ...rest },
      children,
    ),
  DropdownMenu: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => React.createElement("button", { type: "button", onClick }, children),
  PageLayout: ({
    children,
    sidebar,
    contentHeader,
    ...props
  }: {
    children: React.ReactNode;
    sidebar: React.ReactNode;
    contentHeader?: React.ReactNode;
  } & React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement(
      "div",
      props,
      sidebar,
      contentHeader
        ? React.createElement(
            "div",
            { "data-testid": "trajectories-content-header" },
            contentHeader,
          )
        : null,
      children,
    ),
  PagePanel: Object.assign(
    ({
      children,
      ...props
    }: {
      children: React.ReactNode;
    } & React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    {
      Header: ({
        heading,
        description,
        actions,
        ...props
      }: {
        heading: React.ReactNode;
        description?: React.ReactNode;
        actions?: React.ReactNode;
      } & React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement(
          "div",
          props,
          heading,
          description ?? null,
          actions ?? null,
        ),
      Meta: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) =>
        React.createElement("span", props, children),
      Notice: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement("div", props, children),
      Empty: ({
        title,
        description,
        children,
        ...props
      }: {
        title?: React.ReactNode;
        description?: React.ReactNode;
        children?: React.ReactNode;
      } & React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement(
          "div",
          props,
          title ?? null,
          description ?? null,
          children ?? null,
        ),
      Loading: ({
        heading,
        description,
        ...props
      }: {
        heading: React.ReactNode;
        description?: React.ReactNode;
      } & React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement("div", props, heading, description ?? null),
    },
  ),
  Sidebar: ({
    children,
    testId,
    ...props
  }: {
    children: React.ReactNode;
    testId?: string;
  } & React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("aside", { "data-testid": testId, ...props }, children),
  SidebarHeader: ({
    children,
    search,
    ...props
  }: {
    children?: React.ReactNode;
    search?: React.InputHTMLAttributes<HTMLInputElement> & {
      onClear?: () => void;
    };
  } & React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement(
      "div",
      props,
      search
        ? React.createElement("input", {
            value: search.value,
            onChange: search.onChange,
            placeholder: search.placeholder,
            "aria-label": search["aria-label"],
          })
        : null,
      children ?? null,
    ),
  SidebarPanel: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", props, children),
  SidebarScrollRegion: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement("div", props, children),
  SidebarContent: {
    Toolbar: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    ToolbarActions: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    SectionHeader: ({
      children,
      meta,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { meta?: React.ReactNode }) =>
      React.createElement("div", props, children, meta ?? null),
    SectionLabel: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    EmptyState: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    Item: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", { type: "button", ...props }, children),
    ItemIcon: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement("span", props, children),
    ItemBody: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement("span", props, children),
    ItemTitle: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement("span", props, children),
    ItemDescription: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement("span", props, children),
  },
  TrajectorySidebarItem: ({
    title,
    onSelect,
    ...props
  }: {
    title: React.ReactNode;
    onSelect?: () => void;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement(
      "button",
      { type: "button", onClick: onSelect, ...props },
      title,
    ),
  Select: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  SelectTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  SelectValue: ({ placeholder }: { placeholder?: string }) =>
    React.createElement("span", null, placeholder ?? ""),
  SelectContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  SelectItem: ({ children }: { children: React.ReactNode; value: string }) =>
    React.createElement("div", null, children),
  EmptyState: ({
    title,
    description,
    children,
  }: {
    title?: string;
    description?: string;
    children?: React.ReactNode;
  }) => React.createElement("div", null, title, description ?? "", children),
  cn: (...args: (string | boolean | undefined)[]) =>
    args.filter(Boolean).join(" "),
}));

import type { TrajectoryListResult } from "@miladyai/app-core/api";
import { flush } from "../../../../test/helpers/react-test";
import { TrajectoriesView } from "../../src/components/TrajectoriesView";

const { mockClient, mockUseApp } = hoisted;

const trajectoryList: TrajectoryListResult = {
  trajectories: [],
  total: 0,
  offset: 0,
  limit: 50,
};

function collectText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .join("");
}

function createTranslator(): (
  key: string,
  vars?: Record<string, string | number | boolean | undefined>,
) => string {
  return (key, vars) => {
    const labels: Record<string, string> = {
      "common.on": "ON_TEXT",
      "common.off": "OFF_TEXT",
    };
    if (key === "trajectoriesview.ShowingRange" && vars) {
      return `${String(vars.start)}-${String(vars.end)} of ${String(vars.total)}`;
    }
    return labels[key] ?? key;
  };
}

function setBaseMocks(): void {
  mockClient.getTrajectories.mockResolvedValue(trajectoryList);
  mockClient.exportTrajectories.mockResolvedValue(
    new Blob(["[]"], { type: "application/json" }),
  );
  mockUseApp.mockReturnValue({
    t: createTranslator(),
  });
}

describe("TrajectoriesView", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    for (const fn of Object.values(mockClient)) {
      fn.mockReset();
    }
  });

  it("shows empty copy when there are no trajectories", async () => {
    setBaseMocks();

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(TrajectoriesView));
    });
    await flush();

    if (tree == null) {
      throw new Error("expected tree");
    }
    expect(collectText(tree.root)).toContain(
      "trajectoriesview.NoTrajectoriesYet",
    );
  });

  it("retries trajectory loading when the logger API is still starting", async () => {
    vi.useFakeTimers();
    try {
      setBaseMocks();
      mockClient.getTrajectories
        .mockRejectedValueOnce(
          new ApiError({
            kind: "http",
            path: "/api/trajectories",
            status: 503,
            message: "service unavailable",
          }),
        )
        .mockResolvedValue(trajectoryList);

      await act(async () => {
        TestRenderer.create(React.createElement(TrajectoriesView));
      });

      expect(mockClient.getTrajectories).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(mockClient.getTrajectories).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
