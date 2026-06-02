// @milady-live-audit allow-route-fixtures
import { expect, type Page, type Route, test } from "@playwright/test";
import {
  installDefaultAppRoutes,
  openAppPath,
  seedAppStorage,
} from "./helpers";

const NOW = Date.parse("2026-05-30T18:00:00.000Z");
const ISO = "2026-05-30T18:00:00.000Z";

const usage = {
  inputTokens: 16_200,
  outputTokens: 4_850,
  reasoningTokens: 1_240,
  cacheTokens: 800,
  totalTokens: 22_290,
  costUsd: 0.0234,
  state: "measured",
  byProvider: [
    {
      provider: "cerebras",
      model: "gpt-oss-120b",
      inputTokens: 16_200,
      outputTokens: 4_850,
      reasoningTokens: 1_240,
      cacheTokens: 800,
      totalTokens: 22_290,
      costUsd: 0.0234,
      state: "measured",
    },
  ],
};

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-pixel-notes",
    title: "Build Pixel Notes app",
    kind: "coding",
    status: "active",
    priority: "high",
    paused: false,
    originalRequest:
      "Build a small notes app with Codex and verify it in browser.",
    summary: "Codex is scaffolding the notes UI and smoke tests.",
    sessionCount: 2,
    activeSessionCount: 1,
    latestSessionId: "session-codex",
    latestSessionLabel: "Codex builder",
    latestWorkdir: "/tmp/milady-orchestrator/pixel-notes",
    latestRepo: "/home/shaw/milady",
    latestActivityAt: NOW - 30_000,
    decisionCount: 3,
    usage,
    createdAt: ISO,
    updatedAt: ISO,
    closedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...task(),
    goal: "Create a working notes app with add, edit, delete, persistence, and a verified browser smoke path.",
    roomId: "room-pixel-notes",
    taskRoomId: "room-pixel-notes",
    worldId: "world-local",
    ownerUserId: "playwright-smoke-owner",
    parentTaskId: null,
    acceptanceCriteria: [
      "The app can create and delete notes.",
      "State persists after reload.",
      "E2E smoke confirms visible notes on screen.",
    ],
    currentPlan: {
      summary: "Build, run, verify, and report evidence.",
      steps: [
        { title: "Scaffold app shell", status: "done" },
        { title: "Wire persistence", status: "in_progress" },
        { title: "Run browser smoke", status: "pending" },
      ],
    },
    providerPolicy: {
      preferredFramework: "codex",
      providerSource: "codex-cli",
      model: "gpt-oss-120b",
    },
    lastUserTurnAt: ISO,
    lastCoordinatorTurnAt: ISO,
    metadata: {},
    sessions: [
      {
        id: "session-row-codex",
        threadId: "task-pixel-notes",
        sessionId: "session-codex",
        framework: "codex",
        providerSource: "codex-cli",
        model: "gpt-oss-120b",
        label: "Codex builder",
        originalTask: "Implement the Pixel Notes app.",
        workdir: "/tmp/milady-orchestrator/pixel-notes",
        repo: "/home/shaw/milady",
        status: "running",
        activeTool: "bun test",
        decisionCount: 2,
        autoResolvedCount: 1,
        registeredAt: NOW - 120_000,
        lastActivityAt: NOW - 30_000,
        idleCheckCount: 0,
        taskDelivered: true,
        completionSummary: null,
        lastSeenDecisionIndex: 2,
        lastInputSentAt: NOW - 60_000,
        stoppedAt: null,
        inputTokens: 12_000,
        outputTokens: 3_400,
        reasoningTokens: 900,
        totalTokens: 16_300,
        cacheTokens: 400,
        costUsd: 0.018,
        usageState: "measured",
        metadata: {
          workspaceChanges: {
            changedFiles: ["src/App.tsx", "tests/notes.spec.ts"],
            totalChangedFiles: 2,
          },
        },
        createdAt: ISO,
        updatedAt: ISO,
      },
      {
        id: "session-row-eliza",
        threadId: "task-pixel-notes",
        sessionId: "session-eliza",
        framework: "eliza",
        providerSource: "cerebras",
        model: "gpt-oss-120b",
        label: "Eliza reviewer",
        originalTask: "Review requirements and validation evidence.",
        workdir: "/home/shaw/milady",
        repo: "/home/shaw/milady",
        status: "completed",
        activeTool: null,
        decisionCount: 1,
        autoResolvedCount: 0,
        registeredAt: NOW - 180_000,
        lastActivityAt: NOW - 90_000,
        idleCheckCount: 0,
        taskDelivered: true,
        completionSummary: "Review plan accepted.",
        lastSeenDecisionIndex: 1,
        lastInputSentAt: NOW - 100_000,
        stoppedAt: NOW - 80_000,
        inputTokens: 4_200,
        outputTokens: 1_450,
        reasoningTokens: 340,
        totalTokens: 5_990,
        cacheTokens: 400,
        costUsd: 0.0054,
        usageState: "measured",
        metadata: {},
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
    decisions: [
      {
        id: "decision-1",
        threadId: "task-pixel-notes",
        sessionId: "session-eliza",
        event: "planner",
        promptText: "Pick implementation path",
        decision: "spawn_codex",
        response: null,
        reasoning: "Codex CLI is authenticated locally and matches the task.",
        timestamp: NOW - 110_000,
        createdAt: ISO,
      },
    ],
    events: [
      {
        id: "event-1",
        threadId: "task-pixel-notes",
        sessionId: "session-codex",
        eventType: "agent_spawned",
        timestamp: NOW - 100_000,
        summary: "Codex builder spawned with gpt-oss-120b policy",
        data: {},
        createdAt: ISO,
      },
      {
        id: "event-2",
        threadId: "task-pixel-notes",
        sessionId: "session-codex",
        eventType: "tool_running",
        timestamp: NOW - 30_000,
        summary: "Codex builder is running bun test",
        data: {},
        createdAt: ISO,
      },
    ],
    artifacts: [
      {
        id: "artifact-1",
        threadId: "task-pixel-notes",
        sessionId: "session-codex",
        artifactType: "app",
        title: "Pixel Notes app",
        path: "apps/pixel-notes",
        uri: null,
        mimeType: null,
        verificationStatus: "pending",
        metadata: {},
        createdAt: ISO,
      },
    ],
    messages: [],
    transcripts: [],
    ...overrides,
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installOrchestratorRoutes(page: Page, initialTask = detail()) {
  let currentTask = initialTask;
  const postedMessages: string[] = [];
  const addedAgents: unknown[] = [];
  const createdTasks: unknown[] = [];
  const validations: unknown[] = [];

  const currentTasks = () => [
    task({
      id: currentTask.id,
      title: currentTask.title,
      kind: currentTask.kind,
      status: currentTask.status,
      priority: currentTask.priority,
      paused: currentTask.paused,
      originalRequest: currentTask.originalRequest,
      summary: currentTask.summary,
      sessionCount: currentTask.sessionCount,
      activeSessionCount: currentTask.activeSessionCount,
      latestSessionId: currentTask.latestSessionId,
      latestSessionLabel: currentTask.latestSessionLabel,
      latestWorkdir: currentTask.latestWorkdir,
      latestRepo: currentTask.latestRepo,
      latestActivityAt: currentTask.latestActivityAt,
      decisionCount: currentTask.decisionCount,
      usage: currentTask.usage,
      createdAt: currentTask.createdAt,
      updatedAt: currentTask.updatedAt,
      closedAt: currentTask.closedAt,
      archivedAt: currentTask.archivedAt,
    }),
  ];

  await page.route("**/api/orchestrator/status", async (route) => {
    await fulfillJson(route, {
      taskCount: 1,
      activeTaskCount: currentTask.status === "active" ? 1 : 0,
      pausedTaskCount: currentTask.paused ? 1 : 0,
      blockedTaskCount: 0,
      validatingTaskCount: currentTask.status === "validating" ? 1 : 0,
      sessionCount: currentTask.sessionCount,
      activeSessionCount: currentTask.activeSessionCount,
      usage,
      byStatus: {
        open: 0,
        active: currentTask.status === "active" ? 1 : 0,
        waiting_on_user: 0,
        blocked: 0,
        validating: currentTask.status === "validating" ? 1 : 0,
        done: 0,
        failed: 0,
        archived: 0,
        interrupted: 0,
      },
    });
  });

  const handleTasksRoute = async (route: Route) => {
    const method = route.request().method();
    if (method === "GET") {
      await fulfillJson(route, { tasks: currentTasks() });
      return;
    }
    if (method === "POST") {
      const input = route.request().postDataJSON() as {
        title: string;
        goal: string;
        priority?: "low" | "normal" | "high" | "urgent";
        acceptanceCriteria?: string[];
      };
      createdTasks.push(input);
      currentTask = detail({
        id: "task-created-pomodoro",
        title: input.title,
        goal: input.goal,
        originalRequest: input.goal,
        priority: input.priority ?? "normal",
        acceptanceCriteria: input.acceptanceCriteria ?? [],
      });
      await fulfillJson(route, currentTask);
      return;
    }
    await route.fallback();
  };
  await page.route("**/api/orchestrator/tasks", handleTasksRoute);
  await page.route("**/api/orchestrator/tasks?*", handleTasksRoute);

  const handleMessagesRoute = async (route: Route) => {
    const method = route.request().method();
    if (method === "GET") {
      await fulfillJson(route, {
        items: [
          {
            id: "message-user-1",
            threadId: currentTask.id,
            sessionId: null,
            senderKind: "user",
            direction: "stdin",
            content: "Please build the app and show browser evidence.",
            timestamp: NOW - 130_000,
            metadata: {},
            createdAt: ISO,
          },
          {
            id: "message-orchestrator-1",
            threadId: currentTask.id,
            sessionId: null,
            senderKind: "orchestrator",
            direction: "system",
            content: "I will spawn Codex and verify visible UI state.",
            timestamp: NOW - 120_000,
            metadata: {},
            createdAt: ISO,
          },
          {
            id: "message-codex-1",
            threadId: currentTask.id,
            sessionId: "session-codex",
            senderKind: "sub_agent",
            direction: "stdout",
            content: "Created the notes app shell and added Playwright checks.",
            timestamp: NOW - 60_000,
            metadata: {},
            createdAt: ISO,
          },
          ...postedMessages.map((content, index) => ({
            id: `message-posted-${index}`,
            threadId: currentTask.id,
            sessionId: null,
            senderKind: "user" as const,
            direction: "stdin" as const,
            content,
            timestamp: NOW + index,
            metadata: {},
            createdAt: ISO,
          })),
        ],
        nextCursor: null,
      });
      return;
    }
    if (method === "POST") {
      postedMessages.push(
        (route.request().postDataJSON() as { content: string }).content,
      );
      await fulfillJson(route, {
        recorded: true,
        forwardedTo: ["session-codex"],
        failedTo: [],
      });
      return;
    }
    await route.fallback();
  };
  await page.route("**/api/orchestrator/tasks/*/messages", handleMessagesRoute);
  await page.route(
    "**/api/orchestrator/tasks/*/messages?*",
    handleMessagesRoute,
  );

  const handleEventsRoute = async (route: Route) => {
    await fulfillJson(route, { items: currentTask.events, nextCursor: null });
  };
  await page.route("**/api/orchestrator/tasks/*/events", handleEventsRoute);
  await page.route("**/api/orchestrator/tasks/*/events?*", handleEventsRoute);

  await page.route("**/api/orchestrator/tasks/*/agents", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    addedAgents.push(route.request().postDataJSON());
    currentTask = detail({
      sessionCount: 3,
      activeSessionCount: 2,
    });
    await fulfillJson(route, currentTask);
  });

  await page.route("**/api/orchestrator/tasks/*/validate", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const input = route.request().postDataJSON() as {
      passed: boolean;
      humanOverride?: boolean;
    };
    validations.push(input);
    currentTask = detail({
      ...currentTask,
      status: input.passed ? "done" : "active",
      closedAt: input.passed ? ISO : null,
      events: [
        ...currentTask.events,
        {
          id: `validation-${validations.length}`,
          threadId: currentTask.id,
          sessionId: null,
          eventType: input.passed ? "validation_passed" : "validation_failed",
          summary: input.passed
            ? "Human approved in the orchestrator UI."
            : "Human rejected in the orchestrator UI.",
          data: { humanOverride: input.humanOverride === true },
          timestamp: NOW + validations.length,
          createdAt: ISO,
        },
      ],
    });
    await fulfillJson(route, currentTask);
  });

  await page.route("**/api/orchestrator/tasks/*", async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 4) {
      await route.fallback();
      return;
    }
    if (method === "GET") {
      await fulfillJson(route, currentTask);
      return;
    }
    if (method === "PATCH") {
      currentTask = detail({
        ...currentTask,
        ...(route.request().postDataJSON() as Record<string, unknown>),
      });
      await fulfillJson(route, currentTask);
      return;
    }
    await route.fallback();
  });

  return { postedMessages, addedAgents, createdTasks, validations };
}

