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
  Input: ({
    value,
    onChange,
    ...rest
  }: {
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
    type?: string;
    placeholder?: string;
    className?: string;
  }) => React.createElement("input", { value, onChange, ...rest }),
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
