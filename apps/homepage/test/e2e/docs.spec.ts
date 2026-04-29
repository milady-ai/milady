/**
 * E2E coverage for the homepage docs surfaces:
 *   - /docs landing
 *   - /docs/:tier landings (beginner/intermediate/advanced/developer)
 *   - /docs/:tier/:slug pages — programmatically discovered + visited
 *   - /guides smoke
 *   - Catch-all routing
 *   - Mobile drawer navigation
 *
 * Discovery uses Approach A (runtime DOM scrape): we visit each tier landing
 * and collect `<a href="/docs/<tier>/...">` links from the rendered page,
 * which mirrors what users actually see and avoids depending on Vite's MDX
 * transformation or runtime registry internals.
 */

import { expect, type Page, test } from "@playwright/test";

const TIERS = ["beginner", "intermediate", "advanced"] as const;
type Tier = (typeof TIERS)[number];

/** Hard cap to keep the suite bounded if the registry ever balloons. */
const MAX_DOC_ROUTES = 60;

interface DiscoveredRoute {
  path: string;
  tier: Tier;
}

async function collectTierLinks(page: Page, tier: Tier): Promise<string[]> {
  await page.goto(`/docs/${tier}`);
  // TierLanding renders <h1 className="capitalize">{section.label}</h1>.
  await expect(
    page.getByRole("heading", { level: 1, name: new RegExp(tier, "i") }),
  ).toBeVisible();

  const tierPrefix = `/docs/${tier}/`;
  const hrefs = await page.evaluate((prefix: string) => {
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a"),
    );
    const seen = new Set<string>();
    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith(prefix) && href.length > prefix.length) {
        seen.add(href);
      }
    }
    return Array.from(seen);
  }, tierPrefix);

  return hrefs;
}

async function discoverDocRoutes(page: Page): Promise<DiscoveredRoute[]> {
  const seen = new Map<string, Tier>();
  for (const tier of TIERS) {
    const hrefs = await collectTierLinks(page, tier);
    for (const href of hrefs) {
      if (!seen.has(href)) {
        seen.set(href, tier);
      }
    }
  }
  return Array.from(seen.entries())
    .slice(0, MAX_DOC_ROUTES)
    .map(([path, tier]) => ({ path, tier }));
}

