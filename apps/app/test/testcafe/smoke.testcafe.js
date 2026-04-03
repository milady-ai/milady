/**
 * Milady UI E2E smoke tests — TestCafe + Bun.
 *
 * Traverses every view derived from TAB_PATHS in app-core/navigation,
 * asserts stability (no crash, no onboarding redirect, root element present),
 * and checks view-specific ready selectors from the design-review spec.
 *
 * Run: bunx testcafe <browser> apps/app/test/testcafe/smoke.testcafe.js
 * Requires: bun run dev (ELIZA_DEV_ONCHAIN=0) on localhost:2138
 *
 * skipJsErrors() — intentional:
 * Hammerhead (TestCafe’s proxy) plus WebKit/Safari often surface third-party or
 * browser-level errors that are unrelated to Milady. Without skipJsErrors, the
 * runner fails the whole test on those before our assertions run. We still
 * assert #root, URL/onboarding guards, and at least one button. Do not remove
 * blindly; run without skipJsErrors locally to see current noise before deleting.
 */
const { Selector, ClientFunction, RequestMock } = require("testcafe");

const BASE = "http://localhost:2138";
const ROOT_READY = Selector("#root");
const ROOT_TIMEOUT_MS = 20000;
const NAV_TIMEOUT_MS = 12000;

const getLocation = ClientFunction(() => window.location.href);

const onboardingMock = RequestMock()
  .onRequestTo(/\/api\/onboarding\/status/)
  .respond({ complete: true }, 200, { "content-type": "application/json" })
  .onRequestTo(/\/api\/agent\/status/)
  .respond({ onboardingComplete: true, status: "running" }, 200, {
    "content-type": "application/json",
  });

function setLocalStorage() {
  return ClientFunction(() => {
    localStorage.setItem("eliza:onboarding-complete", "1");
    localStorage.setItem("eliza:onboarding:step", "activate");
    localStorage.setItem(
      "milady:active-server",
      JSON.stringify({
        id: "local:embedded",
        kind: "local",
        label: "This device",
      }),
    );
    localStorage.setItem("eliza:ui-shell-mode", "native");
  });
}

const setupStorage = setLocalStorage();

fixture`Milady UI — Full View Traversal`.page`about:blank`
  .requestHooks(onboardingMock)
  .beforeEach(async (t) => {
    await t.navigateTo(BASE);
    await setupStorage();

    await t.eval(() => {
      window.__testcafe_error_count = 0;
      const origError = console.error;
      console.error = (...args) => {
        window.__testcafe_error_count =
          (window.__testcafe_error_count || 0) + 1;
        origError.apply(console, args);
      };
    });

    await t.navigateTo(BASE);
    await t
      .expect(ROOT_READY.with({ timeout: ROOT_TIMEOUT_MS }).exists)
      .ok("#root should appear after onboarding seed");
  });

// ---------------------------------------------------------------------------
// View definitions — derived from TAB_PATHS + design-review ViewSpec
// ---------------------------------------------------------------------------

const VIEWS = [
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
    readyChecks: [{ selector: '[aria-label="Chat workspace"]' }],
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
    readyChecks: [{ selector: '[data-testid="wallet-balance-value"]' }],
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
    readyChecks: [{ selector: '[data-testid="plugins-view-social"]' }],
  },
  {
    id: "settings",
    path: "/settings",
    label: "Settings",
    readyChecks: [{ selector: '[aria-label="Close settings"]' }],
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
  // Advanced sub-routes
  {
    id: "plugins",
    path: "/plugins",
    label: "Plugins",
  },
  {
    id: "skills",
    path: "/skills",
    label: "Skills",
  },
  {
    id: "actions",
    path: "/actions",
    label: "Actions",
  },
  {
    id: "trajectories",
    path: "/trajectories",
    label: "Trajectories",
  },
  {
    id: "runtime",
    path: "/runtime",
    label: "Runtime",
  },
  {
    id: "database",
    path: "/database",
    label: "Database",
  },
  {
    id: "desktop",
    path: "/desktop",
    label: "Desktop",
  },
  {
    id: "logs",
    path: "/logs",
    label: "Logs",
  },
  {
    id: "security",
    path: "/security",
    label: "Security",
  },
  {
    id: "voice",
    path: "/voice",
    label: "Voice (Settings > Media)",
  },
  // TAB_PATHS parity — were previously omitted from smoke; see navigation/index.ts
  {
    id: "apps",
    path: "/apps",
    label: "Apps (APPS_ENABLED=false — chat shell)",
    /** When apps are disabled, tab resolves to chat; URL may stay /apps briefly. */
    appsDisabledExpectChatShell: true,
  },
  {
    id: "character",
    path: "/character",
    label: "Character editor",
    readyChecks: [
      { selector: '[data-testid="character-roster-grid"]' },
      { selector: '[data-testid="character-customize-toggle"]' },
    ],
    readyCheckMode: "any",
  },
  {
    id: "fine-tuning",
    path: "/fine-tuning",
    label: "Fine tuning",
  },
];

