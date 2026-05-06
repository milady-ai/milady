import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseAllowedHostEnv,
  toViteAllowedHosts,
} from "@elizaos/app-core/config/allowed-hosts";
import { colorizeDevSettingsStartupBanner } from "@elizaos/shared/dev-settings-banner-style";
import { prependDevSubsystemFigletHeading } from "@elizaos/shared/dev-settings-figlet-heading";
import {
  type DevSettingsRow,
  formatDevSettingsTable,
} from "@elizaos/shared/dev-settings-table";
import {
  resolveDesktopApiPort,
  resolveDesktopApiPortPreference,
  resolveDesktopUiPort,
  resolveDesktopUiPortPreference,
} from "@elizaos/shared/runtime-env";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import {
  type Alias,
  createLogger,
  defineConfig,
  type Plugin,
  type ServerOptions,
  transformWithEsbuild,
} from "vite";
import { syncElizaEnvAliases } from "../../scripts/lib/sync-eliza-env-aliases.mjs";
import appConfig from "./app.config";
import { resolveViteDevServerRuntime } from "./vite-dev-origin.ts";

const _require = createRequire(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const miladyRoot = path.resolve(here, "../..");
const capacitorCoreEntry = _require.resolve("@capacitor/core");
const patheEntry = _require.resolve("pathe");
const optionalElizaAppStubEntry = path.join(
  here,
  "src/optional-eliza-app-stub.tsx",
);
const nativePluginStubEntry = path.join(here, "src/native-plugin-stubs.ts");

function requireResolve(id: string): string {
  try {
    return _require.resolve(id);
  } catch (cause) {
    const detail = cause instanceof Error ? ` ${cause.message}` : "";
    throw new Error(
      `[milady][vite] Could not resolve ${id}.${detail} Run bun install so the published elizaOS package is available.`,
    );
  }
}

function shouldUseLocalElizaSource(): boolean {
  const sourceMode = (
    process.env.MILADY_ELIZA_SOURCE ??
    process.env.ELIZA_SOURCE ??
    "packages"
  ).toLowerCase();
  return (
    ["local", "source", "workspace"].includes(sourceMode) ||
    process.env.MILADY_FORCE_LOCAL_UPSTREAMS === "1" ||
    process.env.ELIZA_FORCE_LOCAL_UPSTREAMS === "1"
  );
}

const localElizaRoot = path.join(miladyRoot, "eliza");
const hasLocalElizaWorkspace =
  shouldUseLocalElizaSource() &&
  fs.existsSync(path.join(localElizaRoot, "package.json"));
const nativePluginsRoot = path.join(localElizaRoot, "packages/native-plugins");
const appCoreSrcRoot = hasLocalElizaWorkspace
  ? path.join(localElizaRoot, "packages/app-core/src")
  : null;
const appCoreNativePluginEntrypoints = appCoreSrcRoot
  ? path.join(appCoreSrcRoot, "platform/native-plugin-entrypoints.ts")
  : requireResolve("@elizaos/app-core/platform/native-plugin-entrypoints");
const emptyNodeModuleEntry = appCoreSrcRoot
  ? path.join(appCoreSrcRoot, "platform/empty-node-module.ts")
  : requireResolve("@elizaos/app-core/platform/empty-node-module");
const uiPkgRoot = hasLocalElizaWorkspace
  ? path.join(localElizaRoot, "packages/ui")
  : null;
// Other Capacitor packages imported by eliza/packages/app-core sources.
// Resolved here (apps/app scope) so Rollup can find them when bundling
// files from within the eliza submodule tree where bun may not hoist them.
function tryResolve(id: string): string | undefined {
  try {
    return _require.resolve(id);
  } catch {
    return undefined;
  }
}
const capacitorKeyboardEntry = tryResolve("@capacitor/keyboard");
const capacitorPreferencesEntry = tryResolve("@capacitor/preferences");
const capacitorAppEntry = tryResolve("@capacitor/app");
// `@elizaos/app-core` is always real. `@elizaos/app-wallet` is required by
// onboarding callbacks + AppContext (useWalletState), so resolve it real
// when present. `app-hyperscape` is real when its package is present.
// Auto-detect by walking node_modules/@elizaos/* directly (don't follow
// symlinks via require.resolve — those land at the real source path,
// which can be in eliza/packages/ instead of eliza/plugins/, missing
// plugin-only apps like app-wallet).
const directElizaScope = path.join(miladyRoot, "node_modules", "@elizaos");
function elizaAppPackageExists(name: string): boolean {
  if (
    hasLocalElizaWorkspace &&
    fs.existsSync(path.join(localElizaRoot, "apps", name, "package.json"))
  ) {
    return true;
  }
  if (
    hasLocalElizaWorkspace &&
    fs.existsSync(path.join(localElizaRoot, "plugins", name, "package.json"))
  ) {
    return true;
  }
  if (
    fs.existsSync(directElizaScope) &&
    fs.existsSync(path.join(directElizaScope, name, "package.json"))
  ) {
    return true;
  }
  return tryResolve(`@elizaos/${name}/package.json`) !== undefined;
}
const shouldResolveRealHyperscapeApp = elizaAppPackageExists("app-hyperscape");
const shouldResolveRealWalletApp = elizaAppPackageExists("app-wallet");
const optionalElizaAppAliasPattern = (() => {
  const realApps = ["core"];
  if (shouldResolveRealHyperscapeApp) realApps.push("hyperscape");
  if (shouldResolveRealWalletApp) realApps.push("wallet");
  return new RegExp(`^@elizaos\\/app-(?!(${realApps.join("|")})(\\/|$)).+$`);
})();

function isExpectedWsProxySocketError(
  message: unknown,
  error: unknown,
): boolean {
  const text = typeof message === "string" ? message : String(message ?? "");
  if (!text.includes("ws proxy socket error")) {
    return false;
  }

  const errorLike =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown })
      : null;
  return (
    errorLike?.code === "ECONNRESET" ||
    String(errorLike?.message ?? "").includes("read ECONNRESET")
  );
}

const viteLogger = createLogger();
const viteLoggerError = viteLogger.error;
viteLogger.error = (message, options) => {
  if (isExpectedWsProxySocketError(message, options?.error)) {
    return;
  }
  viteLoggerError(message, options);
};

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeEnvPrefix(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  if (!normalized) {
    throw new Error("App envPrefix must resolve to a non-empty identifier");
  }
  return normalized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveNativePluginAliasEntries(): Alias[] {
  if (!fs.existsSync(nativePluginsRoot)) return [];

  return fs
    .readdirSync(nativePluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        fs.existsSync(path.join(nativePluginsRoot, name, "package.json")) &&
        fs.existsSync(path.join(nativePluginsRoot, name, "src/index.ts")),
    )
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      find: new RegExp(`^@elizaos/capacitor-${escapeRegExp(name)}$`),
      replacement: path.join(nativePluginsRoot, `${name}/src/index.ts`),
    }));
}

function resolveLocalUiAliases(): Alias[] {
  if (!uiPkgRoot || !fs.existsSync(path.join(uiPkgRoot, "package.json"))) {
    return [];
  }

  return [
    {
      find: /^@elizaos\/ui$/,
      replacement: path.join(uiPkgRoot, "src/index.ts"),
    },
    {
      find: /^@elizaos\/ui\/components\/ui\/(.*)$/,
      replacement: `${uiPkgRoot}/src/components/ui/$1.tsx`,
      customResolver: resolveExistingUiSourceModule,
    },
    {
      find: /^@elizaos\/ui\/components\/composites\/([^/]+)$/,
      replacement: `${uiPkgRoot}/src/components/composites/$1/index.ts`,
    },
    {
      find: /^@elizaos\/ui\/components\/composites\/(.+)\/([^/]+)$/,
      replacement: `${uiPkgRoot}/src/components/composites/$1/$2.tsx`,
      customResolver: resolveExistingUiSourceModule,
    },
    {
      find: /^@elizaos\/ui\/components\/(.+)\/([^/]+)$/,
      replacement: `${uiPkgRoot}/src/components/$1/$2.tsx`,
      customResolver: resolveExistingUiSourceModule,
    },
    {
      find: /^@elizaos\/ui\/hooks$/,
      replacement: path.join(uiPkgRoot, "src/hooks/index.ts"),
    },
    {
      find: /^@elizaos\/ui\/hooks\/(.*)$/,
      replacement: `${uiPkgRoot}/src/hooks/$1.ts`,
    },
    {
      find: /^@elizaos\/ui\/layouts$/,
      replacement: path.join(uiPkgRoot, "src/layouts/index.ts"),
    },
    {
      find: /^@elizaos\/ui\/layouts\/([^/]+)$/,
      replacement: `${uiPkgRoot}/src/layouts/$1/index.ts`,
    },
    {
      find: /^@elizaos\/ui\/layouts\/(.+)\/([^/]+)$/,
      replacement: `${uiPkgRoot}/src/layouts/$1/$2.tsx`,
    },
    {
      find: /^@elizaos\/ui\/lib\/(.*)$/,
      replacement: `${uiPkgRoot}/src/lib/$1.ts`,
    },
  ];
}

function resolveLocalElizaAppAliases(): Alias[] {
  const appsDir = path.join(localElizaRoot, "apps");
  if (!fs.existsSync(appsDir)) return [];

  const aliases: Alias[] = [];
  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgPath = path.join(appsDir, entry.name, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      name?: string;
      exports?: Record<string, unknown>;
    };
    const pkgName = pkg.name;
    if (!pkgName) continue;
    const pkgDir = path.dirname(pkgPath);

    for (const [key, value] of Object.entries(pkg.exports || {})) {
      if (typeof value !== "string") continue;
      const aliasKey =
        key === "." ? pkgName : `${pkgName}/${key.replace(/^\.\//, "")}`;
      aliases.push({
        find: new RegExp(`^${escapeRegExp(aliasKey)}$`),
        replacement: path.resolve(pkgDir, value),
      });
    }

    aliases.push({
      find: new RegExp(`^${escapeRegExp(pkgName)}/(.*)`),
      replacement: path.resolve(pkgDir, "src/$1"),
    });
  }

  return aliases;
}

