import { expect, type Page, type Route, test } from "@playwright/test";
import {
  assertReadyChecks,
  installDefaultAppMocks,
  openAppPath,
  seedAppStorage,
} from "./helpers";

type ViewSpec = {
  id: string;
  path: string;
  label: string;
  allowRedirectTo?: string;
  appsDisabledExpectChatShell?: boolean;
  expectButtons?: boolean;
  readyChecks?: Array<{ selector: string } | { text: string }>;
  readyCheckMode?: "any" | "all";
};

const VIEWS: ViewSpec[] = [
  {
    id: "companion",
    path: "/companion",
    label: "Companion",
    readyChecks: [{ selector: '[data-testid="companion-root"]' }],
  },
  {
    id: "chat",
    path: "/chat",
    label: "Chat",
    allowRedirectTo: "/companion",
    readyChecks: [
      { selector: '[aria-label="Chat workspace"]' },
      { selector: '[data-testid="companion-root"]' },
    ],
    readyCheckMode: "any",
  },
  {
    id: "stream",
    path: "/stream",
    label: "Stream",
    readyChecks: [{ text: "Go Live" }, { text: "Stop Stream" }],
    readyCheckMode: "any",
  },
  {
    id: "character-select",
    path: "/character-select",
    label: "Character Select",
    expectButtons: false,
    readyChecks: [
      { selector: '[data-testid="character-roster-grid"]' },
      { selector: '[data-testid="character-customize-toggle"]' },
    ],
    readyCheckMode: "any",
  },
  {
    id: "wallets",
    path: "/wallets",
    label: "Wallets",
    readyChecks: [{ selector: '[data-testid="wallets-sidebar"]' }],
  },
  {
    id: "knowledge",
    path: "/knowledge",
    label: "Knowledge",
    readyChecks: [{ selector: '[aria-label="Knowledge upload controls"]' }],
  },
  {
    id: "connectors",
    path: "/connectors",
    label: "Connectors",
    readyChecks: [{ selector: '[data-testid="connectors-settings-sidebar"]' }],
  },
  {
    id: "settings",
    path: "/settings",
    label: "Settings",
    readyChecks: [{ selector: '[data-testid="settings-sidebar"]' }],
  },
  {
    id: "triggers",
    path: "/triggers",
    label: "Heartbeats / Triggers",
    readyChecks: [{ text: "New Heartbeat" }],
  },
  {
    id: "advanced",
    path: "/advanced",
    label: "Advanced",
    readyChecks: [{ text: "Plugins" }, { text: "Streaming" }],
    readyCheckMode: "any",
  },
  { id: "plugins", path: "/plugins", label: "Plugins" },
  { id: "skills", path: "/skills", label: "Skills" },
  { id: "actions", path: "/actions", label: "Actions" },
  { id: "trajectories", path: "/trajectories", label: "Trajectories" },
  { id: "runtime", path: "/runtime", label: "Runtime" },
  { id: "database", path: "/database", label: "Database" },
  { id: "desktop", path: "/desktop", label: "Desktop" },
  { id: "logs", path: "/logs", label: "Logs" },
  { id: "security", path: "/security", label: "Security" },
  { id: "voice", path: "/voice", label: "Voice (Settings > Media)" },
  {
    id: "apps",
    path: "/apps",
    label: "Apps",
    readyChecks: [
      { selector: '[data-testid="apps-catalog-grid"]' },
      { selector: '[data-testid="apps-detail-panel"]' },
    ],
    readyCheckMode: "all",
  },
  {
    id: "character",
    path: "/character",
    label: "Character editor",
    expectButtons: false,
    readyChecks: [
      { selector: '[data-testid="character-roster-grid"]' },
      { selector: '[data-testid="character-customize-toggle"]' },
    ],
    readyCheckMode: "any",
  },
  { id: "fine-tuning", path: "/fine-tuning", label: "Fine tuning" },
];

type MultiRunFixture = {
  apps: Array<Record<string, unknown>>;
  runs: Array<Record<string, unknown>>;
};

function buildCatalogApp(
  name: string,
  displayName: string,
  description: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    displayName,
    description,
    category: "game",
    launchType: "connect",
    launchUrl: null,
    icon: null,
    capabilities: ["commands", "telemetry"],
    stars: 0,
    repository: `https://example.com/${name}`,
    latestVersion: "1.0.0",
    supports: { v0: false, v1: false, v2: true },
    npm: {
      package: name,
      v0Version: null,
      v1Version: null,
      v2Version: "1.0.0",
    },
    viewer: {
      url: `https://example.com/viewer/${name}`,
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
    session: {
      mode: "spectate-and-steer",
      features: ["commands", "telemetry", "pause", "resume", "suggestions"],
    },
    ...overrides,
  };
}

