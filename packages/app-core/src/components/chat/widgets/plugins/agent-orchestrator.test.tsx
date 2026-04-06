import type React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../../api", () => ({
  client: {
    listAppRuns: vi.fn(),
    getCodingAgentStatus: vi.fn(),
    listCodingAgentTaskThreads: vi.fn(),
    getCodingAgentTaskThread: vi.fn(),
    archiveCodingAgentTaskThread: vi.fn(),
    reopenCodingAgentTaskThread: vi.fn(),
  },
}));

vi.mock("../../../../state", () => ({
  useApp: vi.fn(),
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  ),
}));

vi.mock("lucide-react", () => ({
  Activity: (props: React.SVGProps<SVGSVGElement>) => (
    <svg aria-hidden="true" {...props} />
  ),
}));

import { client } from "../../../../api";
import { useApp } from "../../../../state";
import { AGENT_ORCHESTRATOR_PLUGIN_WIDGETS } from "./agent-orchestrator";

const mockClient = client as unknown as {
  listAppRuns: ReturnType<typeof vi.fn>;
  getCodingAgentStatus: ReturnType<typeof vi.fn>;
  listCodingAgentTaskThreads: ReturnType<typeof vi.fn>;
  getCodingAgentTaskThread: ReturnType<typeof vi.fn>;
  archiveCodingAgentTaskThread: ReturnType<typeof vi.fn>;
  reopenCodingAgentTaskThread: ReturnType<typeof vi.fn>;
};

const mockUseApp = useApp as unknown as ReturnType<typeof vi.fn>;

function requireWidget(id: string) {
  const widget = AGENT_ORCHESTRATOR_PLUGIN_WIDGETS.find(
    (candidate) => candidate.id === id,
  );
  if (!widget) {
    throw new Error(`Widget "${id}" not found`);
  }
  return widget.Component;
}

function requireTree(
  tree: TestRenderer.ReactTestRenderer | null,
): TestRenderer.ReactTestRenderer {
  if (!tree) {
    throw new Error("Expected a rendered test tree.");
  }
  return tree;
}

const TasksWidget = requireWidget("agent-orchestrator.tasks");
const AppsWidget = requireWidget("agent-orchestrator.apps");
const ActivityWidget = requireWidget("agent-orchestrator.activity");

function createThread() {
  return {
    id: "thread-1",
    title: "Task Alpha",
    kind: "coding",
    status: "active" as const,
    originalRequest: "Implement durable task persistence",
    summary: "Validation in progress",
    sessionCount: 1,
    activeSessionCount: 1,
    latestSessionId: "session-1",
    latestSessionLabel: "alpha-agent",
    latestWorkdir: "/workspace/project",
    latestRepo: "https://github.com/example/project",
    latestActivityAt: Date.now(),
    decisionCount: 3,
    createdAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:10.000Z",
    closedAt: null,
    archivedAt: null,
  };
}

function createArchivedThread() {
  return {
    ...createThread(),
    id: "thread-archived",
    title: "Archived Task",
    status: "archived" as const,
    archivedAt: "2026-04-06T00:01:00.000Z",
    updatedAt: "2026-04-06T00:01:00.000Z",
  };
}

