// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../state", () => ({
  useApp: () => mockUseApp(),
}));

import { HeartbeatsView } from "./HeartbeatsView";
import { DesktopEmptyStatePanel } from "./desktop-surface-primitives";
import { APP_PANEL_SHELL_CLASSNAME } from "./sidebar-shell-styles";

function t(key: string): string {
  const translations: Record<string, string> = {
    "common.loading": "Loading",
    "appsview.Active": "Active",
    "heartbeatsview.heartbeatSingular": "Heartbeat",
    "heartbeatsview.newHeartbeat": "New Heartbeat",
    "heartbeatsview.selectAHeartbeat": "Select a Heartbeat",
    "heartbeatsview.createFirstHeartbeat": "Create your first heartbeat",
    "heartbeatsview.emptyStateDescription":
      "Use the sidebar to create a new heartbeat or select an existing one to view and edit its details.",
  };
  return translations[key] ?? key;
}

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    triggers: [],
    triggersLoading: false,
    triggersSaving: false,
    triggerRunsById: {},
    triggerHealth: null,
    triggerError: null,
    loadTriggers: vi.fn(async () => {}),
    createTrigger: vi.fn(async () => null),
    updateTrigger: vi.fn(async () => null),
    deleteTrigger: vi.fn(async () => true),
    runTriggerNow: vi.fn(async () => true),
    loadTriggerRuns: vi.fn(async () => {}),
    loadTriggerHealth: vi.fn(async () => {}),
    t,
    ...overrides,
  };
}

describe("HeartbeatsView UI states", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    window.localStorage.clear();
  });

  it("shows the empty-state guidance when no heartbeats exist", async () => {
    mockUseApp.mockReturnValue(makeAppState());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<HeartbeatsView />);
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("New Heartbeat");
    expect(snapshot).toContain("Templates");
    expect(snapshot).toContain("Create your first heartbeat");
    expect(snapshot).not.toContain("Select a Heartbeat");
    expect(snapshot).not.toContain(
      "Use the sidebar to create a new heartbeat or select an existing one to view and edit its details.",
    );
    expect(tree?.root.findAllByType(DesktopEmptyStatePanel)).toHaveLength(1);
  });

  it("keeps a simplified selection state when heartbeats exist but none is selected", async () => {
    mockUseApp.mockReturnValue(
      makeAppState({
        triggers: [
          {
            id: "hb_1",
            displayName: "Daily Digest",
            instructions: "Summarize the top crypto moves.",
            triggerType: "interval",
            wakeMode: "inject_now",
            intervalMs: 3_600_000,
            scheduledAtIso: null,
            cronExpression: null,
            maxRuns: null,
            enabled: true,
            lastStatus: null,
          },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<HeartbeatsView />);
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("Daily Digest");
    expect(snapshot).toContain("Select a Heartbeat");
    expect(snapshot).not.toContain("Create your first heartbeat");
    expect(snapshot).toContain(
      "Use the sidebar to create a new heartbeat or select an existing one to view and edit its details.",
    );
    expect(tree?.root.findAllByType(DesktopEmptyStatePanel)).toHaveLength(1);
  });

  it("shows a rail loading state while heartbeats are being fetched", async () => {
    mockUseApp.mockReturnValue(
      makeAppState({
        triggersLoading: true,
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<HeartbeatsView />);
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("Loading");
    expect(snapshot).toContain("Select a Heartbeat");
    expect(snapshot).not.toContain("Create your first heartbeat");
  });

  it("renders the rounded shared shell without a nested detail panel wrapper", async () => {
    mockUseApp.mockReturnValue(makeAppState());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<HeartbeatsView />);
    });

    const shell = tree?.root.findByProps({
      "data-testid": "heartbeats-shell",
    });
    const detailPanels = tree?.root.findAllByProps({
      "data-testid": "heartbeats-detail-panel",
    });

    expect(String(shell?.props.className)).toBe(APP_PANEL_SHELL_CLASSNAME);
    expect(String(shell?.props.className)).toContain("backdrop-blur-md");
    expect(String(shell?.props.className)).toContain("shadow");
    expect(String(shell?.props.className)).toContain("ring-1");
    expect(detailPanels).toHaveLength(0);
  });

  it("uses the roomier shell sizing for sidebar and main content", async () => {
    mockUseApp.mockReturnValue(makeAppState());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<HeartbeatsView />);
    });

    const root = tree?.root.findByType("div");
    const aside = tree?.root.findByType("aside");
    const main = tree?.root.findByType("main");

    expect(String(root?.props.className)).toContain("p-0");
    expect(String(root?.props.className)).toContain("lg:p-1");
    expect(String(aside?.props.className)).toContain("md:w-[21rem]");
    expect(String(main?.props.className)).toContain("lg:pt-4");
    expect(String(main?.props.className)).toContain("lg:pb-7");
    expect(String(main?.props.className)).toContain("lg:px-7");
  });
});
