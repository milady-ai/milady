/**
 * Settings → Media: companion (chat) 3D preferences — UI + localStorage persistence.
 *
 * Covers the block at data-testid settings-companion-* (VRM power, half framerate,
 * animate when hidden). Requires companion mode (VITE_ENABLE_COMPANION_MODE !== false).
 *
 * Run (dev on :2138):
 *   bun run test:ui:testcafe -- --fixture apps/app/test/testcafe/settings-chat-companion.testcafe.js
 *   bun run test:ui:testcafe:with-dev -- --fixture apps/app/test/testcafe/settings-chat-companion.testcafe.js
 *
 * skipJsErrors() — intentional (see smoke.testcafe.js header): Hammerhead / WebKit
 * noise vs Milady assertions. Do not remove without a local run without it.
 */
const { Selector, ClientFunction, RequestMock } = require("testcafe");

const BASE = "http://localhost:2138";
const ROOT = Selector("#root");
const SETTINGS_SHELL = Selector('[data-testid="settings-shell"]');
const ROOT_TIMEOUT_MS = 20000;
const PANEL_TIMEOUT_MS = 20000;

const readLs = ClientFunction((key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
});

const resetCompanionPrefs = ClientFunction(() => {
  try {
    localStorage.setItem("eliza:companion-vrm-power", "balanced");
    localStorage.setItem("eliza:companion-half-framerate", "when_saving_power");
    localStorage.setItem("eliza:companion-animate-when-hidden", "0");
  } catch {
    // ignore
  }
});

const apiMock = RequestMock()
  .onRequestTo(/\/api\/onboarding\/status/)
  .respond({ complete: true }, 200, { "content-type": "application/json" })
  .onRequestTo(/\/api\/agent\/status/)
  .respond({ onboardingComplete: true, status: "running" }, 200, {
    "content-type": "application/json",
  })
  .onRequestTo({ url: /\/api\/config(\?|$)/, method: "get" })
  .respond({ media: {} }, 200, { "content-type": "application/json" });

function seedStorage() {
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
    localStorage.setItem("eliza:ui-language", "en");
    localStorage.setItem("eliza:companion-vrm-power", "balanced");
    localStorage.setItem("eliza:companion-half-framerate", "when_saving_power");
    localStorage.setItem("eliza:companion-animate-when-hidden", "0");
  });
}

const setupStorage = seedStorage();

fixture`Settings — Chat companion (Media)`.page`about:blank`
  .requestHooks(apiMock)
  .beforeEach(async (t) => {
    await t.resizeWindow(1280, 800);
    await t.navigateTo(BASE);
    await setupStorage();
    await t.navigateTo(BASE);
    await t
      .expect(ROOT.with({ timeout: ROOT_TIMEOUT_MS }).exists)
      .ok("#root after storage seed");
  })
  .afterEach(async (_t) => {
    await resetCompanionPrefs();
  });

// skipJsErrors: see file header.
test.skipJsErrors()(
  "companion 3D settings persist across navigation (localStorage + UI)",
  async (t) => {
    const vrmCard = Selector('[data-testid="settings-companion-vrm-power"]');
    const halfCard = Selector(
      '[data-testid="settings-companion-half-framerate"]',
    );
    const animateCard = Selector(
      '[data-testid="settings-companion-animate-when-hidden"]',
    );

    await t.navigateTo(`${BASE}/voice`);
    await t
      .expect(vrmCard.with({ timeout: PANEL_TIMEOUT_MS }).exists)
      .ok(
        "Companion VRM block should render (companion mode on, media config loaded)",
      );

    const btnEfficient = vrmCard
      .find("button")
      .withExactText("Always efficient");
    const btnAlwaysHalf = halfCard.find("button").withExactText("Always half");
    const animateSwitch = animateCard.find('[role="switch"]');

    await t.click(btnEfficient);
    await t.expect(await readLs("eliza:companion-vrm-power")).eql("efficiency");

    await t.click(btnAlwaysHalf);
    await t
      .expect(await readLs("eliza:companion-half-framerate"))
      .eql("always");

    await t.click(animateSwitch);
    await t
      .expect(await readLs("eliza:companion-animate-when-hidden"))
      .eql("1");

    await t.navigateTo(`${BASE}/companion`);
    await t
      .expect(ROOT.with({ timeout: ROOT_TIMEOUT_MS }).exists)
      .ok("companion shell");
    await t.navigateTo(`${BASE}/settings`);
    await t
      .expect(SETTINGS_SHELL.with({ timeout: ROOT_TIMEOUT_MS }).exists)
      .ok("settings shell");

    const mediaNav = Selector(
      '[data-testid="settings-sidebar"] button',
    ).withExactText("Media");
    await t
      .expect(mediaNav.with({ timeout: 15000 }).exists)
      .ok("Media section should be in sidebar");
    await t.click(mediaNav);
    await t
      .expect(
        Selector('[data-testid="settings-companion-vrm-power"]').with({
          timeout: 15000,
        }).exists,
      )
      .ok("companion settings visible after Media nav");

    const vrmAfter = Selector('[data-testid="settings-companion-vrm-power"]');
    const halfAfter = Selector(
      '[data-testid="settings-companion-half-framerate"]',
    );
    const animateAfter = Selector(
      '[data-testid="settings-companion-animate-when-hidden"]',
    );

    await t
      .expect(
        vrmAfter
          .find('button[aria-pressed="true"]')
          .withExactText("Always efficient").exists,
      )
      .ok("VRM power should stay on Always efficient after navigation");

    await t
      .expect(
        halfAfter
          .find('button[aria-pressed="true"]')
          .withExactText("Always half").exists,
      )
      .ok("Half framerate should stay on Always half after navigation");

    await t
      .expect(animateAfter.find('[role="switch"]').getAttribute("data-state"))
      .eql("checked", "Animate-in-background switch should stay on");

    await t.click(animateAfter.find('[role="switch"]'));
    await t
      .expect(await readLs("eliza:companion-animate-when-hidden"))
      .eql("0");

    await t.click(
      vrmAfter.find("button").withExactText("Depends on power source"),
    );
    await t.expect(await readLs("eliza:companion-vrm-power")).eql("balanced");

    await t.click(
      halfAfter.find("button").withExactText("Depends on power source"),
    );
    await t
      .expect(await readLs("eliza:companion-half-framerate"))
      .eql("when_saving_power");
  },
);