function resolveLocalSharedAliases(): Alias[] {
  const sharedPkgPath = path.join(
    localElizaRoot,
    "packages/shared/package.json",
  );
  if (!fs.existsSync(sharedPkgPath)) return [];

  const sharedPkgDir = path.dirname(sharedPkgPath);
  const sharedPkg = JSON.parse(fs.readFileSync(sharedPkgPath, "utf8")) as {
    exports?: Record<string, unknown>;
  };
  const aliases: Alias[] = [];
  for (const [key, value] of Object.entries(sharedPkg.exports || {})) {
    if (typeof value !== "string") continue;
    const aliasKey =
      key === "."
        ? "@elizaos/shared"
        : `@elizaos/shared/${key.replace(/^\.\//, "")}`;
    aliases.push({
      find: new RegExp(`^${escapeRegExp(aliasKey)}$`),
      replacement: path.resolve(sharedPkgDir, value),
    });
  }
  return aliases;
}

function resolveLocalAppCoreAliases(): Alias[] {
  const packageAgnosticAliases: Alias[] = [
    {
      find: /^@elizaos\/agent$/,
      replacement: emptyNodeModuleEntry,
    },
    {
      find: /^@elizaos\/core$/,
      replacement: resolveElizaCoreBundlePath(),
    },
  ];

  const appCorePkgPath = path.join(
    localElizaRoot,
    "packages/app-core/package.json",
  );
  if (!appCoreSrcRoot || !fs.existsSync(appCorePkgPath)) {
    return packageAgnosticAliases;
  }

  const appCorePkgDir = path.dirname(appCorePkgPath);
  const appCoreBrowserEntry = path.join(appCorePkgDir, "src/browser.ts");
  const appCorePkg = JSON.parse(fs.readFileSync(appCorePkgPath, "utf8")) as {
    exports?: Record<string, unknown>;
  };

  const generatedAliases: Alias[] = [];

  for (const [key, value] of Object.entries(appCorePkg.exports || {})) {
    if (typeof value !== "string") continue;
    const aliasKey =
      key === "."
        ? "@elizaos/app-core"
        : `@elizaos/app-core/${key.replace(/^\.\//, "")}`;
    const targetPath =
      key === "." ? appCoreBrowserEntry : path.resolve(appCorePkgDir, value);

    generatedAliases.push({
      find: new RegExp(`^${escapeRegExp(aliasKey)}$`),
      replacement: targetPath,
    });
    if (!aliasKey.endsWith(".js") && !aliasKey.endsWith(".css")) {
      generatedAliases.push({
        find: new RegExp(`^${escapeRegExp(aliasKey)}\\.js$`),
        replacement: targetPath,
      });
    }
  }

  const uiSource = path.join(appCoreSrcRoot, "ui");

  return [
    ...generatedAliases,
    {
      find: /^@elizaos\/app-core\/(.+)$/,
      replacement: `${appCorePkgDir}/src/$1`,
    },
    {
      find: /^@miladyai\/ui$/,
      replacement: path.join(uiSource, "index.ts"),
    },
    {
      find: /^@miladyai\/ui\/(.*)$/,
      replacement: `${uiSource}/$1/index.ts`,
    },
    {
      find: /^@elizaos\/agent\/(.+)$/,
      replacement: path.join(localElizaRoot, "packages/agent/src/$1"),
    },
    ...packageAgnosticAliases,
  ];
}

function resolveAppBrandingForViteConfig() {
  return {
    appName: appConfig.appName,
    orgName: appConfig.orgName,
    repoName: appConfig.repoName,
    docsUrl: "https://docs.elizaos.ai",
    appUrl: "https://app.elizaos.ai",
    bugReportUrl: "https://github.com/elizaOS/eliza/issues/new",
    hashtag: "#elizaOS",
    fileExtension: ".eliza-agent",
    packageScope: "elizaos",
    ...appConfig.branding,
  };
}

function resolveAppShellMetadata() {
  const branding = resolveAppBrandingForViteConfig();
  const themeColor = appConfig.web?.themeColor?.trim() || "#08080a";
  const backgroundColor = appConfig.web?.backgroundColor?.trim() || "#0a0a0a";
  const shareImagePath =
    appConfig.web?.shareImagePath?.trim() || "/og-image.png";
  const appUrl = ensureTrailingSlash(branding.appUrl.trim());

  return {
    appName: appConfig.appName.trim(),
    shortName: appConfig.web?.shortName?.trim() || appConfig.appName.trim(),
    description: appConfig.description.trim(),
    appUrl,
    themeColor,
    backgroundColor,
    shareImagePath,
    shareImageUrl: new URL(shareImagePath, appUrl).toString(),
  };
}

const APP_SHELL_METADATA = resolveAppShellMetadata();
const APP_ENV_PREFIX = normalizeEnvPrefix(
  appConfig.envPrefix?.trim() || appConfig.cliName.trim(),
);
const APP_NAMESPACE = appConfig.namespace?.trim() || appConfig.cliName.trim();
const BRANDED_ENV = {
  apiPort: `${APP_ENV_PREFIX}_API_PORT`,
  appSourcemap: `${APP_ENV_PREFIX}_APP_SOURCEMAP`,
  assetBaseUrl: `${APP_ENV_PREFIX}_ASSET_BASE_URL`,
  desktopFastDist: `${APP_ENV_PREFIX}_DESKTOP_VITE_FAST_DIST`,
  devPolling: `${APP_ENV_PREFIX}_DEV_POLLING`,
  hmrHost: `${APP_ENV_PREFIX}_HMR_HOST`,
  settingsDebug: `${APP_ENV_PREFIX}_SETTINGS_DEBUG`,
  ttsDebug: `${APP_ENV_PREFIX}_TTS_DEBUG`,
  viteLoopbackOrigin: `${APP_ENV_PREFIX}_VITE_LOOPBACK_ORIGIN`,
  viteOrigin: `${APP_ENV_PREFIX}_VITE_ORIGIN`,
  viteSettingsDebug: `VITE_${APP_ENV_PREFIX}_SETTINGS_DEBUG`,
};
const DEFAULT_APP_ROUTE_PLUGIN_MODULES: string[] = [];

// Mirror branded app env into ELIZA_* before the shared runtime helpers resolve ports.
syncElizaEnvAliases({
  brandedPrefix: APP_ENV_PREFIX,
  cloudManagedAgentsApiSegment: APP_NAMESPACE,
  appRoutePluginModules: DEFAULT_APP_ROUTE_PLUGIN_MODULES,
});

const viteAllowedHosts: Exclude<
  NonNullable<ServerOptions["allowedHosts"]>,
  true
> = [
  "localhost",
  "127.0.0.1",
  ...toViteAllowedHosts(parseAllowedHostEnv(process.env.ELIZA_ALLOWED_HOSTS)),
];

const NATIVE_PLUGIN_ALIAS_ENTRIES = resolveNativePluginAliasEntries();
const CAPACITOR_BUILD_TARGET =
  process.env.MILADY_CAPACITOR_BUILD_TARGET ??
  process.env.ELIZA_CAPACITOR_BUILD_TARGET ??
  "";
const IS_CAPACITOR_MOBILE_BUILD =
  CAPACITOR_BUILD_TARGET === "ios" || CAPACITOR_BUILD_TARGET === "android";

function appShellMetadataPlugin(): Plugin {
  const manifest = `${JSON.stringify(
    {
      name: APP_SHELL_METADATA.appName,
      short_name: APP_SHELL_METADATA.shortName,
      icons: [
        {
          src: "./android-chrome-192x192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "./android-chrome-512x512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
      theme_color: APP_SHELL_METADATA.themeColor,
      background_color: APP_SHELL_METADATA.backgroundColor,
      display: "standalone",
    },
    null,
    2,
  )}\n`;

  const replacements = new Map<string, string>([
    ["__APP_NAME__", APP_SHELL_METADATA.appName],
    ["__APP_DESCRIPTION__", APP_SHELL_METADATA.description],
    ["__APP_URL__", APP_SHELL_METADATA.appUrl],
    ["__APP_SHARE_IMAGE__", APP_SHELL_METADATA.shareImageUrl],
    ["__APP_THEME_COLOR__", APP_SHELL_METADATA.themeColor],
  ]);

  return {
    name: "app-shell-metadata",
    transformIndexHtml(html) {
      let next = html;
      for (const [token, value] of replacements) {
        next = next.replaceAll(token, value);
      }
      return next;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0];
        if (pathname !== "/site.webmanifest") {
          next();
          return;
        }

        res.setHeader(
          "Content-Type",
          "application/manifest+json; charset=utf-8",
        );
        res.end(manifest);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "site.webmanifest",
        source: manifest,
      });
    },
  };
}

/**
 * Pinned @elizaos/core from the repo root (must match the agent/runtime lock).
 */
function getPinnedElizaCoreVersion(): string {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(miladyRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      overrides?: Record<string, string>;
    };
    const spec =
      raw.dependencies?.["@elizaos/core"] ??
      raw.overrides?.["@elizaos/core"] ??
      "";
    const v = String(spec)
      .trim()
      .replace(/^[\^~]/, "");
    if (v && v !== "workspace:*" && /^\d/.test(v)) {
      const first = v.split(/\s+/)[0];
      if (first) return first;
    }
  } catch {
    /* fall through */
  }
  return "2.0.0-alpha.109";
}

