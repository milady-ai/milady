import { describe, expect, it } from "vitest";
import type { RegistryAppInfo } from "../../api";
import {
  filterAppsForCatalog,
  getDefaultAppsCatalogSelection,
  shouldShowAppInAppsView,
} from "./helpers";

function makeApp(
  overrides: Partial<RegistryAppInfo> & Pick<RegistryAppInfo, "name">,
): RegistryAppInfo {
  const name = overrides.name;

  return {
    name,
    displayName: overrides.displayName ?? name,
    description: overrides.description ?? `${name} description`,
    category: overrides.category ?? "game",
    launchType: overrides.launchType ?? "url",
    launchUrl: overrides.launchUrl ?? "http://localhost:3000",
    icon: overrides.icon ?? null,
    capabilities: overrides.capabilities ?? [],
    stars: overrides.stars ?? 0,
    repository: overrides.repository ?? "https://github.com/elizaos/example",
    latestVersion: overrides.latestVersion ?? null,
    supports: overrides.supports ?? { v0: false, v1: false, v2: true },
    npm: overrides.npm ?? {
      package: name,
      v0Version: null,
      v1Version: null,
      v2Version: "1.0.0",
    },
    uiExtension: overrides.uiExtension,
    viewer: overrides.viewer,
    session: overrides.session,
  };
}

describe("apps catalog helpers", () => {
  it("shows only the four curated Milady games", () => {
    expect(
      shouldShowAppInAppsView(
        makeApp({ name: "@hyperscape/plugin-hyperscape" }),
        false,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(makeApp({ name: "@elizaos/app-babylon" }), false),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        makeApp({ name: "@elizaos/app-2004scape" }),
        false,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        makeApp({ name: "@elizaos/app-defense-of-the-agents" }),
        false,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        makeApp({ name: "@elizaos/app-unlisted-game" }),
        false,
      ),
    ).toBe(false);
    expect(
      shouldShowAppInAppsView(makeApp({ name: "@elizaos/app-hyperfy" }), false),
    ).toBe(false);
  });

  it("uses the same visibility rules in production", () => {
    expect(
      shouldShowAppInAppsView(
        makeApp({ name: "@hyperscape/plugin-hyperscape" }),
        true,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        makeApp({ name: "@elizaos/app-defense-of-the-agents" }),
        true,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        makeApp({ name: "@elizaos/app-unlisted-game" }),
        true,
      ),
    ).toBe(false);
  });

  it("keeps only the curated catalog and deduplicates aliases", () => {
    const visibleApps = filterAppsForCatalog(
      [
        makeApp({
          name: "@elizaos/app-defense-of-the-agents",
          displayName: "Defense of the Agents",
        }),
        makeApp({
          name: "@elizaos/app-hyperscape",
          displayName: "Hyperscape alt",
        }),
        makeApp({
          name: "@hyperscape/plugin-hyperscape",
          displayName: "Hyperscape",
        }),
        makeApp({
          name: "@elizaos/app-babylon",
          displayName: "Babylon",
          category: "platform",
        }),
        makeApp({
          name: "@elizaos/app-unlisted-game",
          displayName: "Unlisted Game",
        }),
      ],
      { isProd: false },
    );

    expect(visibleApps.map((app) => app.name)).toEqual([
      "@hyperscape/plugin-hyperscape",
      "@elizaos/app-babylon",
      "@elizaos/app-defense-of-the-agents",
    ]);
  });

  it("defaults selection to the first curated app in catalog order", () => {
    expect(
      getDefaultAppsCatalogSelection(
        [
          makeApp({
            name: "@elizaos/app-defense-of-the-agents",
            displayName: "Defense of the Agents",
          }),
          makeApp({
            name: "@hyperscape/plugin-hyperscape",
            displayName: "Hyperscape",
          }),
          makeApp({
            name: "@elizaos/app-babylon",
            displayName: "Babylon",
          }),
        ],
        false,
      ),
    ).toBe("@hyperscape/plugin-hyperscape");
  });

  it("filters to active curated apps when requested", () => {
    const visibleApps = filterAppsForCatalog(
      [
        makeApp({
          name: "@hyperscape/plugin-hyperscape",
          displayName: "Hyperscape",
        }),
        makeApp({
          name: "@elizaos/app-babylon",
          displayName: "Babylon",
        }),
      ],
      {
        isProd: false,
        showActiveOnly: true,
        activeAppNames: new Set(["@elizaos/app-babylon"]),
      },
    );

    expect(visibleApps.map((app) => app.name)).toEqual([
      "@elizaos/app-babylon",
    ]);
  });

  it("keeps the 2004scape entry visible in the curated set", () => {
    const visibleApps = filterAppsForCatalog(
      [
        makeApp({
          name: "@elizaos/app-defense-of-the-agents",
          displayName: "Defense of the Agents",
        }),
        makeApp({
          name: "@elizaos/app-2004scape",
          displayName: "2004scape",
        }),
      ],
      { isProd: false },
    );

    expect(visibleApps.map((app) => app.name)).toEqual([
      "@elizaos/app-2004scape",
      "@elizaos/app-defense-of-the-agents",
    ]);
  });
});
