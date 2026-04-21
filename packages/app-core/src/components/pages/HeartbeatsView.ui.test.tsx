// @vitest-environment jsdom

import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

import { HeartbeatsView } from "./HeartbeatsView";

const SHARED_SIDEBAR_COLLAPSED_STORAGE_KEY =
  "milady:ui:sidebar:primary-app-sidebar:collapsed";

function t(
  key: string,
  vars?: {
    defaultValue?: string;
  },
): string {
  const translations: Record<string, string> = {
    "common.loading": "Loading",
    "appsview.Active": "Active",
    "heartbeatsview.heartbeatSingular": "Heartbeat",
    "heartbeatsview.newHeartbeat": "New Heartbeat",
    "heartbeatsview.selectAHeartbeat": "Select a Heartbeat",
    "heartbeatsview.createFirstHeartbeat": "Create your first Heartbeat",
  };
  return vars?.defaultValue ?? translations[key] ?? key;
}

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    triggers: [],
    triggersLoaded: false,
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

function collectText(node: ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string"
        ? child
        : collectText(child as ReactTestInstance),
    )
    .join("");
}

function findHostByTestId(
  tree: TestRenderer.ReactTestRenderer | undefined,
  testId: string,
) {
  return tree?.root.findAll(
    (node) =>
      typeof node.type === "string" && node.props["data-testid"] === testId,
  )[0];
}

function getRenderedRoot(
  tree: TestRenderer.ReactTestRenderer | undefined,
): ReactTestInstance {
  const root = tree?.root;
  if (!root) {
    throw new Error("Expected HeartbeatsView to render.");
  }
  return root;
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

    const snapshot = collectText(getRenderedRoot(tree));
    expect(snapshot).toContain("New Heartbeat");
    expect(snapshot).toContain("Templates");
    expect(snapshot).toContain("Create your first Heartbeat");
    expect(snapshot).not.toContain("Select a Heartbeat");
    expect(snapshot).not.toContain(
      "Use the sidebar to create a new heartbeat or select an existing one to view and edit its details.",
    );
    expect(snapshot.match(/Create your first Heartbeat/g)?.length ?? 0).toBe(1);
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

    const snapshot = collectText(getRenderedRoot(tree));
    expect(snapshot).toContain("Daily Digest");
    expect(snapshot).toContain("Select a Heartbeat");
    expect(snapshot).not.toContain("Create your first Heartbeat");
    expect(snapshot.match(/Select a Heartbeat/g)?.length ?? 0).toBe(1);
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

    const snapshot = collectText(getRenderedRoot(tree));
    expect(snapshot).toContain("Loading");
    expect(snapshot).toContain("Select a Heartbeat");
    expect(snapshot).not.toContain("Create your first Heartbeat");
  });

  it("renders a Search heartbeats sidebar input and filters the trigger list", async () => {
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
          {
            id: "hb_2",
            displayName: "Wallet Watch",
            instructions: "Track wallet activity.",
            triggerType: "interval",
            wakeMode: "inject_now",
            intervalMs: 7_200_000,
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

    const searchInput = tree?.root
      .findAllByType("input")
      .find((node) => node.props["aria-label"] === "Search heartbeats");
    expect(searchInput).toBeDefined();

    await act(async () => {
      searchInput?.props.onChange({ target: { value: "wallet" } });
    });

    const renderedTree = JSON.stringify(tree?.toJSON());
    expect(renderedTree).toContain("Wallet Watch");
    expect(renderedTree).not.toContain("Daily Digest");
  });

  it("renders the shared split layout without a nested detail panel wrapper", async () => {
    mockUseApp.mockReturnValue(makeAppState());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<HeartbeatsView />);
    });

    const shell = findHostByTestId(tree, "heartbeats-shell");
    const detailPanels = tree?.root.findAllByProps({
      "data-testid": "heartbeats-detail-panel",
    });

    expect(String(shell?.props.className)).toContain("flex");
    expect(String(shell?.props.className)).toContain("h-full");
    expect(String(shell?.props.className)).toContain("min-h-0");
    expect(String(shell?.props.className)).toContain("bg-transparent");
    expect(detailPanels).toHaveLength(0);
  });

  it("uses the direct split sizing for sidebar and main content", async () => {
    mockUseApp.mockReturnValue(makeAppState());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<HeartbeatsView />);
    });

    const shell = findHostByTestId(tree, "heartbeats-shell");
    const aside = findHostByTestId(tree, "heartbeats-sidebar");
    const main = tree?.root.findByType("main");

    expect(String(shell?.props.className)).toContain("w-full");
    expect(String(shell?.props.className)).toContain("min-w-0");
    expect(String(aside?.props.className)).toContain("mt-4");
    expect(String(aside?.props.className)).toContain("!w-[18.5rem]");
    expect(String(main?.props.className)).toContain("p-0");
  });

  it("reuses the shared sidebar collapse flow and persists the rail state", async () => {
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

    const collapseButton = tree?.root.findByProps({
      "data-testid": "heartbeats-sidebar-collapse-toggle",
    });

    await act(async () => {
      collapseButton?.props.onClick();
    });

    const sidebar = findHostByTestId(tree, "heartbeats-sidebar");
    expect(sidebar?.props["data-collapsed"]).toBe(true);
    expect(String(sidebar?.props.className)).toContain("w-[4.75rem]");
    expect(
      window.localStorage.getItem(SHARED_SIDEBAR_COLLAPSED_STORAGE_KEY),
    ).toBe("true");
    expect(
      tree?.root.findByProps({
        "data-testid": "heartbeats-sidebar-expand-toggle",
      }),
    ).toBeTruthy();
  });

  it("loads the shared collapsed sidebar state on mount", async () => {
    window.localStorage.setItem(SHARED_SIDEBAR_COLLAPSED_STORAGE_KEY, "true");
    mockUseApp.mockReturnValue(makeAppState());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<HeartbeatsView />);
    });

    const sidebar = findHostByTestId(tree, "heartbeats-sidebar");
    expect(sidebar?.props["data-collapsed"]).toBe(true);
    expect(String(sidebar?.props.className)).toContain("w-[4.75rem]");
  });

  it("uses a silent trigger refresh when sidebar data is already cached", async () => {
    const loadTriggers = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      makeAppState({
        triggersLoaded: true,
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
        loadTriggers,
      }),
    );

    await act(async () => {
      TestRenderer.create(<HeartbeatsView />);
    });

    expect(loadTriggers).toHaveBeenCalledWith({ silent: true });
  });
});