function manyTaskFixtures() {
  const active = Array.from({ length: 10 }, (_, index) =>
    task({
      id: `task-active-${index + 1}`,
      title: `Active app build ${index + 1}`,
      status: "active",
      priority: index === 0 ? "urgent" : "normal",
      sessionCount: 2,
      activeSessionCount: 2,
      latestSessionLabel: `Codex worker ${index + 1}`,
      latestActivityAt: NOW - index * 10_000,
      usage: {
        ...usage,
        totalTokens: usage.totalTokens + index,
      },
    }),
  );
  const archived = Array.from({ length: 20 }, (_, index) =>
    task({
      id: `task-archived-${index + 1}`,
      title: `Archived app build ${index + 1}`,
      status: "archived",
      priority: "low",
      sessionCount: 1,
      activeSessionCount: 0,
      latestSessionLabel: `Eliza reviewer ${index + 1}`,
      latestActivityAt: NOW - (index + 20) * 10_000,
      closedAt: ISO,
      archivedAt: ISO,
    }),
  );
  return { active, archived, all: [...active, ...archived] };
}

async function installManyOrchestratorRoutes(page: Page) {
  const fixtures = manyTaskFixtures();
  const byId = new Map(
    fixtures.all.map((item) => [
      item.id,
      detail({
        ...item,
        goal: `Build and verify ${item.title} with visible browser evidence.`,
        roomId: `room-${item.id}`,
        taskRoomId: `room-${item.id}`,
        acceptanceCriteria: [
          "Implementation committed in the workdir.",
          "E2E test checks expected screen data.",
          "Status report is posted back to the task room.",
        ],
        sessions:
          item.status === "archived"
            ? [
                {
                  ...detail().sessions[1],
                  id: `session-row-${item.id}`,
                  threadId: item.id,
                  sessionId: `session-${item.id}`,
                  label: item.latestSessionLabel,
                  status: "completed",
                },
              ]
            : [
                {
                  ...detail().sessions[0],
                  id: `session-row-${item.id}-codex`,
                  threadId: item.id,
                  sessionId: `session-${item.id}-codex`,
                  label: item.latestSessionLabel,
                },
                {
                  ...detail().sessions[1],
                  id: `session-row-${item.id}-eliza`,
                  threadId: item.id,
                  sessionId: `session-${item.id}-eliza`,
                  label: `Eliza reviewer ${item.id.split("-").at(-1)}`,
                },
              ],
      }),
    ]),
  );

  await page.route("**/api/orchestrator/status", async (route) => {
    await fulfillJson(route, {
      taskCount: fixtures.active.length,
      activeTaskCount: fixtures.active.length,
      pausedTaskCount: 0,
      blockedTaskCount: 0,
      validatingTaskCount: 0,
      sessionCount: fixtures.active.length * 2,
      activeSessionCount: fixtures.active.length * 2,
      usage,
      byStatus: {
        open: 0,
        active: fixtures.active.length,
        waiting_on_user: 0,
        blocked: 0,
        validating: 0,
        done: 0,
        failed: 0,
        archived: 0,
        interrupted: 0,
      },
    });
  });

  await page.route("**/api/orchestrator/tasks", async (route) => {
    const url = new URL(route.request().url());
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const search = url.searchParams.get("search")?.toLowerCase() ?? "";
    const rows = (includeArchived ? fixtures.all : fixtures.active).filter(
      (item) => !search || item.title.toLowerCase().includes(search),
    );
    await fulfillJson(route, { tasks: rows });
  });
  await page.route("**/api/orchestrator/tasks?*", async (route) => {
    const url = new URL(route.request().url());
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const search = url.searchParams.get("search")?.toLowerCase() ?? "";
    const rows = (includeArchived ? fixtures.all : fixtures.active).filter(
      (item) => !search || item.title.toLowerCase().includes(search),
    );
    await fulfillJson(route, { tasks: rows });
  });

  const handleScaleMessagesRoute = async (route: Route) => {
    await fulfillJson(route, {
      items: [
        {
          id: "message-scale-status",
          threadId: "task-active-1",
          sessionId: "session-task-active-1-codex",
          senderKind: "sub_agent",
          direction: "stdout",
          content: "Status: browser E2E is checking visible screen data.",
          timestamp: NOW,
          metadata: {},
          createdAt: ISO,
        },
      ],
      nextCursor: null,
    });
  };
  await page.route(
    "**/api/orchestrator/tasks/*/messages",
    handleScaleMessagesRoute,
  );
  await page.route(
    "**/api/orchestrator/tasks/*/messages?*",
    handleScaleMessagesRoute,
  );
  const handleScaleEventsRoute = async (route: Route) => {
    await fulfillJson(route, {
      items: [
        {
          id: "event-scale-command",
          threadId: "task-active-1",
          sessionId: "session-task-active-1-codex",
          eventType: "tool_running",
          summary: "Codex worker is running bun test --filter visible-data",
          data: {},
          timestamp: NOW + 1,
          createdAt: ISO,
        },
      ],
      nextCursor: null,
    });
  };
  await page.route(
    "**/api/orchestrator/tasks/*/events",
    handleScaleEventsRoute,
  );
  await page.route(
    "**/api/orchestrator/tasks/*/events?*",
    handleScaleEventsRoute,
  );
  await page.route("**/api/orchestrator/tasks/*", async (route) => {
    const segments = new URL(route.request().url()).pathname
      .split("/")
      .filter(Boolean);
    if (segments.length !== 4) {
      await route.fallback();
      return;
    }
    const id = segments[3];
    const found = id ? byId.get(id) : undefined;
    await fulfillJson(
      route,
      found ?? { error: "Task not found" },
      found ? 200 : 404,
    );
  });
}

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
  await installDefaultAppRoutes(page);
});

