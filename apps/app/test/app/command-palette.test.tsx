// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockOpenBugReport } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockOpenBugReport: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/hooks/useBugReport", () => ({
  useBugReport: () => ({
    open: mockOpenBugReport,
  }),
}));

import { CommandPalette } from "../../src/components/CommandPalette";

type PaletteContext = {
  commandPaletteOpen: boolean;
  commandQuery: string;
  commandActiveIndex: number;
  agentStatus: { state: string };
  handleStart: () => void;
  handlePauseResume: () => void;
  handleRestart: () => void;
  setTab: (tab: string) => void;
  loadPlugins: () => void;
  loadSkills: () => void;
  loadLogs: () => void;
  loadWorkbench: () => void;
  handleChatClear: () => void;
  activeGameViewerUrl: string;
  setState: (key: string, value: unknown) => void;
  closeCommandPalette: () => void;
};

function createContext(
  overrides?: Partial<PaletteContext>,
): PaletteContext & Record<string, unknown> {
  return {
    commandPaletteOpen: true,
    commandQuery: "",
    commandActiveIndex: 0,
    agentStatus: { state: "running" },
    handleStart: vi.fn(),
    handlePauseResume: vi.fn(),
    handleRestart: vi.fn(),
    setTab: vi.fn(),
    loadPlugins: vi.fn(),
    loadSkills: vi.fn(),
    loadLogs: vi.fn(),
    loadWorkbench: vi.fn(),
    handleChatClear: vi.fn(),
    activeGameViewerUrl: "",
    setState: vi.fn(),
    closeCommandPalette: vi.fn(),
    ...(overrides ?? {}),
  };
}

function getWindowKeydownHandler(): (e: KeyboardEvent) => void {
  const addListener = window.addEventListener as unknown as {
    mock: { calls: unknown[][] };
  };
  const keydownCall = addListener.mock.calls.find(
    (call) => call[0] === "keydown",
  );

  if (!keydownCall || typeof keydownCall[1] !== "function") {
    throw new Error("Expected keydown listener to be registered");
  }

  return keydownCall[1] as (e: KeyboardEvent) => void;
}

describe("CommandPalette keyboard behavior", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockOpenBugReport.mockReset();
    vi.restoreAllMocks();
    vi.spyOn(window, "addEventListener");
    vi.spyOn(window, "removeEventListener");
  });

  it("ignores arrow navigation when no commands match", () => {
    const ctx = createContext({
      commandQuery: "this-will-not-match-any-command",
      commandActiveIndex: 0,
    });
    mockUseApp.mockReturnValue(ctx);

    act(() => {
      TestRenderer.create(React.createElement(CommandPalette));
    });

    vi.mocked(ctx.setState).mockClear();
    const keydown = getWindowKeydownHandler();

    const preventDefaultUp = vi.fn();
    const preventDefaultDown = vi.fn();

    act(() => {
      keydown({
        key: "ArrowUp",
        preventDefault: preventDefaultUp,
      } as KeyboardEvent);
      keydown({
        key: "ArrowDown",
        preventDefault: preventDefaultDown,
      } as KeyboardEvent);
    });

    expect(preventDefaultUp).not.toHaveBeenCalled();
    expect(preventDefaultDown).not.toHaveBeenCalled();
    expect(ctx.setState).not.toHaveBeenCalled();
  });

  it("clamps active index when it is beyond the filtered list", () => {
    const ctx = createContext({
      commandActiveIndex: 999,
    });
    mockUseApp.mockReturnValue(ctx);

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(CommandPalette));
    });

    const commandButtons = tree.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("w-full px-4 py-2.5"),
    );

    const expectedMaxIndex = commandButtons.length - 1;
    const calls = vi
      .mocked(ctx.setState)
      .mock.calls.filter(([key]) => key === "commandActiveIndex");

    expect(expectedMaxIndex).toBeGreaterThanOrEqual(0);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)?.[1]).toBe(expectedMaxIndex);
  });

  it("does not execute Enter action when no commands match", () => {
    const ctx = createContext({
      commandQuery: "this-will-not-match-any-command",
      commandActiveIndex: 0,
    });
    mockUseApp.mockReturnValue(ctx);

    act(() => {
      TestRenderer.create(React.createElement(CommandPalette));
    });

    const keydown = getWindowKeydownHandler();
    const preventDefault = vi.fn();

    act(() => {
      keydown({ key: "Enter", preventDefault } as KeyboardEvent);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(ctx.closeCommandPalette).not.toHaveBeenCalled();
  });
});
