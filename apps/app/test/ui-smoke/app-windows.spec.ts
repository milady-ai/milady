import { expect, test } from "@playwright/test";
import {
  assertReadyChecks,
  installDefaultAppRoutes,
  openAppPath,
  seedAppStorage,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
  await installDefaultAppRoutes(page);
});

/**
 * Detached `/apps/<slug>` window smoke tests for internal-tool apps that are
 * NOT covered by `game-apps.spec.ts` (which covers `defense-of-the-agents`
 * and `clawville`) and NOT covered by `apps-session-direct-{a,b}.spec.ts`
 * (which exercises the descriptors with `windowPath === '/apps/<slug>'` whose
 * `targetTab` matches the slug).
 *
 * These two app windows route through a non-matching `targetTab` (per
 * `internal-tool-apps.ts`):
 *   - `@elizaos/app-steward`     windowPath=/apps/inventory  targetTab=inventory  -> InventoryView
 *   - `@elizaos/app-elizamaker`  windowPath=/apps/elizamaker targetTab=chat       -> ChatView
 */

test("steward inventory app window mounts the wallet shell", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await openAppPath(page, "/apps/inventory");
  await assertReadyChecks(
    page,
    "steward inventory window",
    [{ selector: '[data-testid="wallet-shell"]' }],
    "all",
  );

  expect(pageErrors).toEqual([]);
});

test("elizamaker app window mounts the chat surfaces", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await openAppPath(page, "/apps/elizamaker");
  await assertReadyChecks(
    page,
    "elizamaker window",
    [
      { selector: '[data-testid="conversations-sidebar"]' },
      { selector: '[data-testid="chat-composer-textarea"]' },
    ],
    "all",
  );

  expect(pageErrors).toEqual([]);
});