test("orchestrator workbench renders live task data and supports task operations", async ({
  page,
}) => {
  const routeState = await installOrchestratorRoutes(page);

  await openAppPath(page, "/orchestrator");
  await expect(page).toHaveURL(/\/orchestrator$/);
  await expect(page.getByTestId("orchestrator-workbench")).toBeVisible();

  await expect(page.getByText("Orchestrator", { exact: true })).toBeVisible();
  await expect(page.getByTestId("orchestrator-workbench")).toContainText(
    /1\s*tasks/,
  );
  await expect(page.getByTestId("orchestrator-workbench")).toContainText(
    /1\s*active/,
  );
  await expect(page.getByTestId("orchestrator-workbench")).toContainText(
    /1\/2\s*agents/,
  );
  await expect(page.getByText("Build Pixel Notes app")).toBeVisible();
  await expect(page.getByTestId("orchestrator-workbench")).toContainText(
    "22.3K",
  );

  await page.getByTestId("orchestrator-task-item").first().click();
  await expect(page.getByTestId("orchestrator-timeline")).toContainText(
    "I will spawn Codex and verify visible UI state.",
  );
  await expect(page.getByTestId("orchestrator-timeline")).toContainText(
    "Created the notes app shell and added Playwright checks.",
  );
  await expect(page.getByTestId("orchestrator-inspector")).toContainText(
    "Create a working notes app",
  );
  await expect(page.getByTestId("orchestrator-inspector")).toContainText(
    "Codex builder",
  );
  await expect(page.getByTestId("orchestrator-inspector")).toContainText(
    "gpt-oss-120b",
  );
  await expect(page.getByTestId("orchestrator-inspector")).toContainText(
    "The app can create and delete notes.",
  );
  await expect(page.getByTestId("orchestrator-inspector")).toContainText(
    "Pixel Notes app",
  );

  await page
    .getByTestId("orchestrator-composer")
    .fill(
      "After the app builds, run the browser smoke and report visible notes.",
    );
  await page.getByTestId("orchestrator-send").click();
  await expect
    .poll(() => routeState.postedMessages)
    .toContain(
      "After the app builds, run the browser smoke and report visible notes.",
    );
  await expect(page.getByTestId("orchestrator-composer")).toHaveValue("");
  await expect(page.getByTestId("orchestrator-timeline")).toContainText(
    "After the app builds, run the browser smoke and report visible notes.",
  );

  await page.getByTestId("orchestrator-add-agent").click();
  await page.getByTestId("orchestrator-add-agent-label").fill("Codex verifier");
  await page.getByLabel("Framework").fill("codex");
  await page.getByLabel("Model").fill("gpt-oss-120b");
  await page
    .getByLabel("Sub-task for this agent (optional)")
    .fill("Verify the app with browser E2E and screenshot evidence.");
  await page.getByTestId("orchestrator-add-agent-submit").click();
  await expect.poll(() => routeState.addedAgents.length).toBe(1);
  await expect
    .poll(() => routeState.addedAgents[0])
    .toMatchObject({
      framework: "codex",
      model: "gpt-oss-120b",
      label: "Codex verifier",
      task: "Verify the app with browser E2E and screenshot evidence.",
    });
  await expect(page.getByTestId("orchestrator-workbench")).toContainText(
    /2\/3\s*agents/,
  );

  await page.getByTestId("orchestrator-new-task").click();
  await expect(page.getByTestId("orchestrator-create-dialog")).toBeVisible();
  await page
    .getByTestId("orchestrator-create-title")
    .fill("Build Pomodoro app");
  await page
    .getByTestId("orchestrator-create-goal")
    .fill("Build a timer app and verify countdown controls on screen.");
  await page
    .getByTestId("orchestrator-create-acceptance")
    .fill("Timer starts\nTimer pauses\nE2E sees the countdown");
  await page.getByTestId("orchestrator-create-submit").click();
  await expect
    .poll(() => routeState.createdTasks[0])
    .toMatchObject({
      title: "Build Pomodoro app",
      goal: "Build a timer app and verify countdown controls on screen.",
      priority: "normal",
      acceptanceCriteria: [
        "Timer starts",
        "Timer pauses",
        "E2E sees the countdown",
      ],
    });
  await expect(page.getByText("Build Pomodoro app")).toBeVisible();
  await expect(page.getByTestId("orchestrator-inspector")).toContainText(
    "Build a timer app and verify countdown controls on screen.",
  );
  await expect(page.getByTestId("orchestrator-inspector")).toContainText(
    "Timer starts",
  );
  await expect(page.getByTestId("orchestrator-inspector")).toContainText(
    "Timer pauses",
  );
});