/** Bun cache dir names look like `@elizaos+core@2.0.0-alpha.109+<hash>`. */
function elizaCoreAlphaPrerelease(dir: string): number {
  const m = dir.match(/@elizaos\+core@[\d.]+-alpha\.(\d+)/);
  return m?.[1] ? parseInt(m[1], 10) : -1;
}

function resolveExistingUiSourceModule(id: string) {
  if (fs.existsSync(id)) {
    return id;
  }

  const alternate = id.endsWith(".tsx")
    ? `${id.slice(0, -4)}.ts`
    : id.endsWith(".ts")
      ? `${id.slice(0, -3)}.tsx`
      : null;

  if (alternate && fs.existsSync(alternate)) {
    return alternate;
  }

  return id;
}

/**
 * Bun stores a full npm tarball under node_modules/.bun even when the workspace
 * symlink for @elizaos/core points at an unbuilt local eliza checkout.
 *
 * **WHY sort:** `readdir` order is arbitrary; picking `alpha.12` over `alpha.109`
 * mismatches the API and tends to blank the Electrobun webview.
 */
function findElizaCoreBundleInBunStore(
  kind: "browser" | "node",
): string | null {
  const bunDir = path.join(miladyRoot, "node_modules/.bun");
  const rel =
    kind === "browser"
      ? "node_modules/@elizaos/core/dist/browser/index.browser.js"
      : "node_modules/@elizaos/core/dist/node/index.node.js";
  if (!fs.existsSync(bunDir)) return null;
  let entries: string[];
  try {
    entries = fs.readdirSync(bunDir);
  } catch {
    return null;
  }
  const pinned = getPinnedElizaCoreVersion();
  const pinnedPrefix = `@elizaos+core@${pinned}+`;

  const withDist = entries.filter((dir) => {
    if (!dir.startsWith("@elizaos+core@")) return false;
    return fs.existsSync(path.join(bunDir, dir, rel));
  });

  const pinnedMatch = withDist.find((d) => d.startsWith(pinnedPrefix));
  if (pinnedMatch) return path.join(bunDir, pinnedMatch, rel);

  if (withDist.length === 0) return null;

  withDist.sort(
    (a, b) => elizaCoreAlphaPrerelease(b) - elizaCoreAlphaPrerelease(a),
  );
  const best = withDist[0];
  return best ? path.join(bunDir, best, rel) : null;
}

function normalizeModuleId(id: string | undefined): string {
  return (id ?? "").split(path.sep).join("/");
}

function tryResolveElizaCorePkgDir(): string | null {
  try {
    return path.dirname(_require.resolve("@elizaos/core/package.json"));
  } catch {
    return null;
  }
}

function resolveElizaCoreSourceBrowserPath(): string | null {
  const pkgDir = tryResolveElizaCorePkgDir();
  if (!pkgDir) return null;
  const sourceBrowserEntry = path.join(pkgDir, "src/index.browser.ts");
  return fs.existsSync(sourceBrowserEntry) ? sourceBrowserEntry : null;
}

function isElizaCoreBrowserDistId(id: string | undefined): boolean {
  const normalized = normalizeModuleId(id);
  return (
    normalized.endsWith("/node_modules/@elizaos/core/dist/index.browser.js") ||
    normalized.endsWith(
      "/node_modules/@elizaos/core/dist/browser/index.browser.js",
    ) ||
    normalized.endsWith("/eliza/packages/core/dist/index.browser.js") ||
    normalized.endsWith("/eliza/packages/core/dist/browser/index.browser.js")
  );
}

/**
 * Resolved file path for bundling `@elizaos/core` in the renderer.
 * Linked eliza checkouts sometimes omit `dist/` until `bun run build`;
 * prefer the source browser entry when present, otherwise fall back to
 * built artifacts and then the bun install cache copy.
 */
function resolveElizaCoreBundlePath(): string {
  const pkgDir = tryResolveElizaCorePkgDir();
  const sourceBrowserEntry = resolveElizaCoreSourceBrowserPath();
  if (sourceBrowserEntry) return sourceBrowserEntry;
  if (pkgDir) {
    const browserEntry = path.join(pkgDir, "dist/browser/index.browser.js");
    const nodeEntry = path.join(pkgDir, "dist/node/index.node.js");
    const rootBrowserEntry = path.join(pkgDir, "dist/index.browser.js");
    const rootNodeEntry = path.join(pkgDir, "dist/index.node.js");
    const hasBrowserShimTarget = fs.existsSync(browserEntry);
    const hasNodeShimTarget = fs.existsSync(nodeEntry);
    if (fs.existsSync(browserEntry)) return browserEntry;
    if (fs.existsSync(rootBrowserEntry) && hasBrowserShimTarget)
      return rootBrowserEntry;
    if (fs.existsSync(nodeEntry)) {
      console.warn(
        "[milady][vite] @elizaos/core dist/browser is missing; using dist/node for the client bundle. " +
          "For a linked eliza workspace, run `bun run build` in that checkout (e.g. packages/core). " +
          "Or reinstall with ELIZA_SKIP_LOCAL_ELIZA=1 to use the published npm package.",
      );
      return nodeEntry;
    }
    if (fs.existsSync(rootNodeEntry) && hasNodeShimTarget) {
      console.warn(
        "[milady][vite] @elizaos/core dist/browser is missing; using dist/index.node.js for the client bundle. " +
          "This usually means the local core workspace only has a flat dist/ build artifact.",
      );
      return rootNodeEntry;
    }
  }
  const bunBrowser = findElizaCoreBundleInBunStore("browser");
  if (bunBrowser) {
    console.warn(
      `[milady][vite] @elizaos/core not resolvable from apps/app${pkgDir ? ` (pkgDir=${pkgDir} has no dist/)` : ""}; using bun cache build at ${bunBrowser}. ` +
        "Run `bun run build` in your eliza checkout or ELIZA_SKIP_LOCAL_ELIZA=1 bun install to align versions.",
    );
    return bunBrowser;
  }
  const bunNode = findElizaCoreBundleInBunStore("node");
  if (bunNode) {
    console.warn(
      `[milady][vite] @elizaos/core not resolvable from apps/app${pkgDir ? ` (pkgDir=${pkgDir})` : ""}; using bun cache node bundle at ${bunNode}.`,
    );
    return bunNode;
  }
  throw new Error(
    `[milady][vite] @elizaos/core has no built artifacts${pkgDir ? ` under ${pkgDir}` : " (not resolvable from apps/app)"} and none in node_modules/.bun. ` +
      "Expected src/index.browser.ts, dist/browser/index.browser.js, dist/index.browser.js, dist/node/index.node.js, or dist/index.node.js. " +
      "Build your local eliza workspace or run `ELIZA_SKIP_LOCAL_ELIZA=1 bun install`.",
  );
}

/**
 * Some linked @elizaos/core workspaces have a flat dist/index.browser.js shim
 * even when dist/browser/index.browser.js was never emitted. If anything in the
 * dependency graph resolves that shim directly, redirect it back to the source
 * browser entry so Vite never follows the missing relative import.
 */
function elizaCoreBrowserEntryFallbackPlugin(): Plugin {
  return {
    name: "eliza-core-browser-entry-fallback",
    enforce: "pre",
    resolveId(id, importer) {
      const sourceBrowserEntry = resolveElizaCoreSourceBrowserPath();
      if (!sourceBrowserEntry) return null;
      if (isElizaCoreBrowserDistId(id)) return sourceBrowserEntry;
      if (
        id === "./browser/index.browser.js" &&
        isElizaCoreBrowserDistId(importer)
      ) {
        return sourceBrowserEntry;
      }
      return null;
    },
  };
}

// The dev script sets the branded API port env; default to 31337 for standalone vite dev.
const apiPort = resolveDesktopApiPort(process.env);
const uiPort = resolveDesktopUiPort(process.env);
const viteDevServerRuntime = resolveViteDevServerRuntime(
  process.env,
  uiPort,
  APP_ENV_PREFIX,
);
const enableAppSourceMaps = process.env[BRANDED_ENV.appSourcemap] === "1";
/** Set by eliza/packages/app-core/scripts/dev-platform.mjs for `vite build --watch` (Electrobun desktop). */
const desktopFastDist = process.env[BRANDED_ENV.desktopFastDist] === "1";

function pathIncludesAny(id: string, markers: ReadonlyArray<string>): boolean {
  return markers.some((marker) => id.includes(marker));
}

/**
 * 2026 chunking policy: keep only **vendor splits that pay for themselves
 * via long-term browser caching** (large, stable, change-rarely deps).
 * Workspace code is intentionally NOT manually chunked — Vite's automatic
 * splitting follows the actual import graph and avoids the circular-chunk
 * + empty-chunk + dynamic↔static-collision warnings that plagued the older
 * "one chunk per workspace package" approach. Code splitting that genuinely
 * matters happens at React.lazy() route boundaries, not at the bundler config.
 *
 * Rules of thumb for adding a NODE_MODULE_CHUNK_GROUPS entry:
 *   1. > 100 KB minified, AND
 *   2. Stable across releases (helps long-term caching), AND
 *   3. Loaded on the critical path (or you don't care if it's split out).
 *
 * Don't add a workspace marker. If you need to split a workspace surface
 * out of the main chunk, do it at the call site with React.lazy() — that
 * gives you a real lazy boundary instead of a fake manual chunk that
 * Rollup ends up eagerly merging anyway.
 */
const NODE_MODULE_CHUNK_GROUPS = [
  {
    name: "vendor-langchain",
    markers: ["/@langchain/", "/langsmith/"],
  },
  {
    name: "vendor-zod",
    markers: ["/zod/"],
  },
] as const;

const WORKSPACE_CHUNK_GROUPS = [] as const;

