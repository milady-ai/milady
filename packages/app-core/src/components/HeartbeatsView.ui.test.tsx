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
});