test.describe("homepage - docs", () => {
  test.describe("tier landings", () => {
    test("/docs renders landing with tier cards", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto("/docs");
      // Hero copy from index.mdx — its `<h1>` is "Docs".
      await expect(
        page.getByRole("heading", { level: 1, name: "Docs" }),
      ).toBeVisible();

      const tierCardsRegion = page.locator("#docs-tier-cards-heading");
      await expect(tierCardsRegion).toBeVisible();

      // Each tier card is an <a href="/docs/<tier>"> link. Sidebar also
      // renders the same hrefs, so scope to the cards section.
      const cardsSection = page.locator(
        'section[aria-labelledby="docs-tier-cards-heading"]',
      );
      await expect(cardsSection).toBeVisible();
      for (const tier of [...TIERS, "developer"] as const) {
        await expect(
          cardsSection.locator(`a[href="/docs/${tier}"]`),
        ).toBeVisible();
      }

      expect(errors, errors.join("\n")).toEqual([]);
    });

    test("clicking the beginner tier card routes to /docs/beginner", async ({
      page,
    }) => {
      await page.goto("/docs");
      await page.locator('a[href="/docs/beginner"]').first().click();
      await page.waitForURL("**/docs/beginner");
      await expect(
        page.getByRole("heading", { level: 1, name: /beginner/i }),
      ).toBeVisible();
    });

    for (const tier of TIERS) {
      test(`/docs/${tier} renders without errors`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (err) => errors.push(err.message));

        await page.goto(`/docs/${tier}`);
        await expect(
          page.getByRole("heading", { level: 1, name: new RegExp(tier, "i") }),
        ).toBeVisible();

        expect(errors, errors.join("\n")).toEqual([]);
      });
    }

    test("/docs/developer renders the hand-authored MDX lander", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto("/docs/developer");
      // developer/index.mdx begins with `# For developers`.
      await expect(
        page.getByRole("heading", { level: 1, name: "For developers" }),
      ).toBeVisible();

      expect(errors, errors.join("\n")).toEqual([]);
    });
  });

  test.describe("registry traversal", () => {
    let discoveredRoutes: DiscoveredRoute[] = [];

    test.beforeAll(async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        discoveredRoutes = await discoverDocRoutes(page);
      } finally {
        await context.close();
      }

      // Sanity check: the registry has well over a dozen pages across the
      // first three tiers. If we discovered fewer, something is broken
      // upstream and we want a loud failure rather than silently skipping.
      expect(
        discoveredRoutes.length,
        `expected to discover at least 10 docs routes; got ${discoveredRoutes.length}`,
      ).toBeGreaterThanOrEqual(10);
    });

    test("discovered route count is reasonable and capped", () => {
      expect(discoveredRoutes.length).toBeGreaterThan(0);
      expect(discoveredRoutes.length).toBeLessThanOrEqual(MAX_DOC_ROUTES);
    });

    // We can't `for (const ...)` over a value populated in beforeAll, so we
    // discover routes statically here too. Playwright executes the test file
    // body once per worker; the route list is stable across runs because
    // the registry is checked into the repo.
    //
    // Using a single parameterized test that loops internally keeps the
    // route count bounded without hitting the test enumeration limit and
    // still gives useful per-route failure messages via test.step.
    test("every discovered docs route renders its h1 without page errors", async ({
      page,
    }) => {
      expect(discoveredRoutes.length).toBeGreaterThan(0);

      for (const { path } of discoveredRoutes) {
        await test.step(`visit ${path}`, async () => {
          const errors: string[] = [];
          const onError = (err: Error) => errors.push(err.message);
          page.on("pageerror", onError);

          await page.goto(path);
          // DocsPage renders the lazy MDX inside Suspense; the first <h1> is
          // the page title once content resolves.
          await expect(page.locator("h1").first()).toBeVisible();

          page.off("pageerror", onError);
          expect(errors, `pageerror on ${path}:\n${errors.join("\n")}`).toEqual(
            [],
          );
        });
      }
    });
  });

  test.describe("navigation", () => {
    test("sidebar link click updates URL and active state", async ({
      page,
    }) => {
      await page.goto("/docs/beginner");
      const sidebar = page.getByRole("navigation", {
        name: "Documentation navigation",
      });
      await expect(sidebar.first()).toBeVisible();

      // Pick the first tier-page link in the sidebar (beginner section).
      const firstBeginnerLink = sidebar
        .first()
        .locator('a[href^="/docs/beginner/"]')
        .first();
      const targetHref = await firstBeginnerLink.getAttribute("href");
      expect(targetHref).toMatch(/^\/docs\/beginner\/.+/);

      await firstBeginnerLink.click();
      await page.waitForURL(`**${targetHref}`);

      // The active sidebar link is rendered with the brand color via class.
      const activeLink = sidebar
        .first()
        .locator(`a[href="${targetHref}"]`)
        .first();
      await expect(activeLink).toHaveClass(/text-brand/);
    });

    test("prev/next links advance to the adjacent doc", async ({ page }) => {
      // Land on a known beginner page that has a "Next" sibling.
      await page.goto("/docs/beginner/welcome");
      await expect(
        page.getByRole("heading", { level: 1, name: /milady/i }),
      ).toBeVisible();

      const pageNav = page.getByRole("navigation", { name: "Page navigation" });
      await expect(pageNav).toBeVisible();

      const nextLink = pageNav.locator('a:has-text("Next")').first();
      const nextHref = await nextLink.getAttribute("href");
      expect(nextHref).toMatch(/^\/docs\/beginner\/.+/);

      await nextLink.click();
      await page.waitForURL(`**${nextHref}`);
      await expect(page.locator("h1").first()).toBeVisible();
    });

    test("browser back restores previous tier landing", async ({ page }) => {
      await page.goto("/docs/beginner");
      await expect(
        page.getByRole("heading", { level: 1, name: /beginner/i }),
      ).toBeVisible();

      // Navigate forward into a child page via a tier-card link.
      const firstChild = page.locator('a[href^="/docs/beginner/"]').first();
      const childHref = await firstChild.getAttribute("href");
      await firstChild.click();
      await page.waitForURL(`**${childHref}`);
      await expect(page.locator("h1").first()).toBeVisible();

      await page.goBack();
      await page.waitForURL("**/docs/beginner");
      await expect(
        page.getByRole("heading", { level: 1, name: /beginner/i }),
      ).toBeVisible();
    });
  });

  test.describe("/guides", () => {
    test("renders without errors and shows hero", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto("/guides");
      await expect(page.getByTestId("guides-page")).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: /start with the server/i,
        }),
      ).toBeVisible();

      // Hero CTA: "Open App" links to /dashboard. Multiple /dashboard
      // links exist on the page (hero + nav); assert at least one is visible.
      await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible();

      expect(errors, errors.join("\n")).toEqual([]);
    });
  });

  test.describe("catch-all routing", () => {
    test("unknown top-level path redirects to /", async ({ page }) => {
      await page.goto("/some/random/path");
      await page.waitForURL("**/");
      expect(new URL(page.url()).pathname).toBe("/");
    });

    test("invalid tier slug shows the 'Tier not found' affordance", async ({
      page,
    }) => {
      await page.goto("/docs/not-a-real-tier");
      await expect(
        page.getByRole("heading", { level: 1, name: "Tier not found" }),
      ).toBeVisible();
      // The fallback links back to the docs home.
      await expect(
        page.locator('main[data-docs-content] a[href="/docs"]'),
      ).toBeVisible();
    });
  });

  test.describe("mobile drawer", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("opens, navigates to a docs page, and closes", async ({ page }) => {
      await page.goto("/docs");

      const drawerToggle = page.getByRole("button", {
        name: "Toggle documentation navigation",
      });
      await expect(drawerToggle).toBeVisible();
      await expect(drawerToggle).toHaveAttribute("aria-expanded", "false");

      await drawerToggle.click();
      await expect(drawerToggle).toHaveAttribute("aria-expanded", "true");

      const drawer = page.getByRole("dialog", {
        name: "Documentation navigation",
      });
      await expect(drawer).toBeVisible();

      // Click the first tier link inside the drawer; it should close on
      // navigation and the route should change.
      const firstLink = drawer.locator('a[href^="/docs/beginner/"]').first();
      const targetHref = await firstLink.getAttribute("href");
      expect(targetHref).toMatch(/^\/docs\/beginner\/.+/);

      await firstLink.click();
      await page.waitForURL(`**${targetHref}`);
      await expect(drawer).toHaveCount(0);
      await expect(drawerToggle).toHaveAttribute("aria-expanded", "false");
    });
  });
});