function resolveManualChunk(id: string): string | undefined {
  const normalizedId = id.split(path.sep).join("/");

  if (normalizedId.includes("/node_modules/")) {
    if (
      pathIncludesAny(normalizedId, [
        "/@react-spring/",
        "/react-dom/",
        "/react-is/",
        "/scheduler/",
        "/react/",
      ])
    ) {
      return "vendor-react";
    }

    if (normalizedId.includes("/@pixiv/three-vrm/")) {
      return "vendor-vrm";
    }

    // Collapse all three.js code into one chunk to avoid cross-chunk TDZ
    // init ordering bugs with WebGPU/TSL enums (see fix/three-chunk-tdz).
    if (normalizedId.includes("/three/")) {
      return "vendor-three";
    }

    for (const group of NODE_MODULE_CHUNK_GROUPS) {
      if (pathIncludesAny(normalizedId, group.markers)) {
        return group.name;
      }
    }
  }

  for (const group of WORKSPACE_CHUNK_GROUPS) {
    if (pathIncludesAny(normalizedId, group.markers)) {
      return group.name;
    }
  }

  return undefined;
}

/**
 * Dev-only middleware that handles CORS for the desktop custom-scheme origin
 * (electrobun://-). Vite's proxy doesn't reliably forward CORS headers
 * for non-http origins, so we intercept preflight OPTIONS requests and tag
 * every /api response with the correct headers before the proxy layer.
 */
function envFlagEffective(name: string): "on" | "off" {
  return process.env[name] === "1" ? "on" : "off";
}

function envFlagSource(name: string, whenOn = "1"): string {
  const v = process.env[name]?.trim();
  if (v === whenOn || (whenOn === "1" && v === "true"))
    return `env set — ${name}=${v}`;
  return `default (unset — off)`;
}

function buildViteDevSettingsRows(
  mode: "dev-server" | "build-watch",
): DevSettingsRow[] {
  const apiPref = resolveDesktopApiPortPreference(process.env);
  const uiPref = resolveDesktopUiPortPreference(process.env);
  const apiPort = resolveDesktopApiPort(process.env);
  const uiPort = resolveDesktopUiPort(process.env);
  const assetBase =
    process.env.VITE_ASSET_BASE_URL?.trim() ||
    process.env[BRANDED_ENV.assetBaseUrl]?.trim() ||
    "—";

  return [
    {
      setting: BRANDED_ENV.appSourcemap,
      effective: envFlagEffective(BRANDED_ENV.appSourcemap),
      source: envFlagSource(BRANDED_ENV.appSourcemap),
      change: `export ${BRANDED_ENV.appSourcemap}=1 to enable; unset for off`,
    },
    {
      setting: BRANDED_ENV.desktopFastDist,
      effective: envFlagEffective(BRANDED_ENV.desktopFastDist),
      source: envFlagSource(BRANDED_ENV.desktopFastDist),
      change:
        "set by dev orchestrator for Rollup watch; unset for normal dev server",
    },
    {
      setting: BRANDED_ENV.ttsDebug,
      effective: process.env[BRANDED_ENV.ttsDebug]?.trim() ? "set" : "—",
      source: process.env[BRANDED_ENV.ttsDebug]?.trim()
        ? `env set — ${BRANDED_ENV.ttsDebug}`
        : "default (unset)",
      change: `export ${BRANDED_ENV.ttsDebug}=1 for TTS trace logs`,
    },
    {
      setting: `${BRANDED_ENV.settingsDebug} / ${BRANDED_ENV.viteSettingsDebug}`,
      effective:
        process.env[BRANDED_ENV.settingsDebug]?.trim() ||
        process.env[BRANDED_ENV.viteSettingsDebug]?.trim()
          ? "set"
          : "—",
      source: process.env[BRANDED_ENV.viteSettingsDebug]?.trim()
        ? `env set — ${BRANDED_ENV.viteSettingsDebug}`
        : process.env[BRANDED_ENV.settingsDebug]?.trim()
          ? `env set — ${BRANDED_ENV.settingsDebug}`
          : "default (unset)",
      change: `export ${BRANDED_ENV.settingsDebug}=1 or ${BRANDED_ENV.viteSettingsDebug}=1`,
    },
    {
      setting: `VITE_ASSET_BASE_URL / ${BRANDED_ENV.assetBaseUrl}`,
      effective: assetBase,
      source: process.env.VITE_ASSET_BASE_URL?.trim()
        ? "env set — VITE_ASSET_BASE_URL"
        : process.env[BRANDED_ENV.assetBaseUrl]?.trim()
          ? `env set — ${BRANDED_ENV.assetBaseUrl}`
          : "default (unset — empty)",
      change: `export VITE_ASSET_BASE_URL=… or ${BRANDED_ENV.assetBaseUrl}=…`,
    },
    {
      setting: BRANDED_ENV.devPolling,
      effective: envFlagEffective(BRANDED_ENV.devPolling),
      source: envFlagSource(BRANDED_ENV.devPolling),
      change: `export ${BRANDED_ENV.devPolling}=1 for watch polling (VM/file shares)`,
    },
    {
      setting: "API port (resolved)",
      effective: String(apiPort),
      source: apiPref.sourceLabel,
      change: `${apiPref.changeLabel}; proxy /api → http://127.0.0.1:${apiPort}`,
    },
    {
      setting: "UI port (resolved)",
      effective: String(uiPort),
      source: uiPref.sourceLabel,
      change: uiPref.changeLabel,
    },
    {
      setting: "Mode",
      effective:
        mode === "dev-server" ? "vite dev (HMR)" : "vite build --watch",
      source: "derived",
      change:
        mode === "dev-server"
          ? `bun run dev (default); ${APP_ENV_PREFIX}_DESKTOP_VITE_BUILD_WATCH=1 for Rollup watch`
          : `${APP_ENV_PREFIX}_DESKTOP_VITE_WATCH=1 + ${APP_ENV_PREFIX}_DESKTOP_VITE_BUILD_WATCH=1`,
    },
  ];
}

/** Print effective env once per Vite process (dev server or first Rollup watch tick). */
function appDevSettingsBannerPlugin(): Plugin {
  let printedWatch = false;
  return {
    name: "app-dev-settings-banner",
    configureServer() {
      return () => {
        console.log(
          colorizeDevSettingsStartupBanner(
            prependDevSubsystemFigletHeading(
              "vite",
              formatDevSettingsTable(
                "Vite — effective settings (dev server)",
                buildViteDevSettingsRows("dev-server"),
              ),
            ),
          ),
        );
      };
    },
    buildStart() {
      if (process.env[BRANDED_ENV.desktopFastDist] === "1" && !printedWatch) {
        printedWatch = true;
        console.log(
          colorizeDevSettingsStartupBanner(
            prependDevSubsystemFigletHeading(
              "vite",
              formatDevSettingsTable(
                "Vite — effective settings (build --watch)",
                buildViteDevSettingsRows("build-watch"),
              ),
            ),
          ),
        );
      }
    },
  };
}

function desktopCorsPlugin(): Plugin {
  const accessControlAllowHeaders =
    "Content-Type, Authorization, X-API-Token, X-Api-Key, X-ElizaOS-Client-Id, X-ElizaOS-UI-Language, X-ElizaOS-Token, X-Eliza-Export-Token, X-Eliza-Terminal-Token, X-Milady-CSRF";

  return {
    name: "desktop-cors",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const origin = req.headers.origin;
        if (!origin || !req.url?.startsWith("/api")) return next();

        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          accessControlAllowHeaders,
        );

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        next();
      });
    },
  };
}

/**
 * Generate a virtual ESM module that stubs all exports of a Node built-in.
 * We `require()` the real module at Vite config time (Node process), read its
 * export names, and emit matching no-op stubs so esbuild's static import
 * analysis succeeds.  At runtime these stubs are never meaningfully called
 * because the server-only code paths that use them are never executed in the
 * browser.
 */
function generateNodeBuiltinStub(moduleId: string, req = _require): string {
  const bareModule = moduleId.replace(/^node:/, "");
  const lines = [
    // noop: returns itself (for chained calls like createRequire(url)(id)),
    // and is a valid class base (so `class X extends noop` works).
    "function noop() { return noop; }",
    "const asyncNoop = () => Promise.resolve();",
    "const handler = { get(t, p) { if (typeof p === 'symbol') return undefined; if (p === '__esModule') return true; if (p === 'default') return t; if (p === 'prototype') return {}; return noop; }, has() { return true; }, ownKeys() { return []; }, getOwnPropertyDescriptor() { return { configurable: true, enumerable: true }; } };",
    "const stub = new Proxy({}, handler);",
    "export default stub;",
  ];

  let exportNames: string[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const real = req(bareModule);
    exportNames = Object.keys(real).filter(
      (k) => !k.startsWith("_") && k !== "default",
    );
  } catch {
    // Module not available (e.g. dns/promises on some platforms)
  }

  const reserved = new Set([
    "default",
    "arguments",
    "eval",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "return",
    "super",
    "switch",
    "this",
    "throw",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
  ]);

  for (const name of exportNames) {
    if (reserved.has(name)) continue;
    // Validate it's a valid JS identifier
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) continue;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const real = req(bareModule);
      const val = real[name];
      if (typeof val === "function") {
        if (
          /^[A-Z]/.test(name) &&
          val.prototype &&
          Object.getOwnPropertyNames(val.prototype).length > 1
        ) {
          lines.push(`export class ${name} { constructor() {} }`);
        } else {
          lines.push(`export const ${name} = noop;`);
        }
      } else if (typeof val === "object" && val !== null) {
        // For objects like fs.constants, promises, etc. — wrap in Proxy
        lines.push(`export const ${name} = new Proxy({}, handler);`);
      } else if (typeof val === "string") {
        lines.push(`export const ${name} = ${JSON.stringify(val)};`);
      } else if (typeof val === "number" || typeof val === "boolean") {
        lines.push(`export const ${name} = ${val};`);
      } else {
        lines.push(`export const ${name} = undefined;`);
      }
    } catch {
      lines.push(`export const ${name} = noop;`);
    }
  }

  return lines.join("\n");
}