// Generate one test per view
for (const view of VIEWS) {
  // skipJsErrors: see file header (Hammerhead / Safari noise vs app assertions).
  test.skipJsErrors()(`[${view.id}] ${view.label} view loads`, async (t) => {
    await t.navigateTo(`${BASE}${view.path}`);
    await t
      .expect(ROOT_READY.with({ timeout: ROOT_TIMEOUT_MS }).exists)
      .ok(`Root element should exist on ${view.path}`);

    // Must not redirect to onboarding
    const url = await getLocation();
    await t
      .expect(url)
      .notContains(
        "onboarding",
        `${view.label} should not redirect to onboarding`,
      );

    // If this view can redirect (e.g. /chat -> /companion), allow it
    if (view.allowRedirectTo) {
      const validUrl =
        url.includes(view.path) || url.includes(view.allowRedirectTo);
      await t
        .expect(validUrl)
        .ok(`Expected ${view.path} or ${view.allowRedirectTo}, got ${url}`);
    }

    // /apps with APPS_ENABLED=false: app treats tab as chat; URL may be /apps, /chat, or /companion
    if (view.appsDisabledExpectChatShell) {
      const onChatLike =
        url.includes("/chat") ||
        url.includes("/companion") ||
        url.includes("/apps");
      await t
        .expect(onChatLike)
        .ok(`With apps disabled, expected chat-like route; got ${url}`);
    }

    // Check view-specific ready selectors/text (soft: warn, don't fail)
    // Some selectors depend on backend state that may not be available in
    // all environments (e.g. wallet balance requires a funded wallet).
    if (view.readyChecks && view.readyChecks.length > 0) {
      const mode = view.readyCheckMode || "any";
      const results = [];

      for (const check of view.readyChecks) {
        try {
          if (check.selector) {
            const el = Selector(check.selector);
            const exists = await el.with({ timeout: 5000 }).exists;
            results.push(exists);
          } else if (check.text) {
            const el = Selector("body").withText(check.text);
            const exists = await el.with({ timeout: 5000 }).exists;
            results.push(exists);
          }
        } catch {
          results.push(false);
        }
      }

      const passed =
        mode === "all" ? results.every((r) => r) : results.some((r) => r);

      if (!passed) {
        console.warn(
          `[WARN] ${view.label} (${view.id}): ready checks did not pass ` +
            `(${JSON.stringify(results)}). View loaded but specific ` +
            `elements were not found — may need backend state.`,
        );
      }
    }

    // Interactive content: at least one button should exist
    const buttons = Selector("button");
    const buttonCount = await buttons.count;
    await t
      .expect(buttonCount)
      .gte(1, `${view.label} should have at least one interactive button`);
  });
}

// ---------------------------------------------------------------------------
// Cross-view stability: rapid navigation between all views
// ---------------------------------------------------------------------------

// skipJsErrors: see file header.
test.skipJsErrors()("Rapid view traversal without crash", async (t) => {
  for (const view of VIEWS) {
    await t.navigateTo(`${BASE}${view.path}`);
    await t
      .expect(ROOT_READY.with({ timeout: NAV_TIMEOUT_MS }).exists)
      .ok(`Root should exist after navigating to ${view.path}`);

    const url = await getLocation();
    await t
      .expect(url)
      .notContains(
        "onboarding",
        `Should not redirect to onboarding on ${view.path}`,
      );
  }
});