function buildRun(
  runId: string,
  appName: string,
  displayName: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const timestamp = "2026-04-06T07:00:00.000Z";
  return {
    runId,
    appName,
    displayName,
    pluginName: appName,
    launchType: "connect",
    launchUrl: null,
    viewer: {
      url: `https://example.com/viewer/${appName}`,
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
    session: {
      sessionId: `${runId}-session`,
      appName,
      mode: "spectate-and-steer",
      status: "running",
      displayName,
      agentId: `${runId}-agent`,
      characterId: `${runId}-character`,
      followEntity: `${runId}-entity`,
      canSendCommands: true,
      controls: ["pause", "resume"],
      summary: `${displayName} session active`,
      goalLabel: `${displayName} is following the current plan`,
      suggestedPrompts: [
        `Check on ${displayName}`,
        `Steer ${displayName} toward the next objective`,
      ],
      telemetry: {
        phase: "steady",
      },
    },
    status: "running",
    summary: `${displayName} session active`,
    startedAt: timestamp,
    updatedAt: timestamp,
    lastHeartbeatAt: timestamp,
    supportsBackground: true,
    viewerAttachment: "attached",
    health: {
      state: "healthy",
      message: `${displayName} healthy`,
    },
    ...overrides,
  };
}

function createMultiRunFixture(): MultiRunFixture {
  return {
    apps: [
      buildCatalogApp(
        "@elizaos/app-hyperscape",
        "Hyperscape",
        "Spectate your agent live in a multiplayer world and steer it with real-time commands.",
        {
          session: {
            mode: "spectate-and-steer",
            features: [
              "commands",
              "telemetry",
              "pause",
              "resume",
              "suggestions",
            ],
          },
          viewer: {
            url: "https://example.com/viewer/hyperscape",
            postMessageAuth: true,
            sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
          },
        },
      ),
      buildCatalogApp(
        "@elizaos/app-babylon",
        "Babylon",
        "Dashboard your agent team, market positioning, and trade coordination.",
        {
          launchType: "url",
          viewer: {
            url: "https://example.com/viewer/babylon",
            postMessageAuth: true,
            sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
          },
        },
      ),
      buildCatalogApp(
        "@elizaos/app-2004scape",
        "2004scape",
        "Launch a retro MMO bot that keeps playing when you detach.",
        {
          launchType: "connect",
          viewer: {
            url: "https://example.com/viewer/2004scape",
            postMessageAuth: true,
            sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
          },
        },
      ),
      buildCatalogApp(
        "@elizaos/app-defense-of-the-agents",
        "Defense of the Agents",
        "Watch the lane defense loop, telemetry, and scripts in one place.",
        {
          launchType: "url",
          viewer: {
            url: "https://example.com/viewer/defense",
            postMessageAuth: true,
            sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
          },
        },
      ),
      buildCatalogApp(
        "@elizaos/app-dungeons",
        "Dungeons",
        "Hidden legacy app that should stay out of the curated catalog.",
      ),
      buildCatalogApp(
        "@elizaos/app-agent-town",
        "Agent Town",
        "Hidden legacy app that should stay out of the curated catalog.",
      ),
    ],
    runs: [
      buildRun("run-hyperscape", "@elizaos/app-hyperscape", "Hyperscape", {
        summary: "Scout is following the moon gate.",
        status: "running",
        viewerAttachment: "attached",
        health: { state: "healthy", message: "Scout is live in Hyperscape" },
        session: {
          sessionId: "run-hyperscape-session",
          appName: "@elizaos/app-hyperscape",
          mode: "spectate-and-steer",
          status: "running",
          displayName: "Hyperscape",
          agentId: "agent-hyper",
          characterId: "char-hyper",
          followEntity: "entity-hyper",
          canSendCommands: true,
          controls: ["pause"],
          summary: "Scout is following the moon gate.",
          goalLabel: "Scout the bazaar perimeter.",
          suggestedPrompts: ["Check the moon gate", "Report nearby players"],
          telemetry: {
            zone: "Liminal Bazaar",
          },
        },
      }),
      buildRun("run-babylon", "@elizaos/app-babylon", "Babylon", {
        summary: "Babylon is coordinating the team before the next buy.",
        status: "running",
        viewerAttachment: "detached",
        health: {
          state: "degraded",
          message: "Babylon is waiting on the market refresh.",
        },
        session: {
          sessionId: "run-babylon-session",
          appName: "@elizaos/app-babylon",
          mode: "spectate-and-steer",
          status: "running",
          displayName: "Babylon",
          agentId: "agent-babylon",
          canSendCommands: true,
          controls: ["pause", "resume"],
          summary: "Babylon is coordinating the team before the next buy.",
          goalLabel: "Keep the desk aligned before buying.",
          suggestedPrompts: [
            "Check the team inventory",
            "Review the market before buying",
          ],
          telemetry: {
            teamState: "coordinating",
            market: "watching",
          },
        },
      }),
      buildRun("run-2004scape", "@elizaos/app-2004scape", "2004scape", {
        summary: "Bot is mining safely in the background.",
        status: "running",
        viewerAttachment: "detached",
        health: {
          state: "healthy",
          message: "2004scape bot is still active while detached.",
        },
        session: {
          sessionId: "run-2004scape-session",
          appName: "@elizaos/app-2004scape",
          mode: "viewer",
          status: "running",
          displayName: "2004scape",
          agentId: "agent-2004",
          canSendCommands: false,
          controls: [],
          summary: "Bot is mining safely in the background.",
          goalLabel: "Keep the bot grinding and bank before danger.",
          suggestedPrompts: ["Check inventory", "Keep the bot alive"],
          telemetry: {
            skill: "woodcutting",
            location: "Varrock outskirts",
          },
        },
      }),
      buildRun(
        "run-defense",
        "@elizaos/app-defense-of-the-agents",
        "Defense of the Agents",
        {
          summary: "Defense is running from the operator dashboard.",
          status: "running",
          viewer: null,
          viewerAttachment: "unavailable",
          health: {
            state: "offline",
            message: "Viewer not available in the smoke fixture.",
          },
          session: {
            sessionId: "run-defense-session",
            appName: "@elizaos/app-defense-of-the-agents",
            mode: "spectate-and-steer",
            status: "running",
            displayName: "Defense of the Agents",
            agentId: "agent-defense",
            canSendCommands: true,
            controls: ["pause", "resume"],
            summary: "Defense is running from the operator dashboard.",
            goalLabel: "Hold the center lane and report pressure.",
            suggestedPrompts: ["Report lane pressure", "Hold mid lane"],
            telemetry: {
              heroLane: "mid",
              strategyVersion: 4,
            },
          },
        },
      ),
    ],
  };
}

async function fulfillJson(route: Route, payload: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function installAppsControlPlaneMocks(
  page: Page,
  fixture: MultiRunFixture,
): Promise<void> {
  await page.route("**/api/apps**", async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;
    const method = route.request().method();

    if (method === "GET" && pathname === "/api/apps") {
      await fulfillJson(route, fixture.apps);
      return;
    }

    if (method === "GET" && pathname === "/api/apps/installed") {
      await fulfillJson(
        route,
        fixture.apps.map((app) => ({
          name: app.name,
          displayName: app.displayName,
          pluginName: app.name,
          version: "1.0.0",
          installedAt: "2026-04-06T00:00:00.000Z",
          isRunning: fixture.runs.some((run) => run.appName === app.name),
        })),
      );
      return;
    }

    if (method === "GET" && pathname === "/api/apps/runs") {
      await fulfillJson(route, fixture.runs);
      return;
    }

    if (method === "POST" && pathname.startsWith("/api/apps/runs/")) {
      const [runId, action] = pathname
        .slice("/api/apps/runs/".length)
        .split("/");
      const runIndex = fixture.runs.findIndex((run) => run.runId === runId);
      if (runIndex < 0) {
        await fulfillJson(route, {
          success: false,
          message: `Unknown run: ${runId}`,
        });
        return;
      }

      const current = fixture.runs[runIndex];
      if (action === "attach") {
        const next = {
          ...current,
          viewerAttachment: "attached",
          health: {
            state: "healthy",
            message: `${current.displayName} reattached successfully.`,
          },
          summary: `${current.displayName} viewer reattached.`,
        };
        fixture.runs[runIndex] = next;
        await fulfillJson(route, {
          success: true,
          message: `${current.displayName} attached.`,
          run: next,
        });
        return;
      }

      if (action === "detach") {
        const next = {
          ...current,
          viewerAttachment: current.viewer ? "detached" : "unavailable",
          summary: `${current.displayName} detached from the viewer.`,
        };
        fixture.runs[runIndex] = next;
        await fulfillJson(route, {
          success: true,
          message: `${current.displayName} detached.`,
          run: next,
        });
        return;
      }

      if (action === "stop") {
        fixture.runs.splice(runIndex, 1);
        await fulfillJson(route, {
          success: true,
          appName: current.appName,
          runId: current.runId,
          stoppedAt: "2026-04-06T07:15:00.000Z",
          pluginUninstalled: false,
          needsRestart: false,
          stopScope: "viewer-session",
          message: `${current.displayName} stopped.`,
        });
        return;
      }
    }

    if (method === "GET" && pathname.startsWith("/api/apps/info/")) {
      const appName = decodeURIComponent(
        pathname.slice("/api/apps/info/".length),
      );
      const app = fixture.apps.find((entry) => entry.name === appName);
      if (app) {
        await fulfillJson(route, app);
        return;
      }
    }

    if (method === "GET" && pathname.startsWith("/api/apps/search")) {
      await fulfillJson(route, fixture.apps);
      return;
    }

    if (method === "POST" && pathname === "/api/apps/launch") {
      await fulfillJson(route, {
        pluginInstalled: true,
        needsRestart: false,
        displayName: "Smoke App",
        launchType: "connect",
        launchUrl: null,
        viewer: null,
        session: null,
        run: null,
      });
      return;
    }

    await route.fallback();
  });
}

test.beforeEach(async ({ page }) => {
  await installDefaultAppMocks(page);
  await seedAppStorage(page);
});

for (const view of VIEWS) {
  test(`[${view.id}] ${view.label} view loads`, async ({ page }) => {
    await openAppPath(page, view.path);

    const currentUrl = page.url();
    if (view.allowRedirectTo) {
      expect(
        currentUrl.includes(view.path) ||
          currentUrl.includes(view.allowRedirectTo),
      ).toBe(true);
    }

    if (view.appsDisabledExpectChatShell) {
      expect(
        currentUrl.includes("/chat") ||
          currentUrl.includes("/companion") ||
          currentUrl.includes("/apps"),
      ).toBe(true);
    }

    if (view.readyChecks?.length) {
      await assertReadyChecks(
        page,
        `${view.label} (${view.id})`,
        view.readyChecks,
        view.readyCheckMode,
      );
    }

    if (view.expectButtons !== false) {
      await expect
        .poll(async () => page.locator("button").count(), {
          message: `${view.label} should expose interactive buttons`,
        })
        .toBeGreaterThan(0);
    }
  });
}

test("Rapid view traversal without crash", async ({ page }) => {
  for (const view of VIEWS) {
    await openAppPath(page, view.path);
  }
});

test("Apps view shows curated multi-run state for Babylon and 2004scape", async ({
  page,
}) => {
  const fixture = createMultiRunFixture();
  await installAppsControlPlaneMocks(page, fixture);
  await openAppPath(page, "/apps");

  await expect(page.getByTestId("apps-catalog-grid")).toContainText(
    "Hyperscape",
  );
  await expect(page.getByTestId("apps-catalog-grid")).toContainText("Babylon");
  await expect(page.getByTestId("apps-catalog-grid")).toContainText(
    "2004scape",
  );
  await expect(page.getByRole("button", { name: /Open Dungeons/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: /Open Agent Town/ }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: /Running \(4\)/ }).click();
  await expect(page.getByTestId("apps-session-status-card")).toContainText(
    "4 runs active",
  );
  await expect(page.getByRole("button", { name: /Hyperscape/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Babylon/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /2004scape/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Defense of the Agents/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Babylon/ }).click();
  const babylonDetails = page
    .locator("section")
    .filter({
      hasText: "Running now",
    })
    .last();
  await expect(page.getByText("Babylon").last()).toBeVisible();
  await expect(
    page
      .getByText("Babylon is coordinating the team before the next buy.")
      .last(),
  ).toBeVisible();
  await expect(
    page.getByText("Keep the desk aligned before buying.").last(),
  ).toBeVisible();
  await expect(
    babylonDetails.getByRole("button", { name: "Reattach viewer" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /2004scape/ }).click();
  const scapeDetails = page
    .locator("section")
    .filter({
      hasText: "Running now",
    })
    .last();
  await expect(page.getByText("2004scape").last()).toBeVisible();
  await expect(
    page.getByText("Bot is mining safely in the background.").last(),
  ).toBeVisible();
  await expect(
    page.getByText("Keep the bot grinding and bank before danger.").last(),
  ).toBeVisible();
  await expect(
    scapeDetails.getByRole("button", { name: "Reattach viewer" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Defense of the Agents/ }).click();
  const defenseDetails = page
    .locator("section")
    .filter({
      hasText: "Running now",
    })
    .last();
  await expect(
    defenseDetails.getByText("No viewer surface is available"),
  ).toBeVisible();
  await expect(
    defenseDetails.getByRole("button", { name: "Inspect run" }),
  ).toBeVisible();
  await defenseDetails.getByRole("button", { name: "Stop run" }).click();
  await expect(page.getByTestId("apps-session-status-card")).toContainText(
    "3 runs active",
  );
});