const SQL_TABLE_EXPORT_NAMES = [
  "agentTable",
  "approvalRequestTable",
  "authAuditEventTable",
  "authBootstrapJtiSeenTable",
  "authIdentityCreatedAtDefault",
  "authIdentityTable",
  "authOwnerBindingTable",
  "authOwnerLoginTokenTable",
  "authSessionTable",
  "cacheTable",
  "channelTable",
  "channelParticipantsTable",
  "componentTable",
  "embeddingTable",
  "entityTable",
  "entityIdentityTable",
  "entityMergeCandidateTable",
  "factCandidateTable",
  "logTable",
  "longTermMemories",
  "memoryTable",
  "memoryAccessLogs",
  "messageTable",
  "messageServerTable",
  "messageServerAgentsTable",
  "pairingAllowlistTable",
  "pairingRequestTable",
  "participantTable",
  "relationshipTable",
  "roomTable",
  "serverTable",
  "sessionSummaries",
  "taskTable",
  "worldTable",
];

function generatePluginSqlStub(strippedId: string): string | null {
  if (
    strippedId !== "@elizaos/plugin-sql/schema" &&
    strippedId !== "@elizaos/plugin-sql"
  ) {
    return null;
  }

  return [
    "const handler = { get: () => table, apply: () => table };",
    "const table = new Proxy(function table() {}, handler);",
    ...SQL_TABLE_EXPORT_NAMES.map((name) => `export const ${name} = table;`),
    ...(strippedId === "@elizaos/plugin-sql"
      ? [
          "export const PGLITE_ERROR_CODES = Object.freeze({ ACTIVE_LOCK: 'ACTIVE_LOCK', CORRUPT_DATA: 'CORRUPT_DATA', MANUAL_RESET_REQUIRED: 'MANUAL_RESET_REQUIRED' });",
          "export const getPgliteErrorCode = () => null;",
          "export const createPgliteInitError = (_code, message) => new Error(message);",
          "export const plugin = table;",
        ]
      : []),
    "export default table;",
  ].join("\n");
}

function generateNodeLlamaCppStub(): string {
  return [
    "const handler = { get: (_, p) => (p === Symbol.toPrimitive ? () => 0 : typeof p === 'string' ? (() => {}) : undefined) };",
    "const stub = new Proxy({}, handler);",
    "export default stub;",
    "export const getLlama = () => Promise.resolve(stub);",
    "export const LlamaLogLevel = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });",
    "export const Llama = stub;",
    "export const LlamaModel = stub;",
    "export const LlamaEmbeddingContext = stub;",
    "export const LlamaContext = stub;",
    "export const LlamaChatSession = stub;",
    "export const LlamaGrammar = stub;",
    "export const LlamaJsonSchemaGrammar = stub;",
  ].join("\n");
}

function generateFsExtraStub(): string {
  return [
    "const noop = () => {};",
    "const stub = new Proxy({}, { get: () => noop });",
    "export default stub;",
    ...[
      "copy",
      "copySync",
      "move",
      "moveSync",
      "remove",
      "removeSync",
      "ensureDir",
      "ensureDirSync",
      "ensureFile",
      "ensureFileSync",
      "mkdirs",
      "mkdirsSync",
      "readJson",
      "readJsonSync",
      "writeJson",
      "writeJsonSync",
      "pathExists",
      "pathExistsSync",
      "outputFile",
      "outputFileSync",
      "outputJson",
      "outputJsonSync",
      "emptyDir",
      "emptyDirSync",
    ].map((n) => `export const ${n} = noop;`),
  ].join("\n");
}

function generateTelegramStub(strippedId: string): string {
  if (strippedId.startsWith("telegram/sessions")) {
    return [
      "export class StringSession { constructor(value = '') { this.value = value; } }",
      "export default { StringSession };",
    ].join("\n");
  }

  return [
    "const noop = () => {};",
    "class SignIn { constructor(input = {}) { Object.assign(this, input); } }",
    "class Authorization { constructor(input = {}) { Object.assign(this, input); } }",
    "const Api = Object.freeze({ auth: Object.freeze({ SignIn, Authorization }) });",
    "class TelegramClient {}",
    "export { Api, TelegramClient };",
    "export default { Api, TelegramClient, noop };",
  ].join("\n");
}

function generateEventsStub(): string {
  return [
    "function EventEmitter() {}",
    "EventEmitter.prototype.on = function() { return this; };",
    "EventEmitter.prototype.off = function() { return this; };",
    "EventEmitter.prototype.emit = function() { return false; };",
    "EventEmitter.prototype.addListener = EventEmitter.prototype.on;",
    "EventEmitter.prototype.removeListener = EventEmitter.prototype.off;",
    "export { EventEmitter };",
    "export default EventEmitter;",
  ].join("\n");
}

function generateUndiciStub(): string {
  return [
    "export const fetch = globalThis.fetch;",
    "export const Request = globalThis.Request;",
    "export const Response = globalThis.Response;",
    "export const Headers = globalThis.Headers;",
    "export const FormData = globalThis.FormData;",
    "export const WebSocket = globalThis.WebSocket;",
    "export const EventSource = globalThis.EventSource || class {};",
    "export const AbortController = globalThis.AbortController;",
    "export const File = globalThis.File;",
    "export const Blob = globalThis.Blob;",
    "export class Agent {}",
    "export class Pool {}",
    "export class Client {}",
    "export class Dispatcher {}",
    "export const setGlobalDispatcher = () => {};",
    "export const getGlobalDispatcher = () => ({});",
    "export default { fetch, Request, Response, Headers, WebSocket };",
  ].join("\n");
}

function generateAsyncHooksStub(): string {
  return [
    "function AsyncLocalStorage() {} AsyncLocalStorage.prototype.getStore = function() { return undefined; }; AsyncLocalStorage.prototype.run = function(store, fn) { return fn.apply(void 0, [].slice.call(arguments, 2)); }; AsyncLocalStorage.prototype.enterWith = function() {}; AsyncLocalStorage.prototype.disable = function() {};",
    "export { AsyncLocalStorage };",
    "export function executionAsyncId() { return 0; }",
    "export function triggerAsyncId() { return 0; }",
    "export function executionAsyncResource() { return {}; }",
    "function AsyncResource() {} AsyncResource.prototype.runInAsyncScope = function(fn) { return fn.apply(void 0, [].slice.call(arguments, 1)); }; AsyncResource.prototype.emitDestroy = function() { return this; }; AsyncResource.prototype.asyncId = function() { return 0; }; AsyncResource.prototype.triggerAsyncId = function() { return 0; };",
    "export { AsyncResource };",
    "export function createHook() { return { enable: function(){}, disable: function(){} }; }",
    "export default { AsyncLocalStorage: AsyncLocalStorage, AsyncResource: AsyncResource, executionAsyncId: executionAsyncId, triggerAsyncId: triggerAsyncId, executionAsyncResource: executionAsyncResource, createHook: createHook };",
  ].join("\n");
}

function generateSharpStub(): string {
  return [
    "function mk() {",
    "  const c = {",
    "    rotate() { return c; },",
    "    resize() { return c; },",
    "    greyscale() { return c; },",
    "    png() { return c; },",
    "    jpeg() { return c; },",
    "    async toBuffer() { return new Uint8Array(0); },",
    "    async raw() { return { data: new Uint8Array(0), info: { width: 1, height: 1, channels: 1 } }; },",
    "  };",
    "  return c;",
    "}",
    "export default function sharp() { return mk(); }",
  ].join("\n");
}

function generatePluginSqlDrizzleStub(): string {
  return [
    "const expr = {};",
    "export const and = () => expr;",
    "export const desc = () => expr;",
    "export const eq = () => expr;",
    "export const isNull = () => expr;",
    "export const lte = () => expr;",
    "export const ne = () => expr;",
    "export default expr;",
  ].join("\n");
}

function generateCapacitorHapticsStub(): string {
  return [
    "const noop = () => {};const noopObj = new Proxy({}, { get: () => noop });",
    "export const Haptics = noopObj;",
    "export const ImpactStyle = Object.freeze({ Heavy: 'HEAVY', Medium: 'MEDIUM', Light: 'LIGHT' });",
    "export const NotificationType = Object.freeze({ Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' });",
    "export default noopObj;",
  ].join("\n");
}

function generateCapacitorKeyboardStub(): string {
  return [
    "const noop = () => {};const noopObj = new Proxy({}, { get: () => noop });",
    "export const Keyboard = noopObj;",
    "export default noopObj;",
  ].join("\n");
}

function generateCapacitorPreferencesStub(): string {
  return [
    "const noop = () => Promise.resolve({ value: null });const noopObj = new Proxy({}, { get: () => noop });",
    "export const Preferences = noopObj;",
    "export default noopObj;",
  ].join("\n");
}

function generateCapacitorPushNotificationsStub(): string {
  return [
    "const asyncNoop = async () => {};",
    "const listenerHandle = { remove: asyncNoop };",
    "export const PushNotifications = {",
    "  requestPermissions: async () => ({ receive: 'denied' }),",
    "  addListener: async () => listenerHandle,",
    "  register: asyncNoop,",
    "  removeAllListeners: asyncNoop,",
    "};",
    "export default PushNotifications;",
  ].join("\n");
}