function createThreadDetail() {
  return {
    ...createThread(),
    acceptanceCriteria: [
      "Persist task state to the database",
      "Record validation artifacts",
    ],
    sessions: [
      {
        id: "session-row-1",
        threadId: "thread-1",
        sessionId: "session-1",
        framework: "codex",
        providerSource: "subscription",
        label: "alpha-agent",
        originalTask: "Implement durable task persistence",
        workdir: "/workspace/project",
        repo: "https://github.com/example/project",
        status: "active",
        decisionCount: 3,
        autoResolvedCount: 1,
        registeredAt: Date.now(),
        lastActivityAt: Date.now(),
        idleCheckCount: 0,
        taskDelivered: true,
        completionSummary: null,
        lastSeenDecisionIndex: 3,
        lastInputSentAt: null,
        stoppedAt: null,
        metadata: {},
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:10.000Z",
      },
    ],
    decisions: [
      {
        id: "decision-1",
        threadId: "thread-1",
        sessionId: "session-1",
        event: "turn_complete",
        promptText: "done",
        decision: "complete",
        response: null,
        reasoning: "Implementation and tests are complete.",
        timestamp: Date.now(),
        createdAt: "2026-04-06T00:00:10.000Z",
      },
    ],
    events: [
      {
        id: "event-1",
        threadId: "thread-1",
        sessionId: "session-1",
        eventType: "validation_passed",
        timestamp: Date.now(),
        summary: "Validation passed",
        data: {},
        createdAt: "2026-04-06T00:00:10.000Z",
      },
    ],
    artifacts: [
      {
        id: "artifact-1",
        threadId: "thread-1",
        sessionId: "session-1",
        artifactType: "validation_report",
        title: "Validation report",
        path: "/tmp/validation-report.json",
        uri: null,
        mimeType: "application/json",
        metadata: {},
        createdAt: "2026-04-06T00:00:10.000Z",
      },
    ],
    transcripts: [
      {
        id: "transcript-1",
        threadId: "thread-1",
        sessionId: "session-1",
        timestamp: Date.now(),
        direction: "stdout" as const,
        content: "Verification complete.",
        metadata: {},
        createdAt: "2026-04-06T00:00:10.000Z",
      },
    ],
    pendingDecisions: [
      {
        sessionId: "session-1",
        threadId: "thread-1",
        promptText: "Approve the production deploy?",
        recentOutput: "Waiting for operator confirmation",
        llmDecision: {
          action: "respond",
          response: "yes",
          reasoning:
            "Validation already passed and the deploy is the final step.",
        },
        taskContext: {
          label: "alpha-agent",
          agentType: "codex",
        },
        createdAt: Date.now(),
        updatedAt: "2026-04-06T00:00:10.000Z",
      },
    ],
  };
}

function createArchivedThreadDetail() {
  return {
    ...createThreadDetail(),
    ...createArchivedThread(),
  };
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

function findButtonByText(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "button" && textOf(node) === label,
  );
  if (!matches[0]) {
    throw new Error(`Button "${label}" not found`);
  }
  return matches[0];
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  attempts = 20,
): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(message);
}

