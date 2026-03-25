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

function t(key: string): string {
  const translations: Record<string, string> = {
    "common.loading": "Loading",
    "appsview.Active": "Active",
    "heartbeatsview.heartbeatSingular": "Heartbeat",
    "heartbeatsview.newHeartbeat": "New Heartbeat",
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
    expect(snapshot).toContain(
      "Use the sidebar to create a new heartbeat or select an existing one to view and edit its details.",
    );
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

    expect(String(shell?.props.className)).toContain("rounded-2xl");
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