function generateCapacitorBarcodeScannerStub(): string {
  return [
    "const asyncNoop = async () => ({ ScanResult: '' });",
    "export const CapacitorBarcodeScanner = { scanBarcode: asyncNoop };",
    "export const CapacitorBarcodeScannerTypeHint = Object.freeze({ QR_CODE: 'QR_CODE' });",
    "export default CapacitorBarcodeScanner;",
  ].join("\n");
}

const CAPACITOR_NATIVE_STUB_GENERATORS = new Map<string, () => string>([
  ["@capacitor/haptics", generateCapacitorHapticsStub],
  ["@capacitor/keyboard", generateCapacitorKeyboardStub],
  ["@capacitor/preferences", generateCapacitorPreferencesStub],
  ["@capacitor/push-notifications", generateCapacitorPushNotificationsStub],
  ["@capacitor/barcode-scanner", generateCapacitorBarcodeScannerStub],
]);

function generateCapacitorNativeStub(strippedId: string): string {
  const capPkg = strippedId.split("/").slice(0, 2).join("/");
  const stubGenerator = CAPACITOR_NATIVE_STUB_GENERATORS.get(capPkg);
  if (stubGenerator) return stubGenerator();

  return [
    "const noop = () => {};const stub = new Proxy({}, { get: () => noop });",
    "export default stub;",
  ].join("\n");
}

const NATIVE_MODULE_STUB_GENERATORS = new Map<
  string,
  (strippedId: string) => string
>([
  ["node-llama-cpp", generateNodeLlamaCppStub],
  ["fs-extra", generateFsExtraStub],
  ["telegram", generateTelegramStub],
  ["events", generateEventsStub],
  ["undici", generateUndiciStub],
  ["node:async_hooks", generateAsyncHooksStub],
  ["async_hooks", generateAsyncHooksStub],
]);

function isSharpStubId(strippedId: string): boolean {
  return (
    strippedId === "sharp" ||
    strippedId.startsWith("sharp/") ||
    strippedId.startsWith("@img/sharp")
  );
}

function generateNativeModuleStub(
  strippedId: string,
  capacitorNativeScopeRe: RegExp,
): string {
  const modName = strippedId.split("/")[0];
  const stubGenerator = NATIVE_MODULE_STUB_GENERATORS.get(modName);
  if (stubGenerator) return stubGenerator(strippedId);
  if (modName.startsWith("node:")) return generateNodeBuiltinStub(strippedId);
  if (isSharpStubId(strippedId)) return generateSharpStub();
  if (strippedId === "@elizaos/plugin-sql/drizzle")
    return generatePluginSqlDrizzleStub();

  const pluginSqlStub = generatePluginSqlStub(strippedId);
  if (pluginSqlStub) return pluginSqlStub;
  if (capacitorNativeScopeRe.test(strippedId))
    return generateCapacitorNativeStub(strippedId);

  return "export default {};\n";
}

/**
 * Dev-mode plugin that stubs native-only packages.  In production builds
 * rollupOptions.external handles this, but the Vite dev server still tries
 * to resolve + serve excluded deps.  This plugin intercepts the import at
 * the resolveId stage and returns an empty virtual module so Vite never
 * touches the real CJS files (which fail ESM named-export checks).
 */
function nativeModuleStubPlugin(): Plugin {
  const VIRTUAL_PREFIX = "\0native-stub:";
  // Packages that only run on the server / desktop and must never be
  // parsed by Vite's dev pipeline.
  const nativePackages = new Set([
    "node-llama-cpp",
    "fs-extra",
    "pty-state-capture",
    "pty-console",
    "electron",
    "undici",
    // Image native bindings — never load in the renderer; if a server-only
    // import leaks into the client graph, stub instead of bundling sharp.js.
    "sharp",
    // Browser automation is server-only. If a mixed entrypoint leaks one of
    // these packages into the renderer graph, stub it instead of letting Vite
    // prebundle proxy-agent and other Node-only HTTP deps for the browser.
    "puppeteer-core",
    "@puppeteer/browsers",
    // GramJS / SOCKS networking is Node-only. If Telegram account auth leaks
    // into the renderer graph, stub it before socksclient extends node:net.
    "telegram",
    "socks",
    // Server-only plugins statically imported from the @elizaos/agent runtime.
    // Their exports maps nest browser/node conditional exports that Vite 6's
    // commonjs--resolver cannot walk. Stubbing returns an empty Proxy virtual
    // module so the browser bundle never tries to execute server-only code.
    "@elizaos/plugin-local-embedding",
    "@elizaos/plugin-anthropic",
    "@elizaos/plugin-pdf",
    "@elizaos/plugin-sql",
    "@elizaos/plugin-agent-skills",
    "@elizaos/plugin-agent-orchestrator",
    // OS keychain bridge — Node-only native addon (.node binary). Pulled
    // transitively by @elizaos/vault. Vite's commonjs--resolver chokes on
    // the platform-specific .node files; stub it for the renderer.
    "@napi-rs/keyring",
  ]);
  if (!IS_CAPACITOR_MOBILE_BUILD) {
    // Mobile-only Capacitor llama.cpp runtime. Web/Electrobun builds stub it,
    // but iOS/Android builds must ship its JS bridge so the native plugin can
    // register through @capacitor/core.
    nativePackages.add("llama-cpp-capacitor");
  }
  const nativeScopeRe = /^@node-llama-cpp\//;
  // @napi-rs/keyring fans out into platform packages
  // (@napi-rs/keyring-darwin-arm64, -darwin-x64, -win32-x64-msvc, etc.).
  // Stub the entire scope so we don't have to enumerate every triple.
  const napiRsKeyringScopeRe = /^@napi-rs\/keyring(-.+)?$/;
  // Capacitor native plugins — mobile-only, must never run in the browser.
  // Stubbing prevents Rollup from failing when bun workspaces don't hoist them.
  const capacitorNativeScopeRe = /^@capacitor\/(?!core)(.+)$/;

  return {
    name: "native-module-stub",
    enforce: "pre",
    resolveId(id) {
      // Intercept ALL node: builtins before Vite externalizes them.
      // The @elizaos/core node entry uses many Node APIs (crypto, fs, module,
      // etc.) at the top level.  Rather than stubbing each one individually,
      // we return a Proxy-based virtual module for any node: import.
      if (id.startsWith("node:")) return VIRTUAL_PREFIX + id;
      // Also catch bare imports of Node builtins that get resolved differently
      const nodeBuiltins = new Set([
        "module",
        "crypto",
        "fs",
        "path",
        "os",
        "url",
        "util",
        "stream",
        "http",
        "https",
        "net",
        "tls",
        "zlib",
        "child_process",
        "worker_threads",
        "perf_hooks",
        "async_hooks",
        "dns",
        "dgram",
        "readline",
        "tty",
        "cluster",
        "v8",
        "vm",
        "assert",
        "buffer",
        "string_decoder",
        "querystring",
        "punycode",
      ]);
      if (nodeBuiltins.has(id) || nodeBuiltins.has(id.split("/")[0]))
        return `${VIRTUAL_PREFIX}node:${id}`;
      const bare = id.startsWith("@")
        ? id.split("/").slice(0, 2).join("/")
        : id.split("/")[0];
      // Scoped: @node-llama-cpp/*
      if (nativeScopeRe.test(id)) return VIRTUAL_PREFIX + id;
      // Scoped: @napi-rs/keyring + platform binaries
      if (napiRsKeyringScopeRe.test(id)) return VIRTUAL_PREFIX + id;
      // Capacitor native plugins (@capacitor/* except @capacitor/core)
      if (capacitorNativeScopeRe.test(id) && !IS_CAPACITOR_MOBILE_BUILD) {
        return VIRTUAL_PREFIX + id;
      }
      // sharp's optional platform packages (@img/sharp-wasm32, etc.)
      if (
        id.startsWith("@img/sharp") ||
        id.replace(/\\/g, "/").includes("/@img/sharp")
      )
        return VIRTUAL_PREFIX + id;
      // Exact or sub-path match against native packages
      if (nativePackages.has(bare)) return VIRTUAL_PREFIX + id;
      return null;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null;

      const strippedId = id.slice(VIRTUAL_PREFIX.length);
      return generateNativeModuleStub(strippedId, capacitorNativeScopeRe);
    },
    // Patch @elizaos/core browser entry at transform time to add missing
    // exports and fix browser-incompatible patterns.
    transform(code, id) {
      const isCoreDistFile =
        id.endsWith("index.browser.js") || id.endsWith("index.node.js");
      const normId = id.split(path.sep).join("/");
      const isCorePackagePath =
        normId.includes("/node_modules/@elizaos/core/") ||
        normId.includes("packages/core/dist/");
      if (!isCoreDistFile || !isCorePackagePath) return null;

      // Fix AsyncLocalStorage: the browser entry has a try/catch that does
      //   let {AsyncLocalStorage:$} = (() => {throw new Error(...)})()
      // Rollup/esbuild may optimize the throw into (()=>({})) which makes
      // AsyncLocalStorage undefined, causing "xte is not a constructor".
      // Replace the broken IIFE pattern with a working stub class.
      const patched = code.replace(
        /\(\(\)\s*=>\s*\{\s*throw\s+new\s+Error\(\s*"Cannot require module "\s*\+\s*"node:async_hooks"\s*\)\s*;\s*\}\)\(\)/g,
        "(function(){function A(){} A.prototype.getStore=function(){return undefined};A.prototype.run=function(s,fn){return fn.apply(void 0,[].slice.call(arguments,2))};A.prototype.enterWith=function(){};A.prototype.disable=function(){};return{AsyncLocalStorage:A}})()",
      );
      // Names that downstream plugins and the agent runtime
      // import from @elizaos/core but that are missing from the browser entry.
      const missingExports: Record<string, string> = {
        resolveSecretKeyAlias: "function(k){return k}",
        SECRET_KEY_ALIASES: "{}",
        OnboardingStateMachine: "function(){}",
        isOnboardingComplete: "function(){return false}",
        AgentEventService: "function(){}",
        AutonomyService: "function(){}",
        createBasicCapabilitiesPlugin: "function(){return{name:'stub'}}",
      };
      // Check which are actually missing from the existing export block
      const needed = Object.keys(missingExports).filter((n) => {
        // Check if already exported (as named export or re-export alias)
        const exportedAs = new RegExp(`\\b${n}\\b`);
        // Search only in export{} blocks
        const exportBlocks = patched.match(/export\s*\{[^}]+\}/g) || [];
        return !exportBlocks.some((b) => exportedAs.test(b));
      });
      if (needed.length === 0 && patched === code) return null;
      // Use unique prefixed names to avoid collisions with minified vars
      const prefix = "__milady_stub_";
      const stubs = needed
        .map((n) => `var ${prefix}${n} = ${missingExports[n]};`)
        .join("\n");
      const exports =
        needed.length > 0
          ? `export { ${needed.map((n) => `${prefix}${n} as ${n}`).join(", ")} };`
          : "";
      return { code: `${patched}\n${stubs}\n${exports}`, map: null };
    },
  };
}