test("orchestrator validation actions supply human evidence", async ({
  page,
}) => {
  const routeState = await installOrchestratorRoutes(
    page,
    detail({
      id: "task-validate-notes",
      title: "Validate Notes release",
      status: "validating",
      activeSessionCount: 0,
      summary: "Waiting for human validation.",
    }),
  );

  await openAppPath(page, "/orchestrator");
  await page.getByTestId("orchestrator-task-item").first().click();
  await expect(page.getByTestId("orchestrator-approve")).toBeVisible();
  await page.getByTestId("orchestrator-approve").click();
  await expect
    .poll(() => routeState.validations[0])
    .toMatchObject({
      passed: true,
      humanOverride: true,
    });
  await expect(page.getByTestId("orchestrator-timeline")).toContainText(
    "Human approved in the orchestrator UI.",
  );
});

test("orchestrator handles ten active tasks and twenty archived tasks", async ({
  page,
}) => {
  await installManyOrchestratorRoutes(page);

  await openAppPath(page, "/orchestrator");
  await expect(page.getByTestId("orchestrator-workbench")).toBeVisible();
  await expect(page.getByTestId("orchestrator-workbench")).toContainText(
    /10\s*tasks/,
  );
  await expect(page.getByTestId("orchestrator-workbench")).toContainText(
    /10\s*active/,
  );
  await expect(page.getByTestId("orchestrator-workbench")).toContainText(
    /20\/20\s*agents/,
  );
  await expect(page.getByTestId("orchestrator-task-item")).toHaveCount(10);
  await expect(
    page.locator('[data-agent-label="Active app build 1"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-agent-label="Archived app build 1"]'),
  ).toHaveCount(0);

  await page.getByTestId("orchestrator-show-archived").check();
  await expect(page.getByTestId("orchestrator-task-item")).toHaveCount(30);
  await expect(
    page.locator('[data-agent-label="Archived app build 20"]'),
  ).toBeVisible();

  await page.locator('[data-agent-label="Active app build 1"]').click();
  await expect(page.getByTestId("orchestrator-timeline")).toContainText(
    "Status: browser E2E is checking visible screen data.",
  );
  await expect(page.getByTestId("orchestrator-timeline")).toContainText(
    "Codex worker is running bun test --filter visible-data",
  );
  await expect(page.getByTestId("orchestrator-inspector")).toContainText(
    "Build and verify Active app build 1",
  );
  await expect(page.getByTestId("orchestrator-inspector")).toContainText(
    "Status report is posted back to the task room.",
  );
});