describe("agent orchestrator tasks widget", () => {
  let tree: TestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    mockClient.listAppRuns.mockReset();
    mockClient.getCodingAgentStatus.mockReset();
    mockClient.listCodingAgentTaskThreads.mockReset();
    mockClient.getCodingAgentTaskThread.mockReset();
    mockClient.archiveCodingAgentTaskThread.mockReset();
    mockClient.reopenCodingAgentTaskThread.mockReset();
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      appRuns: [],
      ptySessions: [],
      setState: vi.fn(),
      t: (_key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? _key,
    });
    mockClient.getCodingAgentStatus.mockResolvedValue(null);
  });

  afterEach(() => {
    if (tree) {
      act(() => {
        tree?.unmount();
      });
    }
    tree = null;
  });

  it("loads persisted task threads and archives the selected thread", async () => {
    const openThread = createThread();
    const archivedThread = createArchivedThread();
    mockClient.listCodingAgentTaskThreads.mockImplementation(
      async (options?: { includeArchived?: boolean }) =>
        options?.includeArchived ? [archivedThread] : [openThread],
    );
    mockClient.getCodingAgentTaskThread.mockResolvedValue(createThreadDetail());
    mockClient.archiveCodingAgentTaskThread.mockResolvedValue(true);

    await act(async () => {
      tree = TestRenderer.create(
        <TasksWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () => textOf(requireTree(tree).root).includes("Validation report"),
      "expected persisted task detail to render",
    );

    expect(textOf(requireTree(tree).root)).toContain("Task Alpha");
    expect(textOf(requireTree(tree).root)).toContain(
      "Persist task state to the database",
    );

    await act(async () => {
      await findButtonByText(requireTree(tree).root, "Archive").props.onClick();
    });

    await waitFor(
      () => mockClient.archiveCodingAgentTaskThread.mock.calls.length === 1,
      "expected archive request to be sent",
    );
    expect(mockClient.archiveCodingAgentTaskThread).toHaveBeenCalledWith(
      "thread-1",
    );
    expect(mockClient.listCodingAgentTaskThreads).toHaveBeenLastCalledWith({
      includeArchived: true,
      search: undefined,
      limit: 30,
    });
  });

  it("renders provider routing state and pending user input from the thread detail", async () => {
    mockClient.listCodingAgentTaskThreads.mockResolvedValue([createThread()]);
    mockClient.getCodingAgentTaskThread.mockResolvedValue(createThreadDetail());
    mockClient.getCodingAgentStatus.mockResolvedValue({
      supervisionLevel: "autonomous",
      taskCount: 1,
      tasks: [],
      pendingConfirmations: 1,
      preferredAgentType: "codex",
      preferredAgentReason:
        "Codex is authenticated and has the best readiness score.",
      frameworks: [
        {
          id: "codex",
          label: "Codex",
          adapter: "codex",
          installed: true,
          installCommand: "brew install codex",
          docsUrl: "https://example.com/codex",
          authReady: true,
          available: true,
          score: 10,
          reason: "Authenticated and healthy",
          warnings: [],
        },
        {
          id: "claude",
          label: "Claude Code",
          adapter: "claude",
          installed: true,
          installCommand: "brew install claude",
          docsUrl: "https://example.com/claude",
          authReady: false,
          available: false,
          score: 2,
          reason: "Login required",
          warnings: ["auth"],
        },
      ],
    });

    await act(async () => {
      tree = TestRenderer.create(
        <TasksWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () => textOf(requireTree(tree).root).includes("Provider Routing"),
      "expected provider routing panel to render",
    );

    expect(textOf(requireTree(tree).root)).toContain("Preferred: codex");
    expect(textOf(requireTree(tree).root)).toContain("Pending approvals: 1");
    expect(textOf(requireTree(tree).root)).toContain(
      "Approve the production deploy?",
    );
    expect(textOf(requireTree(tree).root)).toContain(
      "Validation already passed and the deploy is the final step.",
    );
    expect(textOf(requireTree(tree).root)).toContain("subscription");
    expect(textOf(requireTree(tree).root)).toContain("Login required");
  });

  it("surfaces archive mutation failures instead of silently switching state", async () => {
    mockClient.listCodingAgentTaskThreads.mockResolvedValue([createThread()]);
    mockClient.getCodingAgentTaskThread.mockResolvedValue(createThreadDetail());
    mockClient.archiveCodingAgentTaskThread.mockRejectedValue(
      new Error("archive failed"),
    );

    await act(async () => {
      tree = TestRenderer.create(
        <TasksWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () => textOf(requireTree(tree).root).includes("Validation report"),
      "expected task detail before archive mutation",
    );

    await act(async () => {
      await findButtonByText(requireTree(tree).root, "Archive").props.onClick();
    });

    await waitFor(
      () =>
        textOf(requireTree(tree).root).includes("Failed to update task thread"),
      "expected archive mutation error to render",
    );

    expect(textOf(requireTree(tree).root)).toContain(
      "Failed to update task thread: archive failed",
    );
    expect(mockClient.listCodingAgentTaskThreads).toHaveBeenCalledTimes(1);
  });

  it("shows archived threads and reopens the selected archived task", async () => {
    const archivedThread = createArchivedThread();
    mockClient.listCodingAgentTaskThreads.mockImplementation(
      async (options?: { includeArchived?: boolean }) =>
        options?.includeArchived ? [archivedThread] : [createThread()],
    );
    mockClient.getCodingAgentTaskThread.mockImplementation(
      async (threadId: string) =>
        threadId === "thread-archived"
          ? createArchivedThreadDetail()
          : createThreadDetail(),
    );
    mockClient.reopenCodingAgentTaskThread.mockResolvedValue(true);

    await act(async () => {
      tree = TestRenderer.create(
        <TasksWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () => textOf(requireTree(tree).root).includes("Archive"),
      "expected open task detail to render",
    );

    await act(async () => {
      findButtonByText(requireTree(tree).root, "Show Archive").props.onClick();
    });

    await waitFor(
      () => textOf(requireTree(tree).root).includes("Reopen"),
      "expected archived task detail to render",
    );

    await act(async () => {
      findButtonByText(requireTree(tree).root, "Reopen").props.onClick();
    });

    await waitFor(
      () => mockClient.reopenCodingAgentTaskThread.mock.calls.length === 1,
      "expected reopen request to be sent",
    );

    expect(mockClient.reopenCodingAgentTaskThread).toHaveBeenCalledWith(
      "thread-archived",
    );
    expect(mockClient.listCodingAgentTaskThreads).toHaveBeenLastCalledWith({
      includeArchived: false,
      search: undefined,
      limit: 30,
    });
  });

  it("falls back to live PTY sessions when no persisted threads exist", async () => {
    mockUseApp.mockReturnValue({
      ptySessions: [
        {
          sessionId: "session-live-1",
          agentType: "codex",
          label: "Live Agent",
          originalTask: "Run the end-to-end verification",
          workdir: "/workspace/live",
          status: "active",
          decisionCount: 0,
          autoResolvedCount: 0,
          toolDescription: "",
          lastActivity: "Running tests",
        },
      ],
      t: (_key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? _key,
    });
    mockClient.listCodingAgentTaskThreads.mockResolvedValue([]);

    await act(async () => {
      tree = TestRenderer.create(
        <TasksWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () => textOf(requireTree(tree).root).includes("Live Agent"),
      "expected live session fallback to render",
    );

    expect(textOf(requireTree(tree).root)).toContain(
      "Run the end-to-end verification",
    );
  });

  it("surfaces persisted task thread load failures instead of showing an empty state", async () => {
    mockClient.listCodingAgentTaskThreads.mockRejectedValue(
      new Error("backend unavailable"),
    );

    await act(async () => {
      tree = TestRenderer.create(
        <TasksWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () =>
        textOf(requireTree(tree).root).includes("Failed to load task threads"),
      "expected task thread load error to render",
    );

    expect(textOf(requireTree(tree).root)).toContain(
      "Failed to load task threads: backend unavailable",
    );
  });

  it("surfaces task detail load failures for a selected persisted thread", async () => {
    mockClient.listCodingAgentTaskThreads.mockResolvedValue([createThread()]);
    mockClient.getCodingAgentTaskThread.mockRejectedValue(
      new Error("detail unavailable"),
    );

    await act(async () => {
      tree = TestRenderer.create(
        <TasksWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () =>
        textOf(requireTree(tree).root).includes("Failed to load task detail"),
      "expected task detail error to render",
    );

    expect(textOf(requireTree(tree).root)).toContain(
      "Failed to load task detail: detail unavailable",
    );
  });

  it("passes the search text through to persisted task thread queries", async () => {
    mockClient.listCodingAgentTaskThreads.mockResolvedValue([createThread()]);
    mockClient.getCodingAgentTaskThread.mockResolvedValue(createThreadDetail());

    await act(async () => {
      tree = TestRenderer.create(
        <TasksWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () => mockClient.listCodingAgentTaskThreads.mock.calls.length >= 1,
      "expected initial task thread load",
    );

    const searchInput = requireTree(tree).root.findByType("input");
    await act(async () => {
      searchInput.props.onChange({ target: { value: "failover" } });
    });

    await waitFor(
      () =>
        mockClient.listCodingAgentTaskThreads.mock.calls.some(
          ([options]) => options?.search === "failover",
        ),
      "expected search query to be forwarded",
    );
  });

  it("polls for refreshed task threads on the interval", async () => {
    vi.useFakeTimers();
    mockClient.listCodingAgentTaskThreads.mockResolvedValue([createThread()]);
    mockClient.getCodingAgentTaskThread.mockResolvedValue(createThreadDetail());

    try {
      await act(async () => {
        tree = TestRenderer.create(
          <TasksWidget events={[]} clearEvents={vi.fn()} />,
        );
      });

      expect(mockClient.listCodingAgentTaskThreads).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(5_000);
        await Promise.resolve();
      });

      expect(mockClient.listCodingAgentTaskThreads).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders derived live-session activity states and empty detail sections", async () => {
    mockUseApp.mockReturnValue({
      ptySessions: [
        {
          sessionId: "tool-running",
          agentType: "codex",
          label: "Tool Runner",
          originalTask: "Run tests",
          workdir: "/workspace/tool",
          status: "tool_running",
          toolDescription: "npm test",
          decisionCount: 0,
          autoResolvedCount: 0,
        },
        {
          sessionId: "blocked",
          agentType: "claude",
          label: "Blocked Agent",
          originalTask: "Ask for approval",
          workdir: "/workspace/blocked",
          status: "blocked",
          decisionCount: 0,
          autoResolvedCount: 0,
        },
        {
          sessionId: "active",
          agentType: "codex",
          label: "Background Agent",
          originalTask: "Watch progress",
          workdir: "/workspace/active",
          status: "active",
          decisionCount: 0,
          autoResolvedCount: 0,
        },
        {
          sessionId: "errored",
          agentType: "claude",
          label: "Errored Agent",
          originalTask: "Handle failure",
          workdir: "/workspace/error",
          status: "error",
          decisionCount: 0,
          autoResolvedCount: 0,
        },
      ],
      t: (_key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? _key,
    });
    mockClient.listCodingAgentTaskThreads.mockResolvedValue([
      {
        ...createThread(),
        summary: "",
      },
    ]);
    mockClient.getCodingAgentTaskThread.mockResolvedValue({
      ...createThreadDetail(),
      artifacts: [],
      decisions: [],
      transcripts: [],
    });

    await act(async () => {
      tree = TestRenderer.create(
        <TasksWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () =>
        textOf(requireTree(tree).root).includes("No artifacts recorded yet."),
      "expected empty detail placeholders to render",
    );

    expect(textOf(requireTree(tree).root)).toContain(
      "No artifacts recorded yet.",
    );
    expect(textOf(requireTree(tree).root)).toContain(
      "No decisions recorded yet.",
    );
    expect(textOf(requireTree(tree).root)).toContain(
      "No transcript captured yet.",
    );

    mockClient.listCodingAgentTaskThreads.mockResolvedValue([]);
    await act(async () => {
      findButtonByText(requireTree(tree).root, "Show Archive").props.onClick();
    });

    await waitFor(
      () => textOf(requireTree(tree).root).includes("Tool Runner"),
      "expected live-session fallback after switching to archive with no threads",
    );

    expect(textOf(requireTree(tree).root)).toContain("Running npm test");
    expect(textOf(requireTree(tree).root)).toContain("Waiting for input");
    expect(textOf(requireTree(tree).root)).toContain("Background Agent");
    expect(textOf(requireTree(tree).root)).not.toContain("Errored Agent");
  });
});

describe("agent orchestrator app runs widget", () => {
  let tree: TestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    mockClient.listAppRuns.mockReset();
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      appRuns: [],
      ptySessions: [],
      setState: vi.fn(),
      t: (_key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? _key,
    });
  });

  afterEach(() => {
    if (tree) {
      act(() => {
        tree?.unmount();
      });
    }
    tree = null;
  });

  it("renders live app runs with control-plane counts", async () => {
    mockClient.listAppRuns.mockResolvedValue([
      {
        runId: "run-1",
        appName: "@elizaos/app-defense-of-the-agents",
        displayName: "Defense of the Agents",
        pluginName: "@elizaos/app-defense-of-the-agents",
        launchType: "url",
        launchUrl: "https://www.defenseoftheagents.com",
        viewer: {
          url: "http://localhost:31337/api/apps/defense-of-the-agents/viewer",
          sandbox: "allow-scripts allow-same-origin allow-popups",
        },
        session: {
          sessionId: "defense-session",
          appName: "@elizaos/app-defense-of-the-agents",
          mode: "spectate-and-steer",
          status: "running",
          displayName: "Defense of the Agents",
          canSendCommands: true,
          controls: ["pause"],
          summary: "Holding mid lane with autoplay enabled.",
        },
        status: "running",
        summary: "Holding mid lane with autoplay enabled.",
        startedAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:10.000Z",
        lastHeartbeatAt: new Date().toISOString(),
        supportsBackground: true,
        viewerAttachment: "attached",
        health: {
          state: "healthy",
          message: "Holding mid lane with autoplay enabled.",
        },
      },
      {
        runId: "run-2",
        appName: "@elizaos/app-babylon",
        displayName: "Babylon",
        pluginName: "@elizaos/app-babylon",
        launchType: "url",
        launchUrl: "https://staging.babylon.market",
        viewer: null,
        session: null,
        status: "offline",
        summary: "Run session is no longer available.",
        startedAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:10.000Z",
        lastHeartbeatAt: null,
        supportsBackground: true,
        viewerAttachment: "detached",
        health: {
          state: "offline",
          message: "Run session is no longer available.",
        },
      },
    ]);

    await act(async () => {
      tree = TestRenderer.create(
        <AppsWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () => textOf(requireTree(tree).root).includes("Defense of the Agents"),
      "expected app runs to render",
    );

    expect(textOf(requireTree(tree).root)).toContain("Currently playing: 1");
    expect(textOf(requireTree(tree).root)).toContain("Background: 1");
    expect(textOf(requireTree(tree).root)).toContain("Needs attention: 1");
    expect(textOf(requireTree(tree).root)).toContain("Recovery queue");
    expect(textOf(requireTree(tree).root)).toContain("Run is offline");
    expect(textOf(requireTree(tree).root)).toContain("Babylon");
    expect(textOf(requireTree(tree).root)).toContain(
      "Run session is no longer available.",
    );
  });

  it("tolerates missing app runs before the first refresh completes", async () => {
    mockUseApp.mockReturnValue({
      appRuns: undefined,
      ptySessions: [],
      setState: vi.fn(),
      t: (_key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? _key,
    });
    mockClient.listAppRuns.mockResolvedValue([]);

    await act(async () => {
      tree = TestRenderer.create(
        <AppsWidget events={[]} clearEvents={vi.fn()} />,
      );
    });

    await waitFor(
      () => textOf(requireTree(tree).root).includes("No games are running"),
      "expected empty app-runs state after refresh",
    );

    expect(textOf(requireTree(tree).root)).toContain("No games are running");
  });
});

describe("agent orchestrator activity widget", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      ptySessions: [],
      t: (_key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? _key,
    });
  });

  it("renders activity entries and clears them through the button", async () => {
    const clearEvents = vi.fn();
    let activityTree: TestRenderer.ReactTestRenderer | null = null;
    try {
      await act(async () => {
        activityTree = TestRenderer.create(
          <ActivityWidget
            events={[
              {
                id: "event-1",
                eventType: "task_registered",
                summary: "Task started",
                timestamp: Date.now(),
              },
            ]}
            clearEvents={clearEvents}
          />,
        );
      });

      expect(textOf(requireTree(activityTree).root)).toContain("Task started");
      await act(async () => {
        findButtonByText(
          requireTree(activityTree).root,
          "Clear",
        ).props.onClick();
      });
      expect(clearEvents).toHaveBeenCalledTimes(1);
    } finally {
      if (activityTree) {
        act(() => {
          activityTree?.unmount();
        });
      }
    }
  });

  it("shows the empty activity state when there are no events", async () => {
    let activityTree: TestRenderer.ReactTestRenderer | null = null;
    try {
      await act(async () => {
        activityTree = TestRenderer.create(
          <ActivityWidget events={[]} clearEvents={vi.fn()} />,
        );
      });

      expect(textOf(requireTree(activityTree).root)).toContain(
        "No recent activity",
      );
    } finally {
      if (activityTree) {
        act(() => {
          activityTree?.unmount();
        });
      }
    }
  });
});