/**
 * Patch the final bundle output to fix AsyncLocalStorage stubs.
 *
 * langsmith imports `{ AsyncLocalStorage } from "node:async_hooks"` at the
 * top level. Vite's dep optimizer and Rollup inline the virtual-module stub
 * as `(()=>({}))`, making AsyncLocalStorage `undefined` and causing
 * `new undefined` → "xte is not a constructor" at runtime in mobile webviews.
 *
 * This plugin replaces the empty-object stub with a proper class in the
 * final rendered chunks.
 */
function asyncLocalStoragePatchPlugin(): Plugin {
  return {
    name: "async-local-storage-patch",
    enforce: "post",
    renderChunk(code) {
      // Match: var{AsyncLocalStorage:<id>}=(()=>({}))
      const re =
        /var\s*\{\s*AsyncLocalStorage\s*:\s*(\w+)\s*\}\s*=\s*\(\s*\(\s*\)\s*=>\s*\(\s*\{\s*\}\s*\)\s*\)/g;
      if (!re.test(code)) return null;
      re.lastIndex = 0;
      const patched = code.replace(re, (_match, id) => {
        // Use block-body arrow + named class — concise arrow with inline
        // anonymous class fails in older WebViews (Chrome 124 and below).
        return `var{AsyncLocalStorage:${id}}=(()=>{function A(){} A.prototype.getStore=function(){return undefined};A.prototype.run=function(s,fn){return fn.apply(void 0,[].slice.call(arguments,2))};A.prototype.enterWith=function(){};A.prototype.disable=function(){};return{AsyncLocalStorage:A}})()`;
      });
      return { code: patched, map: null };
    },
  };
}

function watchWorkspacePackagesPlugin(): Plugin {
  return {
    name: "watch-workspace-packages",
    configureServer(server) {
      const workspacePackagesRoot = path.resolve(miladyRoot, "packages");
      if (fs.existsSync(workspacePackagesRoot)) {
        server.watcher.add(workspacePackagesRoot);
      }
      if (fs.existsSync(nativePluginsRoot)) {
        server.watcher.add(nativePluginsRoot);
      }
      server.watcher.on("change", (file) => {
        if (file.includes("/packages/")) {
          if (file.endsWith("package.json")) {
            server.restart();
          } else {
            // Force a full reload on any other package file change (e.g. ts/tsx files)
            server.hot.send({ type: "full-reload" });
          }
        }
      });
    },
  };
}

function resolveOptionalPackagePublicDir(packageName: string): string | null {
  try {
    return path.join(
      path.dirname(_require.resolve(`${packageName}/package.json`)),
      "public",
    );
  } catch {
    return null;
  }
}

/**
 * Serve @elizaos/app-companion's public/ assets when that optional package is
 * installed. The decoupled Milady shell does not require the package.
 */
function companionAssetsPlugin(): Plugin {
  const companionPublic = resolveOptionalPackagePublicDir(
    "@elizaos/app-companion",
  );
  return {
    name: "companion-assets",
    configureServer(server) {
      // Serve companion public as fallback (after app public)
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const clean = req.url.split("?")[0];
        if (!companionPublic) return next();
        const filePath = path.join(companionPublic, clean);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          res.setHeader(
            "Content-Type",
            filePath.endsWith(".wasm")
              ? "application/wasm"
              : filePath.endsWith(".js")
                ? "application/javascript"
                : "application/octet-stream",
          );
          fs.createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });
    },
    closeBundle() {
      // Copy companion public to dist at build time
      if (companionPublic && fs.existsSync(companionPublic)) {
        const outDir = path.resolve(here, "dist");
        fs.cpSync(companionPublic, outDir, { recursive: true, force: false });
      }
    },
  };
}

function workspaceJsxInJsPlugin(): Plugin {
  const normalizedAppCoreSrcRoot = appCoreSrcRoot
    ? appCoreSrcRoot.split(path.sep).join("/")
    : null;

  return {
    name: "workspace-jsx-in-js",
    enforce: "pre",
    async transform(code, id) {
      const cleanId = id.split("?")[0];
      const normalizedId = cleanId.split(path.sep).join("/");
      if (!cleanId.endsWith(".js")) return null;
      if (!normalizedAppCoreSrcRoot) return null;
      if (!normalizedId.startsWith(`${normalizedAppCoreSrcRoot}/`)) return null;

      return transformWithEsbuild(code, cleanId, {
        loader: "jsx",
        jsx: "automatic",
        sourcemap: true,
      });
    },
  };
}

