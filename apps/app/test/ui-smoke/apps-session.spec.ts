import { expect, test } from "@playwright/test";
import { assertReadyChecks, openAppPath, seedAppStorage } from "./helpers";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DIRECT_ROUTE_CASES = [
  {
    name: "lifeops",
    path: "/apps/lifeops",
    selector: '[data-testid="lifeops-shell"]',
  },
  {
    name: "tasks",
    path: "/apps/tasks",
    selector: '[data-testid="automations-shell"]',
  },
  {
    name: "plugins",
    path: "/apps/plugins",
    readyChecks: [{ text: "AI Providers" }, { text: "Other Features" }],
    timeoutMs: 60_000,
  },
  {
    name: "skills",
    path: "/apps/skills",
    selector: '[data-testid="skills-shell"]',
    timeoutMs: 20_000,
  },
  {
    name: "fine tuning",
    path: "/apps/fine-tuning",
    selector: '[data-testid="fine-tuning-view"]',
  },
  {
    name: "trajectories",
    path: "/apps/trajectories",
    selector: '[data-testid="trajectories-view"]',
  },
  {
    name: "relationships",
    path: "/apps/relationships",
    selector: '[data-testid="relationships-view"]',
  },
  {
    name: "memories",
    path: "/apps/memories",
    selector: '[data-testid="memory-viewer-view"]',
  },
  {
    name: "runtime",
    path: "/apps/runtime",
    readyChecks: [
      { selector: '[data-testid="runtime-view"]' },
      { selector: '[data-testid="runtime-sidebar"]' },
    ],
    timeoutMs: 15_000,
  },
  {
    name: "database",
    path: "/apps/database",
    selector: '[data-testid="database-view"]',
  },
  {
    name: "logs",
    path: "/apps/logs",
    selector: '[data-testid="logs-view"]',
  },
  {
    name: "companion",
    path: "/apps/companion",
    selector: '[data-testid="companion-root"]',
  },
  {
    name: "shopify",
    path: "/apps/shopify",
    selector: '[data-testid="shopify-shell"]',
  },
  {
    name: "vincent",
    path: "/apps/vincent",
    selector: '[data-testid="vincent-shell"]',
  },
] as const;

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
});

test("apps view can route into internal tool pages and survive a reload", async ({
  page,
}) => {
  await openAppPath(page, "/apps");
  await expect(page.getByTestId("apps-catalog-grid")).toBeVisible();

  await page.getByRole("button", { name: "Plugin Viewer" }).click();
  await expect(page).toHaveURL(/\/plugins$/);
  await assertReadyChecks(
    page,
    "plugins-viewer",
    [{ text: "AI Providers" }, { text: "Other Features" }],
    "any",
    60_000,
  );

  // Reload from root and re-navigate — Vite preview lacks SPA fallback
  await openAppPath(page, "/");
  await openAppPath(page, "/apps");
  await expect(page.getByTestId("apps-catalog-grid")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Plugin Viewer" }).click();
  await expect(page).toHaveURL(/\/plugins$/);
  await assertReadyChecks(
    page,
    "plugins-viewer-reload",
    [{ text: "AI Providers" }, { text: "Other Features" }],
    "any",
    60_000,
  );
});

for (const routeCase of DIRECT_ROUTE_CASES) {
  test(`direct ${routeCase.name} route boots the app shell`, async ({
    page,
  }) => {
    await openAppPath(page, routeCase.path);
    await expect(page).toHaveURL(
      new RegExp(`${escapeRegExp(routeCase.path)}$`),
    );
    if ("readyChecks" in routeCase) {
      await assertReadyChecks(
        page,
        routeCase.name,
        routeCase.readyChecks,
        "any",
        routeCase.timeoutMs,
      );
      return;
    }
    await assertReadyChecks(
      page,
      routeCase.name,
      [
        "selector" in routeCase
          ? { selector: routeCase.selector }
          : { text: routeCase.text },
      ],
      "any",
      "timeoutMs" in routeCase ? routeCase.timeoutMs : undefined,
    );
  });
}
