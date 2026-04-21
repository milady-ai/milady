import {
  getMiladyCuratedAppCatalogOrder,
  isMiladyCuratedAppName,
  normalizeMiladyCuratedAppName,
} from "@miladyai/agent/contracts/apps";
import type { RegistryAppInfo } from "../../api";

export const DEFAULT_VIEWER_SANDBOX =
  "allow-scripts allow-same-origin allow-popups";

export const CATEGORY_LABELS: Record<string, string> = {
  game: "Game",
  social: "Social",
  platform: "Platform",
  world: "World",
  utility: "Utility",
};

const SESSION_MODE_LABELS: Record<string, string> = {
  "spectate-and-steer": "Spectate + steer",
};

const SESSION_FEATURE_LABELS: Record<string, string> = {
  commands: "Commands",
  telemetry: "Telemetry",
  pause: "Pause",
  resume: "Resume",
  suggestions: "Suggestions",
};

interface AppsCatalogFilterOptions {
  activeAppNames?: ReadonlySet<string>;
  isProd?: boolean;
  searchQuery?: string;
  showActiveOnly?: boolean;
}

export function isCuratedGameApp(
  app: Pick<RegistryAppInfo, "category" | "name">,
): boolean {
  void app.category;
  return isMiladyCuratedAppName(app.name);
}

export function shouldShowAppInAppsView(
  app: Pick<RegistryAppInfo, "category" | "name">,
  isProd: boolean = typeof import.meta.env.PROD === "boolean"
    ? import.meta.env.PROD
    : Boolean(import.meta.env.PROD),
): boolean {
  void isProd;
  return isCuratedGameApp(app);
}

export function filterAppsForCatalog(
  apps: RegistryAppInfo[],
  {
    activeAppNames = new Set<string>(),
    isProd,
    searchQuery = "",
    showActiveOnly = false,
  }: AppsCatalogFilterOptions = {},
): RegistryAppInfo[] {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const seenCanonicalNames = new Set<string>();
  const sortedApps = [...apps].sort((left, right) => {
    const orderDiff =
      getMiladyCuratedAppCatalogOrder(left.name) -
      getMiladyCuratedAppCatalogOrder(right.name);
    if (orderDiff !== 0) {
      return orderDiff;
    }

    const leftCanonicalName = normalizeMiladyCuratedAppName(left.name);
    const rightCanonicalName = normalizeMiladyCuratedAppName(right.name);
    const leftCanonicalPenalty = left.name === leftCanonicalName ? 0 : 1;
    const rightCanonicalPenalty = right.name === rightCanonicalName ? 0 : 1;
    if (leftCanonicalPenalty !== rightCanonicalPenalty) {
      return leftCanonicalPenalty - rightCanonicalPenalty;
    }

    return (right.stars ?? 0) - (left.stars ?? 0);
  });

  return sortedApps.filter((app) => {
    if (!shouldShowAppInAppsView(app, isProd)) {
      return false;
    }
    if (
      normalizedSearch &&
      !app.name.toLowerCase().includes(normalizedSearch) &&
      !(app.displayName ?? "").toLowerCase().includes(normalizedSearch) &&
      !(app.description ?? "").toLowerCase().includes(normalizedSearch)
    ) {
      return false;
    }
    if (showActiveOnly && !activeAppNames.has(app.name)) {
      return false;
    }
    const canonicalName = normalizeMiladyCuratedAppName(app.name) ?? app.name;
    if (seenCanonicalNames.has(canonicalName)) {
      return false;
    }
    seenCanonicalNames.add(canonicalName);
    return true;
  });
}

export function getDefaultAppsCatalogSelection(
  apps: RegistryAppInfo[],
  isProd: boolean = typeof import.meta.env.PROD === "boolean"
    ? import.meta.env.PROD
    : Boolean(import.meta.env.PROD),
): string | null {
  return (
    filterAppsForCatalog(apps, {
      isProd,
    })[0]?.name ?? null
  );
}

export function getAppShortName(app: RegistryAppInfo): string {
  const display = app.displayName ?? app.name;
  const clean = display.replace(/^@[^/]+\/app-/, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function getAppEmoji(app: RegistryAppInfo): string {
  if (app.category === "game") return "🎮";
  if (app.category === "social") return "💬";
  if (app.category === "world") return "🌍";
  if (app.category === "platform") return "🧩";
  if (app.category === "utility") return "🛠️";
  return "📦";
}

export function getAppSessionModeLabel(
  app: Pick<RegistryAppInfo, "session">,
): string | null {
  const mode = app.session?.mode;
  if (!mode) return null;
  return SESSION_MODE_LABELS[mode] ?? mode;
}

export function getAppSessionFeatureLabels(
  app: Pick<RegistryAppInfo, "session">,
): string[] {
  return (app.session?.features ?? []).map(
    (feature) => SESSION_FEATURE_LABELS[feature] ?? feature,
  );
}