export default defineConfig({
  root: here,
  customLogger: viteLogger,
  base: "./",
  // Keep pre-bundle cache under the app dir (not node_modules/.vite) so Bun
  // installs don't fight Vite, and `bun run clean` / docs can target one path.
  cacheDir: path.resolve(here, ".vite"),
  publicDir: path.resolve(here, "public"),
  define: {
    global: "globalThis",
    // Mirror the branded TTS debug env into the client bundle so one env
    // enables UI + server TTS logs in dev.
    [`import.meta.env.${BRANDED_ENV.ttsDebug}`]: JSON.stringify(
      process.env[BRANDED_ENV.ttsDebug] ?? "",
    ),
    [`import.meta.env.${BRANDED_ENV.settingsDebug}`]: JSON.stringify(
      process.env[BRANDED_ENV.settingsDebug] ?? "",
    ),
    [`import.meta.env.${BRANDED_ENV.viteSettingsDebug}`]: JSON.stringify(
      process.env[BRANDED_ENV.viteSettingsDebug] ?? "",
    ),
    "import.meta.env.VITE_ASSET_BASE_URL": JSON.stringify(
      process.env.VITE_ASSET_BASE_URL ??
        process.env[BRANDED_ENV.assetBaseUrl] ??
        "",
    ),
  },
  plugins: [
    appShellMetadataPlugin(),
    companionAssetsPlugin(),
    elizaCoreBrowserEntryFallbackPlugin(),
    nativeModuleStubPlugin(),
    asyncLocalStoragePatchPlugin(),
    watchWorkspacePackagesPlugin(),
    workspaceJsxInJsPlugin(),
    tailwindcss(),
    react(),
    desktopCorsPlugin(),
    appDevSettingsBannerPlugin(),
  ],
  esbuild: {
    // Override tsconfig target — some extended configs use ES2024 which older
    // esbuild does not recognize; this avoids "Unrecognized target environment"
    // warnings regardless of tsconfig resolution.
    target: "es2022",
  },
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "three",
      "@capacitor/core",
      "@elizaos/app-core",
    ],
    alias: [
      // Bare Node built-in polyfills for browser — pathe provides ESM path,
      // events is pre-bundled via optimizeDeps.
      { find: /^path$/, replacement: patheEntry },
      { find: /^@capacitor\/core$/, replacement: capacitorCoreEntry },
      // Aliases for Capacitor packages that may not be hoisted to root node_modules
      // by bun workspaces. Apps/app resolves them; eliza submodule sources cannot.
      ...(capacitorKeyboardEntry
        ? [
            {
              find: /^@capacitor\/keyboard$/,
              replacement: capacitorKeyboardEntry,
            },
          ]
        : []),
      ...(capacitorPreferencesEntry
        ? [
            {
              find: /^@capacitor\/preferences$/,
              replacement: capacitorPreferencesEntry,
            },
          ]
        : []),
      ...(capacitorAppEntry
        ? [{ find: /^@capacitor\/app$/, replacement: capacitorAppEntry }]
        : []),
      // Keep this subpath on the concrete source file so Docker/Vite builds
      // do not fall back to the extensionless tsconfig wildcard rewrite.
      {
        find: /^@elizaos\/app-core\/platform\/native-plugin-entrypoints$/,
        replacement: appCoreNativePluginEntrypoints,
      },
      {
        find: /^@elizaos\/app-core\/platform\/native-plugin-entrypoints\.js$/,
        replacement: appCoreNativePluginEntrypoints,
      },
      // Node built-in subpaths that browser polyfills don't provide.
      // Server-only code imports these but they're never executed in-browser.
      ...["util/types", "stream/promises", "stream/web"].flatMap((sub) => [
        {
          find: `node:${sub}`,
          replacement: emptyNodeModuleEntry,
        },
        {
          find: sub,
          replacement: emptyNodeModuleEntry,
        },
      ]),
      {
        find: /^telegram(\/.*)?$/,
        replacement: emptyNodeModuleEntry,
      },
      // @napi-rs/keyring is the OS keychain bridge used by @elizaos/vault.
      // It's strictly server-side (Node-only native bindings to libsecret /
      // Keychain / Credential Manager) and is never invoked in the WebView,
      // but vault.ts still has a static type import + dynamic `await import`
      // that Rollup follows into the .node binary, exploding the web build
      // with `Unexpected "\x7f"` (the ELF magic). Stub for browser bundles —
      // the runtime code path that would call openKeyring() doesn't run on
      // Capacitor/Electrobun renderers.
      {
        find: /^@napi-rs\/keyring(\/.*)?$/,
        replacement: emptyNodeModuleEntry,
      },
      {
        find: /^@napi-rs\/keyring-/,
        replacement: emptyNodeModuleEntry,
      },
      {
        find: /^@clawville\/app-clawville(\/.*)?$/,
        replacement: optionalElizaAppStubEntry,
      },
      {
        find: /^@elizaos\/app-hyperscape\/ui(\/.*)?$/,
        replacement: optionalElizaAppStubEntry,
      },
      {
        find: optionalElizaAppAliasPattern,
        replacement: optionalElizaAppStubEntry,
      },
      {
        find: /^@elizaos\/capacitor-.+$/,
        replacement: nativePluginStubEntry,
      },
      // Capacitor plugins — resolve to local plugin sources
      ...NATIVE_PLUGIN_ALIAS_ENTRIES,
      // Local source aliases are only installed when the eliza checkout exists.
      // Published-only builds should resolve normal @elizaos package exports.
      ...resolveLocalUiAliases(),
      ...resolveLocalElizaAppAliases(),
      ...resolveLocalSharedAliases(),
      ...resolveLocalAppCoreAliases(),
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      // Three.js core + all subpath imports must be pre-bundled together so
      // esbuild shares a single module identity.
      "three",
      "three/examples/jsm/controls/OrbitControls.js",
      "three/examples/jsm/libs/meshopt_decoder.module.js",
      "three/examples/jsm/loaders/DRACOLoader.js",
      "three/examples/jsm/loaders/GLTFLoader.js",
      "three/examples/jsm/loaders/FBXLoader.js",
    ],
    // Remap node: builtins to npm polyfills during dep optimization so
    // esbuild doesn't externalize them as "browser-external:node:*".
    esbuildOptions: {
      // Must match build/esbuild targets: Vite's dep optimizer otherwise
      // defaults to legacy browser targets (chrome87, safari14, …) and
      // esbuild fails with "Transforming destructuring … is not supported yet"
      // across modern node_modules (Radix, three, zod, etc.).
      target: "es2022",
      plugins: [
        {
          name: "workspace-jsx-in-js",
          setup(build) {
            const normalizedAppCoreSrcRoot = appCoreSrcRoot
              ? appCoreSrcRoot.split(path.sep).join("/")
              : null;

            build.onLoad({ filter: /\.js$/ }, (args) => {
              const normalizedPath = args.path.split(path.sep).join("/");
              if (!normalizedAppCoreSrcRoot) {
                return null;
              }
              if (!normalizedPath.startsWith(`${normalizedAppCoreSrcRoot}/`)) {
                return null;
              }

              return {
                contents: fs.readFileSync(args.path, "utf8"),
                loader: "jsx",
              };
            });
          },
        },
        {
          name: "node-builtins-polyfill",
          setup(build) {
            // Map node: builtins to their npm polyfill packages.
            // require.resolve("events") returns the bare name on Node 22+, so
            // we resolve via the polyfill's package.json to get an absolute path.
            const polyfills: Record<string, string> = {};
            for (const [nodeId, pkg, entry] of [
              ["node:events", "events", "events.js"],
              ["node:buffer", "buffer", "index.js"],
              ["node:util", "util", "util.js"],
              ["node:process", "process", "browser.js"],
              ["node:stream", "stream-browserify", "index.js"],
              ["stream", "stream-browserify", "index.js"],
            ] as const) {
              try {
                const pkgDir = path.dirname(
                  _require.resolve(`${pkg}/package.json`),
                );
                polyfills[nodeId] = path.join(pkgDir, entry);
              } catch {
                // polyfill not installed
              }
            }
            for (const [nodeId, absPath] of Object.entries(polyfills)) {
              const re = new RegExp(`^${nodeId.replace(":", "\\:")}$`);
              build.onResolve({ filter: re }, () => ({ path: absPath }));
            }
            // For all OTHER node: builtins, provide empty stubs via
            // generateNodeBuiltinStub so esbuild doesn't externalize them.
            build.onResolve({ filter: /^node:/ }, (args) => ({
              path: args.path,
              namespace: "node-stub",
            }));
            build.onLoad({ filter: /.*/, namespace: "node-stub" }, (args) => ({
              contents: generateNodeBuiltinStub(args.path),
              loader: "js",
            }));
          },
        },
      ],
    },
    exclude: [
      "node-llama-cpp",
      "@node-llama-cpp/mac-arm64-metal",
      // Contains native-only pty-state-capture / pty-console imports; skip pre-bundling.
      "@elizaos/plugin-agent-orchestrator",
      "pty-console",
      // Built-in secrets live in @elizaos/core features; Vite must not externalize them as a separate package.
      // Node-only HTTP client — crashes in browser, stub via nativeModuleStubPlugin
      "undici",
      // Browser automation is server-only and pulls in proxy-agent/httpUtil.
      "puppeteer-core",
      "@puppeteer/browsers",
      // Telegram account auth is server-only and pulls in GramJS + socks.
      "telegram",
      "socks",
      // Native LLM embedding — uses node-llama-cpp, never runs in browser
      "@elizaos/plugin-local-embedding",
    ],
  },
  build: {
    outDir: path.resolve(here, "dist"),
    // Watch + incremental: avoid wiping dist each cycle; keeps Electrobun reloads fast.
    emptyOutDir: !desktopFastDist,
    sourcemap: desktopFastDist ? false : enableAppSourceMaps,
    target: "es2022",
    // Keep warnings tight enough to catch regressions while allowing the
    // current largest workspace chunks to build without noise.
    // Electrobun ships the bundle with the desktop app — there is no
    // first-paint network cost for the user. The remaining ~4MB main
    // chunk is the merged workspace surface (app-core + companion +
    // steward + task-coordinator + vincent + screenshare); splitting
    // them via manual chunks reintroduces circular-chunk + empty-chunk
    // warnings without measurable benefit. If a true cold-start budget
    // matters later, lift owner-of-route lazy() boundaries at the call
    // sites that own a single import path (route-level splits land in
    // their own chunks naturally — see AppsPageView / AutomationsView /
    // SettingsView / StreamView / etc. above).
    chunkSizeWarningLimit: 5000,
    minify: desktopFastDist ? false : undefined,
    cssMinify: desktopFastDist ? false : undefined,
    reportCompressedSize: !desktopFastDist,
    rollupOptions: {
      // Native-only deps that must not be resolved during the browser build.
      // Node built-ins (node:fs, fs, path, etc.) are NOT externalized here —
      // they are intercepted by nativeModuleStubPlugin which replaces them
      // with no-op Proxy stubs. Externalizing them causes Rollup to emit
      // bare `import "node:fs"` in output chunks, which the browser rejects
      // with a CSP violation.
      external: (id) => {
        if (
          [
            "pty-state-capture",
            "pty-console",
            "electron",
            "node-llama-cpp",
            "pty-manager",
            // `@stwd/sdk/auth` dynamic-imports `@simplewebauthn/browser`, but
            // Milady's main app never loads the auth surface (it's used only by
            // eliza/cloud). Externalize so Rollup doesn't traverse the dynamic
            // import chain looking for the missing peer dep.
            "@simplewebauthn/browser",
          ].includes(id)
        )
          return true;
        // OS keychain native addon. Renderer never calls keyring directly —
        // it goes through the API. Externalize the umbrella + platform
        // binaries so Rollup doesn't try to bundle the .node files.
        if (/^@napi-rs\/keyring(-.+)?$/.test(id)) return true;
        if (/^@node-llama-cpp\//.test(id)) return true;
        return false;
      },
      input: {
        main: path.resolve(here, "index.html"),
      },
      output: {
        manualChunks: resolveManualChunk,
      },
    },
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
  server: {
    host: true,
    port: uiPort,
    strictPort: true,
    allowedHosts: viteAllowedHosts,
    // Only pin the dev origin when the desktop shell explicitly asks for a
    // loopback public URL. Capacitor live reload and LAN/browser clients need
    // Vite to keep serving the current request host instead of rewriting
    // module URLs back to 127.0.0.1.
    ...(viteDevServerRuntime.origin
      ? { origin: viteDevServerRuntime.origin }
      : {}),
    hmr: viteDevServerRuntime.hmr,
    cors: {
      origin: true,
      credentials: true,
    },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            if (!res.headersSent) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "API server unavailable" }));
            }
          });
        },
      },
      "/ws": {
        target: `ws://127.0.0.1:${apiPort}`,
        ws: true,
        configure: (proxy) => {
          // Suppress noisy ECONNREFUSED errors during API restart.
          // Clients reconnect automatically via the WS reconnect loop.
          proxy.on("error", () => {});
        },
      },
      // elizaOS plugin-music-player HTTP routes live outside /api (e.g. /music-player/stream).
      "/music-player": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            if (!res.headersSent) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "API server unavailable" }));
            }
          });
        },
      },
    },
    fs: {
      // Allow serving files from the app directory and milady src
      allow: [here, miladyRoot],
    },
    watch: {
      // Polling is only needed in Docker/WSL where native fs events are unreliable
      usePolling: process.env[BRANDED_ENV.devPolling] === "1",
      // Electrobun postBuild copies renderer HTML/assets into electrobun/build/.
      // Watching those paths triggers full reloads while deps are still optimizing,
      // which breaks with "chunk-*.js does not exist" in node_modules/.vite/deps.
      ignored: ["**/electrobun/build/**", "**/electrobun/artifacts/**"],
    },
  },
});
