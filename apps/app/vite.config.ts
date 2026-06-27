import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Type-only import is erased by esbuild's config bundler (no runtime resolution).
import type { DevSettingsRow } from "@elizaos/shared/dev-settings-table";
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

// Load the shared dev-settings + runtime-env helpers through the package `exports`
// map (compiled dist JS) instead of reaching into the eliza/ clone source. Resolving
// with `_require.resolve(...)` honors package exports and ignores tsconfig `paths`, so
// it lands on dist/*.js in BOTH packages mode (CI; eliza/ absent) and local mode. This
// avoids the relative-into-eliza break (CI Build) and the `@elizaos/shared/<subpath>`
// -> src/*.ts self-import break that reverted commit b3060bf16; the computed specifier
// also stops esbuild from statically rewriting it to source during config bundling.
const { colorizeDevSettingsStartupBanner } = (await import(
  _require.resolve("@elizaos/shared/dev-settings-banner-style")
)) as typeof import("@elizaos/shared/dev-settings-banner-style");
const { prependDevSubsystemFigletHeading } = (await import(
  _require.resolve("@elizaos/shared/dev-settings-figlet-heading")
)) as typeof import("@elizaos/shared/dev-settings-figlet-heading");
const { formatDevSettingsTable } = (await import(
  _require.resolve("@elizaos/shared/dev-settings-table")
)) as typeof import("@elizaos/shared/dev-settings-table");
const {
  resolveDesktopApiPort,
  resolveDesktopApiPortPreference,
  resolveDesktopUiPort,
  resolveDesktopUiPortPreference,
} = (await import(
  _require.resolve("@elizaos/shared/runtime-env")
)) as typeof import("@elizaos/shared/runtime-env");

const here = path.dirname(fileURLToPath(import.meta.url));
const miladyRoot = path.resolve(here, "../..");
const capacitorCoreEntry = _require.resolve("@capacitor/core");
const publishedSharedCharacterPresetsEntry = (() => {
  try {
    return _require.resolve("@elizaos/shared/character-presets");
  } catch {
    return path.resolve(
      here,
      "../../eliza/packages/shared/dist/character-presets.js",
    );
  }
})();
const patheEntry = _require.resolve("pathe");
const optionalElizaAppStubEntry = path.join(
  here,
  "src/optional-eliza-app-stub.tsx",
);
const nativePluginStubEntry = path.join(here, "src/native-plugin-stubs.ts");
const localElizaRoot = path.join(miladyRoot, "eliza");

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
  const explicitSourceMode = (
    process.env.MILADY_ELIZA_SOURCE ?? process.env.ELIZA_SOURCE
  )
    ?.trim()
    .toLowerCase();
  if (explicitSourceMode) {
    return ["local", "source", "workspace"].includes(explicitSourceMode);
  }
  if (
    process.env.MILADY_SKIP_LOCAL_UPSTREAMS === "1" ||
    process.env.ELIZA_SKIP_LOCAL_UPSTREAMS === "1"
  ) {
    return false;
  }
  return (
    process.env.MILADY_FORCE_LOCAL_UPSTREAMS === "1" ||
    process.env.ELIZA_FORCE_LOCAL_UPSTREAMS === "1" ||
    fs.existsSync(path.join(localElizaRoot, "package.json")) ||
    resolvesInsideLocalElizaWorkspace("@elizaos/app-core/package.json")
  );
}

function resolvesInsideLocalElizaWorkspace(id: string): boolean {
  try {
    const localRoot = fs.realpathSync(localElizaRoot);
    const resolved = fs.realpathSync(_require.resolve(id));
    return (
      resolved === localRoot || resolved.startsWith(`${localRoot}${path.sep}`)
    );
  } catch {
    return false;
  }
}

const hasLocalElizaWorkspace =
  shouldUseLocalElizaSource() &&
  fs.existsSync(path.join(localElizaRoot, "package.json"));
const nativePluginsRoot = path.join(localElizaRoot, "packages/native-plugins");
const nativeBunRuntimePluginEntry = path.join(
  localElizaRoot,
  "plugins/plugin-native-bun-runtime/src/index.ts",
);
const appCoreSrcRoot = hasLocalElizaWorkspace
  ? path.join(localElizaRoot, "packages/app-core/src")
  : null;
const emptyNodeModuleEntry = appCoreSrcRoot
  ? path.join(appCoreSrcRoot, "platform/empty-node-module.ts")
  : requireResolve("@elizaos/app-core/platform/empty-node-module");
// `native-plugin-entrypoints` is only imported on iOS/Android at runtime, but
// vite must still statically resolve the specifier. Upstream eliza may remove
// this file (mobile Capacitor wiring is in flux) — fall back to the empty
// stub so desktop builds keep working when the source is absent.
const appCoreNativePluginEntrypoints = (() => {
  if (appCoreSrcRoot) {
    const localPath = path.join(
      appCoreSrcRoot,
      "platform/native-plugin-entrypoints.ts",
    );
    return fs.existsSync(localPath) ? localPath : emptyNodeModuleEntry;
  }
  return requireResolve("@elizaos/app-core/platform/native-plugin-entrypoints");
})();
const uiPkgRoot = hasLocalElizaWorkspace
  ? path.join(localElizaRoot, "packages/ui")
  : null;
const securityPkgSrcRoot = hasLocalElizaWorkspace
  ? path.join(localElizaRoot, "packages/security/src")
  : null;
const vaultPkgRoot = hasLocalElizaWorkspace
  ? path.join(localElizaRoot, "packages/vault")
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

function stringifyBuildLogMessage(message: unknown): string {
  if (!message || typeof message !== "object") {
    return typeof message === "string" ? message : String(message ?? "");
  }
  const record = message as {
    code?: unknown;
    id?: unknown;
    message?: unknown;
    plugin?: unknown;
  };
  return [record.code, record.message, record.id, record.plugin]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

function isThreeVrmWebGpuExportWarning(text: string): boolean {
  return (
    text.includes("IMPORT_IS_UNDEFINED") &&
    text.includes("Import `tslFn`") &&
    text.includes("three.webgpu")
  );
}

function isPgliteEvalWarning(text: string): boolean {
  return (
    text.includes("Use of direct eval") && text.includes("@electric-sql/pglite")
  );
}

function isStaticLazyImportCollisionWarning(text: string): boolean {
  if (text.includes("INEFFECTIVE_DYNAMIC_IMPORT")) return false;
  return (
    text.includes("dynamically imported") &&
    (text.includes("@capacitor/core") ||
      text.includes("@capacitor/preferences") ||
      text.includes("components/views/view-interact-registry.ts"))
  );
}

const INEFFECTIVE_DYNAMIC_IMPORT_TOLERATED_MARKERS = [
  "../../eliza/packages/ui/src/",
  "../../eliza/packages/app-core/src/browser.ts",
  "src/optional-eliza-app-stub.tsx",
  "src/native-plugin-stubs.ts",
  "native-stub:node:fs/promises",
] as const;

function isToleratedIneffectiveDynamicImportWarning(text: string): boolean {
  if (!text.includes("INEFFECTIVE_DYNAMIC_IMPORT")) return false;
  // Deliberate suppression, not a real fix: these modules are both lazy-loaded
  // by elizaOS route/view registries and statically reachable through UI
  // barrels or desktop shell imports. The real cleanup is to untangle those
  // barrels/ownership paths so route modules have a single import path.
  return INEFFECTIVE_DYNAMIC_IMPORT_TOLERATED_MARKERS.some((marker) =>
    text.includes(marker),
  );
}

function isViteDynamicImportAnalysisWarning(text: string): boolean {
  if (!text.includes("dynamic import cannot be analyzed by Vite")) {
    return false;
  }
  // Fallback path only: dist/node dynamic imports (plugin loader, AI providers).
  // Primary renderer bundle uses index.browser.ts — these should not appear in dev.
  return (
    text.includes("@elizaos/core") ||
    text.includes("index.node.js") ||
    text.includes("index.browser.js")
  );
}

function isKnownToleratedBuildWarning(message: unknown): boolean {
  const text = stringifyBuildLogMessage(message);
  if (isThreeVrmWebGpuExportWarning(text)) {
    // Deliberate suppression, not a real fix: @pixiv/three-vrm still references
    // the old three.webgpu `tslFn` export. Remove this only after upgrading or
    // patching the VRM/WebGPU dependency path and smoke-testing avatar loading.
    return true;
  }
  return (
    isPgliteEvalWarning(text) ||
    isStaticLazyImportCollisionWarning(text) ||
    isToleratedIneffectiveDynamicImportWarning(text) ||
    isViteDynamicImportAnalysisWarning(text)
  );
}

const viteLogger = createLogger();
const viteLoggerError = viteLogger.error;
const viteLoggerWarn = viteLogger.warn;
const viteLoggerWarnOnce = viteLogger.warnOnce;
viteLogger.error = (message, options) => {
  if (isExpectedWsProxySocketError(message, options?.error)) {
    return;
  }
  viteLoggerError(message, options);
};
viteLogger.warn = (message, options) => {
  if (isKnownToleratedBuildWarning(message)) {
    return;
  }
  viteLoggerWarn(message, options);
};
viteLogger.warnOnce = (message, options) => {
  if (isKnownToleratedBuildWarning(message)) {
    return;
  }
  viteLoggerWarnOnce(message, options);
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
  const aliases: Alias[] = [];
  if (hasLocalElizaWorkspace && fs.existsSync(nativeBunRuntimePluginEntry)) {
    aliases.push({
      find: /^@elizaos\/capacitor-bun-runtime$/,
      replacement: nativeBunRuntimePluginEntry,
    });
  }
  if (!hasLocalElizaWorkspace || !fs.existsSync(nativePluginsRoot)) {
    return aliases;
  }

  return aliases.concat(
    fs
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
      })),
  );
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
      find: /^@elizaos\/ui\/api$/,
      replacement: path.join(uiPkgRoot, "src/api/index.ts"),
    },
    {
      find: /^@elizaos\/ui\/browser$/,
      replacement: path.join(uiPkgRoot, "src/browser.ts"),
    },
    {
      find: /^@elizaos\/ui\/browser\.js$/,
      replacement: path.join(uiPkgRoot, "src/browser.ts"),
    },
    {
      find: /^@elizaos\/ui\/api\/(.+)$/,
      replacement: `${uiPkgRoot}/src/api/$1`,
    },
    {
      find: /^@elizaos\/ui\/platform$/,
      replacement: path.join(uiPkgRoot, "src/platform/index.ts"),
    },
    {
      find: /^@elizaos\/ui\/platform\/(.*)$/,
      replacement: `${uiPkgRoot}/src/platform/$1`,
    },
    {
      find: /^@elizaos\/ui\/voice$/,
      replacement: path.join(uiPkgRoot, "src/voice/index.ts"),
    },
    {
      find: /^@elizaos\/ui\/voice\/(.*)$/,
      replacement: `${uiPkgRoot}/src/voice/$1`,
    },
    {
      find: /^@elizaos\/ui\/components\/ui\/(.*)$/,
      replacement: `${uiPkgRoot}/src/components/ui/$1`,
    },
    {
      find: /^@elizaos\/ui\/components\/composites\/([^/]+)$/,
      replacement: `${uiPkgRoot}/src/components/composites/$1/index.ts`,
    },
    {
      find: /^@elizaos\/ui\/components\/composites\/(.+)\/([^/]+)$/,
      replacement: `${uiPkgRoot}/src/components/composites/$1/$2`,
    },
    {
      find: /^@elizaos\/ui\/components\/(.+)\/([^/]+)$/,
      replacement: `${uiPkgRoot}/src/components/$1/$2`,
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
      find: /^@elizaos\/ui\/platform$/,
      replacement: path.join(uiPkgRoot, "src/platform/index.ts"),
    },
    {
      find: /^@elizaos\/ui\/platform\/(.+)$/,
      replacement: `${uiPkgRoot}/src/platform/$1`,
    },
    {
      find: /^@elizaos\/ui\/state$/,
      replacement: path.join(uiPkgRoot, "src/state/index.ts"),
    },
    {
      find: /^@elizaos\/ui\/state\/(.+)$/,
      replacement: `${uiPkgRoot}/src/state/$1`,
    },
    {
      find: /^@elizaos\/ui\/lib\/(.*)$/,
      replacement: `${uiPkgRoot}/src/lib/$1.ts`,
    },
    {
      find: /^@elizaos\/ui\/(.+)$/,
      replacement: `${uiPkgRoot}/src/$1`,
    },
  ];
}

function resolveLocalVaultAliases(): Alias[] {
  if (
    !vaultPkgRoot ||
    !fs.existsSync(path.join(vaultPkgRoot, "package.json"))
  ) {
    return [];
  }

  return [
    {
      find: /^@elizaos\/vault$/,
      replacement: path.join(vaultPkgRoot, "src/index.ts"),
    },
  ];
}

function resolveLocalElizaAppAliases(): Alias[] {
  if (!hasLocalElizaWorkspace) return [];

  function resolveExportTarget(value: unknown): string | null {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    for (const condition of ["source", "import", "default", "types"]) {
      const target = record[condition];
      if (typeof target === "string") return target;
    }
    return null;
  }

  function resolveRuntimeTarget(pkgDir: string, exportTarget: string): string {
    if (exportTarget.startsWith("./dist/")) {
      const sourceTarget = exportTarget
        .replace(/^\.\/dist\//, "./src/")
        .replace(/\.js$/, ".ts");
      const sourcePath = resolveExistingUiSourceModule(
        path.resolve(pkgDir, sourceTarget),
      );
      if (fs.existsSync(sourcePath)) {
        return sourcePath;
      }
    }

    const distPath = path.resolve(pkgDir, exportTarget);
    if (fs.existsSync(distPath)) {
      return distPath;
    }

    return distPath;
  }

  const aliases: Alias[] = [];
  const packageRoots = [
    { dir: path.join(localElizaRoot, "plugins"), appPrefixOnly: true },
    { dir: path.join(localElizaRoot, "apps"), appPrefixOnly: false },
  ];

  for (const packageRoot of packageRoots) {
    if (!fs.existsSync(packageRoot.dir)) continue;

    for (const entry of fs.readdirSync(packageRoot.dir, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      if (packageRoot.appPrefixOnly && !entry.name.startsWith("app-")) {
        continue;
      }
      const pkgPath = path.join(packageRoot.dir, entry.name, "package.json");
      if (!fs.existsSync(pkgPath)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
        name?: string;
        exports?: Record<string, unknown>;
      };
      const pkgName = pkg.name;
      if (!pkgName) continue;
      const pkgDir = path.dirname(pkgPath);

      for (const [key, value] of Object.entries(pkg.exports || {})) {
        const exportTarget = resolveExportTarget(value);
        if (!exportTarget) continue;
        const resolvedTarget = path.resolve(pkgDir, exportTarget);
        // Only create an alias when the target file actually exists on disk.
        // In a fresh local clone, dist/ may not be built yet. Skipping the
        // alias lets the import fall through to the stub or npm package.
        if (!fs.existsSync(resolvedTarget)) continue;
        const aliasKey =
          key === "." ? pkgName : `${pkgName}/${key.replace(/^\.\//, "")}`;
        aliases.push({
          find: new RegExp(`^${escapeRegExp(aliasKey)}$`),
          replacement: resolveRuntimeTarget(pkgDir, exportTarget),
        });
      }

      // Only add the src catch-all if at least one export target exists (i.e.
      // the package has been built). Otherwise skip to avoid resolving src/
      // imports for packages that are stubs or not yet compiled.
      const hasSrcDir = fs.existsSync(path.join(pkgDir, "src"));
      const hasBuiltExport = aliases.some((a) => {
        const re = a.find;
        return re instanceof RegExp && re.test(pkgName);
      });
      if (hasSrcDir && hasBuiltExport) {
        aliases.push({
          find: new RegExp(`^${escapeRegExp(pkgName)}/(.*)`),
          replacement: path.resolve(pkgDir, "src/$1"),
        });
      }
    }
  }

  return aliases;
}

function resolveLocalSharedAliases(): Alias[] {
  if (!hasLocalElizaWorkspace) return [];

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

  function resolveSharedExportTarget(value: unknown): string | null {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    for (const condition of ["source", "import", "default", "types"]) {
      const target = record[condition];
      if (typeof target === "string") return target;
    }
    return null;
  }

  for (const [key, value] of Object.entries(sharedPkg.exports || {})) {
    if (key.includes("*")) continue;
    const exportTarget = resolveSharedExportTarget(value);
    if (!exportTarget) continue;
    const aliasKey =
      key === "."
        ? "@elizaos/shared"
        : `@elizaos/shared/${key.replace(/^\.\//, "")}`;
    aliases.push({
      find: new RegExp(`^${escapeRegExp(aliasKey)}$`),
      replacement: path.resolve(sharedPkgDir, exportTarget),
    });
  }
  return aliases;
}

function resolveLocalSharedCompatAliases(): Alias[] {
  if (!hasLocalElizaWorkspace) return [];

  const characterPresetsEntry = path.join(
    localElizaRoot,
    "packages/shared/src/character-presets.ts",
  );
  if (!fs.existsSync(characterPresetsEntry)) return [];

  return [
    {
      find: /^@elizaos\/shared\/onboarding-presets$/,
      replacement: characterPresetsEntry,
    },
  ];
}

function resolveBuiltLocalSharedAliases(): Alias[] {
  if (!hasLocalElizaWorkspace) return [];

  const sharedDistDir = path.join(localElizaRoot, "packages/shared/dist");
  const sharedDist = path.join(sharedDistDir, "index.js");
  if (!fs.existsSync(sharedDist)) return [];

  return [
    {
      find: /^@elizaos\/shared$/,
      replacement: sharedDist,
    },
    {
      find: /^@elizaos\/shared\/(.+)$/,
      replacement: `${sharedDistDir}/$1.js`,
    },
  ];
}

function resolveLocalAppCoreAliases(): Alias[] {
  // Map @elizaos/agent's root import to its real source so static named
  // imports from compiled app-core code (e.g. account-pool.js's
  // ACCOUNT_CREDENTIAL_PROVIDER_IDS) resolve. Server-only runtime branches
  // tree-shake out for the renderer; the previous empty-module stub only
  // had a default export and broke Rollup's static analysis.
  const agentRootEntry = appCoreSrcRoot
    ? path.join(localElizaRoot, "packages/agent/src/index.ts")
    : emptyNodeModuleEntry;
  const packageAgnosticAliases: Alias[] = [
    {
      find: /^@elizaos\/agent$/,
      replacement: agentRootEntry,
    },
    {
      find: /^@elizaos\/core$/,
      replacement: resolveElizaCoreBundlePath(),
    },
    {
      find: /^@elizaos\/core\/node$/,
      replacement: resolveElizaCoreBundlePath(),
    },
    {
      find: /^@elizaos\/shared\/character-presets$/,
      replacement: publishedSharedCharacterPresetsEntry,
    },
    // When a local eliza workspace is present and @elizaos/shared has been
    // built, prefer the local dist over the bun-store published copy which
    // may lag behind and miss exports added in the local workspace.
    ...resolveBuiltLocalSharedAliases(),
  ];

  const appCorePkgPath = path.join(
    localElizaRoot,
    "packages/app-core/package.json",
  );
  if (!appCoreSrcRoot || !fs.existsSync(appCorePkgPath)) {
    return packageAgnosticAliases;
  }

  const appCorePkgDir = path.dirname(appCorePkgPath);
  const appCoreBrowserEntry = path.join(here, "src/app-core-browser-compat.js");
  const appCorePkg = JSON.parse(fs.readFileSync(appCorePkgPath, "utf8")) as {
    exports?: Record<string, unknown>;
  };

  const generatedAliases: Alias[] = [];

  // Bare `@elizaos/app-core` resolves to `src/browser.ts` which now
  // re-exports the full `dist/index.js` surface (so milady's `main.tsx`
  // sees `DesktopOnboardingRuntime`, `AppProvider`, etc.) plus the
  // hand-written browser shims on top. The server-only re-exports
  // inside dist (account-pool, onboarding-routes, …) are kept
  // renderer-safe by aliasing the underlying `@elizaos/agent` and
  // `@elizaos/plugin-elizacloud` server packages to their browser-side
  // stubs in `nativeModuleStubPlugin` + the empty-node-module bake-in.
  generatedAliases.push({
    find: /^@elizaos\/app-core$/,
    replacement: appCoreBrowserEntry,
  });

  for (const [key, value] of Object.entries(appCorePkg.exports || {})) {
    if (key === ".") continue; // handled by the explicit bare alias above
    const aliasKey =
      key === "."
        ? "@elizaos/app-core"
        : `@elizaos/app-core/${key.replace(/^\.\//, "")}`;

    // Resolve the string value, handling both plain strings and conditional exports.
    const resolvedValue: string | null =
      typeof value === "string"
        ? value
        : typeof value === "object" && value !== null
          ? ((value as Record<string, string>).import ??
            (value as Record<string, string>).default ??
            null)
          : null;

    // CSS files in app-core exports point to dist paths (e.g. ./styles/styles.css).
    // In Wave A these moved to @elizaos/ui. If the dist path doesn't exist locally,
    // redirect to the UI source CSS so a fresh local clone builds without errors.
    if (aliasKey.endsWith(".css") && resolvedValue) {
      const distCssPath = path.resolve(appCorePkgDir, resolvedValue);
      const baseName = path.basename(resolvedValue);
      const uiCssPath = uiPkgRoot
        ? path.join(uiPkgRoot, "src/styles", baseName)
        : null;
      const resolvedPath = fs.existsSync(distCssPath)
        ? distCssPath
        : uiCssPath && fs.existsSync(uiCssPath)
          ? uiCssPath
          : null;
      if (resolvedPath) {
        generatedAliases.push({
          find: new RegExp(`^${escapeRegExp(aliasKey)}$`),
          replacement: resolvedPath,
        });
      }
      continue;
    }

    const targetPath =
      key === "."
        ? appCoreBrowserEntry
        : resolvedValue
          ? path.resolve(appCorePkgDir, resolvedValue)
          : null;
    if (!targetPath) continue;

    generatedAliases.push({
      find: new RegExp(`^${escapeRegExp(aliasKey)}$`),
      replacement: targetPath,
    });
    if (!aliasKey.endsWith(".js")) {
      generatedAliases.push({
        find: new RegExp(`^${escapeRegExp(aliasKey)}\\.js$`),
        replacement: targetPath,
      });
    }
  }

  const uiSource = path.join(appCoreSrcRoot, "ui");
  const uiPkgSrcRoot = uiPkgRoot ? path.join(uiPkgRoot, "src") : null;
  const legacyAppCoreUiAliases: Alias[] = uiPkgSrcRoot
    ? [
        {
          find: /^@elizaos\/app-core$/,
          replacement: appCoreBrowserEntry,
        },
        {
          find: /^@elizaos\/app-core\.js$/,
          replacement: appCoreBrowserEntry,
        },
        {
          find: /^@elizaos\/app-core\/styles\/(.*)$/,
          replacement: `${uiPkgSrcRoot}/styles/$1`,
        },
        {
          find: /^@elizaos\/app-core\/api$/,
          replacement: path.join(uiPkgSrcRoot, "api/index.ts"),
        },
        {
          find: /^@elizaos\/app-core\/components\/character\/CharacterEditor$/,
          replacement: path.join(
            uiPkgSrcRoot,
            "components/character/CharacterEditor.tsx",
          ),
        },
        {
          find: /^@elizaos\/app-core\/components\/chat\/widgets\/types$/,
          replacement: path.join(
            uiPkgSrcRoot,
            "components/chat/widgets/types.ts",
          ),
        },
        {
          find: /^@elizaos\/app-core\/components\/(.+)$/,
          replacement: `${uiPkgSrcRoot}/components/$1`,
        },
        {
          find: /^@elizaos\/app-core\/platform$/,
          replacement: path.join(uiPkgSrcRoot, "platform/index.ts"),
        },
        {
          find: /^@elizaos\/app-core\/state\/(.+)$/,
          replacement: `${uiPkgSrcRoot}/state/$1`,
        },
        {
          find: /^@elizaos\/app-core\/utils$/,
          replacement: path.join(uiPkgSrcRoot, "utils/index.ts"),
        },
        {
          find: /^@elizaos\/app-core\/utils\/(.+)$/,
          replacement: `${uiPkgSrcRoot}/utils/$1`,
        },
        {
          find: /^@elizaos\/app-core\/widgets\/(.+)$/,
          replacement: `${uiPkgSrcRoot}/widgets/$1`,
        },
      ]
    : [];

  return [
    ...generatedAliases,
    ...legacyAppCoreUiAliases,
    {
      find: /^@elizaos\/app-core\/(.+)$/,
      replacement: `${appCoreSrcRoot}/$1`,
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
    ...(securityPkgSrcRoot
      ? [
          {
            find: /^@elizaos\/security$/,
            replacement: path.join(securityPkgSrcRoot, "index.ts"),
          },
          {
            find: /^@elizaos\/security\/(.+)$/,
            replacement: `${securityPkgSrcRoot}/$1`,
          },
        ]
      : []),
    ...packageAgnosticAliases,
  ];
}

function resolveAppBrandingForViteConfig() {
  return {
    appName: appConfig.appName,
    orgName: appConfig.orgName,
    repoName: appConfig.repoName,
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
  ...(process.env.ELIZA_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
];

const NATIVE_PLUGIN_ALIAS_ENTRIES = resolveNativePluginAliasEntries();
const LOCAL_ELIZA_APP_ALIAS_ENTRIES = resolveLocalElizaAppAliases();
const CAPACITOR_BUILD_TARGET =
  process.env.MILADY_CAPACITOR_BUILD_TARGET ??
  process.env.ELIZA_CAPACITOR_BUILD_TARGET ??
  "";
const IS_CAPACITOR_MOBILE_BUILD =
  CAPACITOR_BUILD_TARGET === "ios" || CAPACITOR_BUILD_TARGET === "android";
const ELIZA_CAPACITOR_PLUGIN_STUB_PATTERN = IS_CAPACITOR_MOBILE_BUILD
  ? /^@elizaos\/capacitor-(?!(agent|bun-runtime|llama)(?:$|\/)).+$/
  : /^@elizaos\/capacitor-.+$/;

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
  const candidates = [id];
  if (id.endsWith(".tsx")) {
    const base = id.slice(0, -4);
    candidates.push(
      `${base}.ts`,
      base,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
    );
  } else if (id.endsWith(".ts")) {
    const base = id.slice(0, -3);
    candidates.push(
      `${base}.tsx`,
      base,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
    );
  } else if (id.endsWith(".js")) {
    const base = id.slice(0, -3);
    candidates.push(
      `${base}.ts`,
      `${base}.tsx`,
      base,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
    );
  } else if (!path.extname(id)) {
    candidates.push(
      `${id}.ts`,
      `${id}.tsx`,
      path.join(id, "index.ts"),
      path.join(id, "index.tsx"),
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return id;
}

function isExistingFile(id: string): boolean {
  return fs.existsSync(id) && fs.statSync(id).isFile();
}

function applyRegexReplacement(
  source: string,
  find: RegExp,
  replacement: string,
): string | null {
  const match = source.match(find);
  if (!match) return null;
  return replacement.replace(/\$(\d+)/g, (_token, indexText: string) => {
    const index = Number(indexText);
    return match[index] ?? "";
  });
}

type LocalSourceAliasSpec = {
  find: RegExp;
  replacement: string;
  resolve: (id: string) => string;
};

function resolveAppCoreWithUiFallback(id: string): string {
  if (fs.existsSync(id)) {
    // A subpath like `@elizaos/app-core/api/auth` can map to a directory when
    // eliza refactors a single file into a folder (api/auth.ts -> api/auth/index.ts).
    // fs.existsSync() is true for directories, so resolve the directory's index
    // instead of returning the dir itself (which vite tries to read -> EISDIR).
    if (fs.statSync(id).isDirectory()) {
      for (const idx of [`${id}/index.ts`, `${id}/index.tsx`]) {
        if (fs.existsSync(idx)) return idx;
      }
    } else {
      return id;
    }
  }
  const withTsx = id.endsWith(".tsx") ? id : `${id}.tsx`;
  if (fs.existsSync(withTsx)) return withTsx;
  const withTs = id.endsWith(".ts") ? id : `${id}.ts`;
  if (fs.existsSync(withTs)) return withTs;
  if (uiPkgRoot && appCoreSrcRoot) {
    const uiComponentsSourceDir = path.join(uiPkgRoot, "src");
    const relativeToSrc = id.includes(`${appCoreSrcRoot}/`)
      ? id.slice(appCoreSrcRoot.length + 1)
      : null;
    if (relativeToSrc) {
      const uiEquiv = path.join(uiComponentsSourceDir, relativeToSrc);
      if (fs.existsSync(uiEquiv)) return uiEquiv;
      const uiEquivTsx = `${uiEquiv}.tsx`;
      if (fs.existsSync(uiEquivTsx)) return uiEquivTsx;
      const uiEquivTs = `${uiEquiv}.ts`;
      if (fs.existsSync(uiEquivTs)) return uiEquivTs;
    }
  }
  return id;
}

function getUiAliasFallbackSpecs(): LocalSourceAliasSpec[] {
  if (!uiPkgRoot || !fs.existsSync(path.join(uiPkgRoot, "package.json"))) {
    return [];
  }
  return [
    {
      find: /^@elizaos\/ui\/api\/(.+)$/,
      replacement: `${uiPkgRoot}/src/api/$1.ts`,
      resolve: resolveExistingUiSourceModule,
    },
    {
      find: /^@elizaos\/ui\/platform\/(.*)$/,
      replacement: `${uiPkgRoot}/src/platform/$1.ts`,
      resolve: resolveExistingUiSourceModule,
    },
    {
      find: /^@elizaos\/ui\/voice\/(.*)$/,
      replacement: `${uiPkgRoot}/src/voice/$1.ts`,
      resolve: resolveExistingUiSourceModule,
    },
    ...getUiComponentAliasFallbackSpecs(),
    {
      find: /^@elizaos\/ui\/platform\/(.+)$/,
      replacement: `${uiPkgRoot}/src/platform/$1.ts`,
      resolve: resolveExistingUiSourceModule,
    },
    {
      find: /^@elizaos\/ui\/state\/(.+)$/,
      replacement: `${uiPkgRoot}/src/state/$1.ts`,
      resolve: resolveExistingUiSourceModule,
    },
    {
      find: /^@elizaos\/ui\/(.+)$/,
      replacement: `${uiPkgRoot}/src/$1.ts`,
      resolve: resolveExistingUiSourceModule,
    },
  ];
}

function getUiComponentAliasFallbackSpecs(): LocalSourceAliasSpec[] {
  if (!uiPkgRoot) return [];
  return [
    {
      find: /^@elizaos\/ui\/components\/ui\/(.*)$/,
      replacement: `${uiPkgRoot}/src/components/ui/$1.tsx`,
      resolve: resolveExistingUiSourceModule,
    },
    {
      find: /^@elizaos\/ui\/components\/composites\/(.+)\/([^/]+)$/,
      replacement: `${uiPkgRoot}/src/components/composites/$1/$2.tsx`,
      resolve: resolveExistingUiSourceModule,
    },
    {
      find: /^@elizaos\/ui\/components\/(.+)\/([^/]+)$/,
      replacement: `${uiPkgRoot}/src/components/$1/$2.tsx`,
      resolve: resolveExistingUiSourceModule,
    },
  ];
}

function getAppCoreUiFallbackSpecs(): LocalSourceAliasSpec[] {
  if (!appCoreSrcRoot || !uiPkgRoot) return [];
  const uiSrcRoot = path.join(uiPkgRoot, "src");
  return [
    {
      find: /^@elizaos\/app-core\/components\/(.+)$/,
      replacement: `${uiSrcRoot}/components/$1`,
      resolve: resolveExistingUiSourceModule,
    },
    {
      find: /^@elizaos\/app-core\/state\/(.+)$/,
      replacement: `${uiSrcRoot}/state/$1.ts`,
      resolve: resolveExistingUiSourceModule,
    },
    {
      find: /^@elizaos\/app-core\/utils\/(.+)$/,
      replacement: `${uiSrcRoot}/utils/$1.ts`,
      resolve: resolveExistingUiSourceModule,
    },
    {
      find: /^@elizaos\/app-core\/widgets\/(.+)$/,
      replacement: `${uiSrcRoot}/widgets/$1.ts`,
      resolve: resolveExistingUiSourceModule,
    },
  ];
}

function getAppCoreAliasFallbackSpecs(): LocalSourceAliasSpec[] {
  if (!appCoreSrcRoot) return [];
  return [
    {
      find: /^@elizaos\/app-core\/(.+)$/,
      replacement: `${appCoreSrcRoot}/$1`,
      resolve: resolveAppCoreWithUiFallback,
    },
  ];
}

function getLocalSourceAliasFallbackSpecs(): LocalSourceAliasSpec[] {
  return [
    ...getUiAliasFallbackSpecs(),
    ...getAppCoreUiFallbackSpecs(),
    ...getAppCoreAliasFallbackSpecs(),
  ];
}

function resolveLocalSourceAliasFallback(source: string): string | null {
  for (const spec of getLocalSourceAliasFallbackSpecs()) {
    const replaced = applyRegexReplacement(source, spec.find, spec.replacement);
    if (!replaced) continue;
    const resolved = spec.resolve(replaced);
    if (isExistingFile(resolved)) return resolved;
  }
  return null;
}

function localSourceAliasFallbackPlugin(): Plugin {
  return {
    name: "milady-local-source-alias-fallback",
    enforce: "pre",
    resolveId(source) {
      return resolveLocalSourceAliasFallback(source);
    },
  };
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
  // Prefer the local workspace checkout — _require.resolve would otherwise
  // land on the npm-installed bun store copy (older published build) and miss
  // exports that only exist in the local source or a freshly-built dist.
  if (hasLocalElizaWorkspace) {
    const localCoreDir = path.join(localElizaRoot, "packages/core");
    if (fs.existsSync(path.join(localCoreDir, "package.json"))) {
      return localCoreDir;
    }
  }
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
 * Always prefer the browser entry (source → dist → bun cache). The node
 * bundle is server-only; shipping it to the client pulls in runtime
 * dynamic imports Vite cannot analyze and bloats the renderer chunk.
 * nativeModuleStubPlugin + missing-export stubs cover gaps in the browser entry.
 */
function resolveElizaCoreBundlePath(): string {
  const pkgDir = tryResolveElizaCorePkgDir();

  const sourceBrowserEntry = resolveElizaCoreSourceBrowserPath();
  if (sourceBrowserEntry) return sourceBrowserEntry;

  if (pkgDir) {
    const browserEntry = path.join(pkgDir, "dist/browser/index.browser.js");
    const rootBrowserEntry = path.join(pkgDir, "dist/index.browser.js");
    if (fs.existsSync(browserEntry)) return browserEntry;
    if (fs.existsSync(rootBrowserEntry) && fs.existsSync(browserEntry)) {
      return rootBrowserEntry;
    }
  }

  const bunBrowser = findElizaCoreBundleInBunStore("browser");
  if (bunBrowser) return bunBrowser;

  if (pkgDir) {
    const nodeEntry = path.join(pkgDir, "dist/node/index.node.js");
    const rootNodeEntry = path.join(pkgDir, "dist/index.node.js");
    if (fs.existsSync(nodeEntry)) {
      console.warn(
        "[milady][vite] @elizaos/core browser entry unavailable; falling back to dist/node for the client bundle. " +
          "Run `bun run build` in packages/core (or the eliza checkout) to emit dist/browser.",
      );
      return nodeEntry;
    }
    if (fs.existsSync(rootNodeEntry)) {
      console.warn(
        "[milady][vite] @elizaos/core browser entry unavailable; using dist/index.node.js for the client bundle.",
      );
      return rootNodeEntry;
    }
  }

  const bunNode = findElizaCoreBundleInBunStore("node");
  if (bunNode) {
    console.warn(
      `[milady][vite] @elizaos/core browser entry unavailable; using bun cache node bundle at ${bunNode}.`,
    );
    return bunNode;
  }

  throw new Error(
    `[milady][vite] @elizaos/core has no browser artifacts${pkgDir ? ` under ${pkgDir}` : " (not resolvable from apps/app)"} and none in node_modules/.bun. ` +
      "Expected src/index.browser.ts or dist/browser/index.browser.js. " +
      "Build packages/core in your eliza checkout or run `ELIZA_SKIP_LOCAL_ELIZA=1 bun install`.",
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
    // noop / stub: function-wrapped Proxies so:
    //   * `class X extends noop` works (Proxy wraps a callable)
    //   * arbitrary property access falls through to noop (`fs.realpath.native`)
    //   * mutation traps (set / defineProperty) don't throw under strict mode
    //   * `instanceof`, `default`, `__esModule` resolve sensibly for ESM<->CJS
    "function noopFn() { return noop; }",
    "const handler = { get(t, p) { if (typeof p === 'symbol') return undefined; if (p === '__esModule') return true; if (p === 'default') return noop; if (p === 'prototype') return {}; if (p in t) return t[p]; return noop; }, set(t, p, v) { try { t[p] = v; } catch {} return true; }, has() { return true; }, ownKeys(t) { return Reflect.ownKeys(t); }, getOwnPropertyDescriptor(t, p) { return Reflect.getOwnPropertyDescriptor(t, p) || { configurable: true, enumerable: true }; }, apply() { return noop; }, construct() { return noop; }, defineProperty(t, p, d) { try { Object.defineProperty(t, p, { configurable: true, writable: true, enumerable: true, ...d }); } catch {} return true; } };",
    "const noop = new Proxy(noopFn, handler);",
    "const stub = noop;",
    "const asyncNoop = () => Promise.resolve();",
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
          // Class constructors: return the noop proxy so that
          // `new Resolver().setServers(...)` and similar instance-method
          // accesses on the stubbed object don't throw. Wrap in a Proxy
          // so static-method access (Buffer.from, Symbol.hasInstance) also
          // falls through to noop instead of being undefined.
          lines.push(
            `class __${name}Class { constructor() { return noop; } }`,
            `export const ${name} = new Proxy(__${name}Class, { get(t, p) { if (p === 'prototype' || p === 'name' || p === 'length' || (typeof p === 'symbol')) { return Reflect.get(t, p); } if (p in t) return t[p]; return noop; }, construct() { return noop; } });`,
          );
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

/**
 * Build a stub module with explicit named exports for every name a
 * server-only @elizaos plugin's consumers reference. Named imports must
 * resolve statically; a default-export Proxy doesn't satisfy them.
 * Renderer never invokes these — the API child owns the real impls —
 * so each export is a benign noop.
 */
function generateNamedExportStub(names: readonly string[]): string {
  const lines: string[] = [
    "const noop = () => undefined;",
    "const asyncNoop = async () => undefined;",
  ];
  for (const name of names) {
    lines.push(`export const ${name} = noop;`);
  }
  lines.push("export default new Proxy(noop, { get: () => noop });");
  // Quiet "unused" in case the noop branches aren't referenced.
  lines.push("void asyncNoop;");
  return `${lines.join("\n")}\n`;
}

// Names enumerated from `eliza/packages/app-core/dist/**` static imports
// of each server-only @elizaos plugin. Update when a build error shows
// a new MISSING_EXPORT in this scope.
const PLUGIN_ELIZACLOUD_STUB_NAMES = [
  "__resetCloudBaseUrlCache",
  "clearCloudSecrets",
  "CloudOnboardingResult",
  "CloudRouteState",
  "CloudWalletDescriptor",
  "CloudWalletProvider",
  "ElizaCloudClient",
  "elizaOSCloudPlugin",
  "ensureCloudTtsApiKeyAlias",
  "getCloudSecret",
  "getOrCreateClientAddressKey",
  "handleCloudBillingRoute",
  "handleCloudCompatRoute",
  "handleCloudRelayRoute",
  "handleCloudRoute",
  "handleCloudStatusRoutes",
  "handleCloudTtsPreviewRoute",
  "isCloudProvisionedContainer",
  "mirrorCompatHeaders",
  "normalizeCloudSecret",
  "normalizeCloudSiteUrl",
  "persistCloudWalletCache",
  "provisionCloudWalletsBestEffort",
  "resolveCloudApiBaseUrl",
  "resolveCloudApiKey",
  "resolveCloudTtsBaseUrl",
  "resolveElevenLabsApiKeyForCloudMode",
  "validateCloudBaseUrl",
] as const;

function generatePluginElizacloudStub(): string {
  return generateNamedExportStub(PLUGIN_ELIZACLOUD_STUB_NAMES);
}

// Names actually imported from @elizaos/plugin-local-inference by server-only
// agent runtime modules. The renderer never enters those code paths; the
// stub satisfies Rollup's static analysis and trees away at module init.
const PLUGIN_LOCAL_INFERENCE_STUB_NAMES = [
  "getLocalInferenceActiveModelId",
  "getLocalInferenceActiveSnapshot",
  "getLocalInferenceChatStatus",
  "handleLocalInferenceChatCommand",
  "handleLocalInferenceRoutes",
] as const;

function generatePluginLocalInferenceStub(): string {
  return generateNamedExportStub(PLUGIN_LOCAL_INFERENCE_STUB_NAMES);
}

function generateAgentPluginAutoEnableStub(): string {
  return [
    "export const CONNECTOR_PLUGINS = {};",
    "export const AUTH_PROVIDER_PLUGINS = {};",
    "export const STREAMING_PLUGINS = {};",
    "export const isConnectorConfigured = () => false;",
    "export const isStreamingDestinationConfigured = () => false;",
    "export const applyPluginSelfDeclaredAutoEnable = () => {};",
    "export const applyPluginAutoEnable = (params = {}) => ({ config: params.config, changes: [] });",
    "export default {};",
  ].join("\n");
}

const ELIZA_AGENT_OBJECT_STUB_NAMES = [
  "AUDIT_EVENT_TYPES",
  "AUDIT_SEVERITIES",
  "CONFIG_WRITE_ALLOWED_TOP_KEYS",
  "CONNECTOR_ENV_MAP",
  "CONNECTOR_IDS",
  "CORE_PLUGINS",
  "EMBEDDING_PRESETS",
  "CHANNEL_PLUGIN_MAP",
] as const;

const ELIZA_AGENT_ARRAY_STUB_NAMES = [
  "AGENT_EVENT_ALLOWED_STREAMS",
  "TRIGGER_TASK_TAGS",
] as const;

const ELIZA_AGENT_FUNCTION_STUB_NAMES = [
  "applyCanonicalOnboardingConfig",
  "applyCloudConfigToEnv",
  "applyN8nConfigToEnv",
  "applyOnboardingCredentialPersistence",
  "applyPluginRuntimeMutation",
  "bootElizaRuntime",
  "buildCharacterFromConfig",
  "buildTriggerConfig",
  "buildTriggerMetadata",
  "checkForUpdate",
  "classifyRegistryPluginRelease",
  "clearPersistedOnboardingConfig",
  "cloneWithoutBlockedObjectKeys",
  "collectConfigEnvVars",
  "collectConnectorEnvVars",
  "collectPluginNames",
  "configureLocalEmbeddingPlugin",
  "createElizaPlugin",
  "createEngine",
  "createIntegrationTelemetrySpan",
  "detectBestEngine",
  "detectEmbeddingTier",
  "discoverInstalledPlugins",
  "discoverPluginsFromManifest",
  "ensureApiTokenForBindHost",
  "estimateExportSize",
  "executeTriggerTask",
  "exportAgent",
  "extractAuthToken",
  "fetchWithTimeoutGuard",
  "findPrimaryEnvKey",
  "formatVaultRef",
  "getAccessToken",
  "getAuditFeedSize",
  "getLastFailedPluginNames",
  "getPluginInfo",
  "getTriggerHealthSnapshot",
  "getTriggerLimit",
  "getWalletAddresses",
  "handleAccountsRoutes",
  "handleAgentAdminRoutes",
  "handleAgentLifecycleRoutes",
  "handleAgentTransferRoutes",
  "handleCharacterRoutes",
  "handleCloudBillingRoute",
  "handleCloudCompatRoute",
  "handleCloudRoute",
  "handleDiagnosticsRoutes",
  "handleMemoryRoutes",
  "handlePermissionRoutes",
  "handleRegistryRoutes",
  "handleSubscriptionRoutes",
  "handleTrainingRoutes",
  "handleTriggerRoutes",
  "importAgent",
  "initStewardWalletCache",
  "injectApiBaseIntoHtml",
  "isAdvancedCapabilityPluginId",
  "isAllowedHost",
  "isAuthorized",
  "isAutomationConversationMetadata",
  "isLoopbackHost",
  "isPlainObject",
  "isPluginManagerLike",
  "isSafeResetStateDir",
  "isVaultRef",
  "listProviderAccounts",
  "listTriggerTasks",
  "loadElizaConfig",
  "normalizeCloudSiteUrl",
  "normalizeTriggerDraft",
  "normalizeWsClientId",
  "parseVaultRef",
  "persistConfigEnv",
  "persistConversationRoomTitle",
  "queryAuditFeed",
  "readBundledPluginPackageMetadata",
  "readConfigEnv",
  "readJsonBody",
  "readRequestBody",
  "readRequestBodyBuffer",
  "readTriggerConfig",
  "readTriggerRuns",
  "registerJsRuntimeFactory",
  "requestRestart",
  "resolveAdvancedCapabilitiesEnabled",
  "resolveAppHeroImage",
  "resolveChannel",
  "resolveCloudApiBaseUrl",
  "resolveConfigPath",
  "resolveCorsOrigin",
  "resolveDefaultAgentWorkspaceDir",
  "resolveElizaVersion",
  "resolveMcpServersRejection",
  "resolveMcpTerminalAuthorizationRejection",
  "resolvePackageEntry",
  "resolvePluginConfigMutationRejections",
  "resolveStateDir",
  "resolveTerminalRunClientId",
  "resolveTerminalRunRejection",
  "resolveUserPath",
  "resolveWalletExportRejection",
  "resolveWalletRpcReadiness",
  "resolveWebSocketUpgradeRejection",
  "routeAutonomyTextToUser",
  "saveElizaConfig",
  "scanDropInPlugins",
  "sendJson",
  "sendJsonError",
  "setRestartHandler",
  "shouldIgnoreUnhandledRejection",
  "shutdownRuntime",
  "startApiServer",
  "startEliza",
  "streamResponseBodyWithByteLimit",
  "subscribeAuditFeed",
  "taskToTriggerSummary",
  "toWorkbenchTask",
  "triggersFeatureEnabled",
  "validateCloudBaseUrl",
  "validateMcpServerConfig",
] as const;

function generateElizaAgentStub(): string {
  const lines = [
    "const noop = () => undefined;",
    "const asyncNoop = async () => undefined;",
    "const emptyObject = Object.freeze({});",
    "const emptyArray = Object.freeze([]);",
    "export class AgentExportError extends Error {}",
    "export const CharacterSchema = emptyObject;",
    "export const DISABLED_TRIGGER_INTERVAL_MS = 0;",
    "export const TRIGGER_TASK_NAME = '';",
    "export const CUSTOM_PLUGINS_DIRNAME = 'plugins';",
    // Compat re-exports — published @elizaos/app-core imports these from
    // @elizaos/agent for the HTTP server's body-parsing helpers. Renderer
    // never executes the server code, so noop/zero stubs are fine.
    "export const DEFAULT_MAX_BODY_BYTES = 0;",
  ];
  for (const name of ELIZA_AGENT_OBJECT_STUB_NAMES) {
    lines.push(`export const ${name} = emptyObject;`);
  }
  for (const name of ELIZA_AGENT_ARRAY_STUB_NAMES) {
    lines.push(`export const ${name} = emptyArray;`);
  }
  for (const name of ELIZA_AGENT_FUNCTION_STUB_NAMES) {
    lines.push(`export const ${name} = noop;`);
  }
  lines.push("export default new Proxy(noop, { get: () => noop });");
  lines.push("void asyncNoop;");
  return `${lines.join("\n")}\n`;
}

// esbuild is a server-only build-time dep that drizzle-kit pulls in; the
// agent's plugin-compiler imports it as a namespace. Stub the surface
// the renderer's transitive imports might touch.
const ESBUILD_STUB_NAMES = [
  "build",
  "buildSync",
  "context",
  "transform",
  "transformSync",
  "formatMessages",
  "formatMessagesSync",
  "analyzeMetafile",
  "analyzeMetafileSync",
  "initialize",
  "stop",
  "version",
] as const;

function generateEsbuildStub(): string {
  return generateNamedExportStub(ESBUILD_STUB_NAMES);
}

function generateDrizzleOrmStub(): string {
  return [
    "const noop = () => {};",
    "const stubProxy = new Proxy(noop, { get: () => stubProxy, apply: () => stubProxy });",
    "export default stubProxy;",
    "export { stubProxy as boolean, stubProxy as integer, stubProxy as bigint, stubProxy as text, stubProxy as varchar, stubProxy as char, stubProxy as serial, stubProxy as bigserial, stubProxy as smallint, stubProxy as smallserial, stubProxy as decimal, stubProxy as numeric, stubProxy as real, stubProxy as doublePrecision, stubProxy as date, stubProxy as time, stubProxy as timestamp, stubProxy as interval, stubProxy as uuid, stubProxy as json, stubProxy as jsonb, stubProxy as pgTable, stubProxy as pgEnum, stubProxy as pgSchema, stubProxy as pgView, stubProxy as pgMaterializedView, stubProxy as pgSequence, stubProxy as foreignKey, stubProxy as primaryKey, stubProxy as uniqueIndex, stubProxy as unique, stubProxy as index, stubProxy as check, stubProxy as customType, stubProxy as relations, stubProxy as one, stubProxy as many, stubProxy as eq, stubProxy as ne, stubProxy as gt, stubProxy as gte, stubProxy as lt, stubProxy as lte, stubProxy as and, stubProxy as or, stubProxy as not, stubProxy as inArray, stubProxy as notInArray, stubProxy as isNull, stubProxy as isNotNull, stubProxy as like, stubProxy as ilike, stubProxy as notLike, stubProxy as between, stubProxy as exists, stubProxy as notExists, stubProxy as sql, stubProxy as desc, stubProxy as asc, stubProxy as count, stubProxy as sum, stubProxy as avg, stubProxy as min, stubProxy as max, stubProxy as drizzle, stubProxy as getTableConfig, stubProxy as getTableName, stubProxy as is, stubProxy as alias, stubProxy as except, stubProxy as union, stubProxy as unionAll, stubProxy as intersect, stubProxy as raw, stubProxy as placeholder, stubProxy as param, stubProxy as Column, stubProxy as Table, stubProxy as TableAliasProxy };",
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
  ["@elizaos/plugin-elizacloud", generatePluginElizacloudStub],
  ["@elizaos/plugin-local-inference", generatePluginLocalInferenceStub],
  ["esbuild", generateEsbuildStub],
  ["drizzle-orm", generateDrizzleOrmStub],
  // @node-rs/argon2's server-side Rust binding is referenced by
  // app-core's password-hashing helpers. Renderer never executes them
  // (auth happens in the API child); stub the named exports.
  [
    "@node-rs/argon2",
    () => generateNamedExportStub(["hash", "verify", "Algorithm"]),
  ],
  [
    "qrcode-terminal",
    () =>
      // plugin-whatsapp imports { generate } at module scope; provide the
      // named export so Rollup's static analysis succeeds. The renderer
      // never paints a terminal QR; this is a no-op shim.
      "export const generate = (_text, _opts, cb) => { if (cb) cb(''); };\n" +
      "export const setErrorLevel = () => {};\n" +
      "export default { generate, setErrorLevel };\n",
  ],
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
  const normalizedStrippedId = strippedId.replace(/\\/g, "/");
  if (strippedId === "@elizaos/agent/config/plugin-auto-enable") {
    return generateAgentPluginAutoEnableStub();
  }
  if (
    strippedId === "@elizaos/agent" ||
    normalizedStrippedId.startsWith("@elizaos/agent/") ||
    normalizedStrippedId.includes("/packages/agent/src/")
  ) {
    return generateElizaAgentStub();
  }

  const modName = strippedId.startsWith("@")
    ? strippedId.split("/").slice(0, 2).join("/")
    : strippedId.split("/")[0];
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
    // Terminal QR code printer — Node-only, ships legacy CJS with strict-mode
    // -illegal octal escapes (\033 ANSI codes). Rollup's parser rejects it.
    // The renderer never paints to a terminal; stub so the server-side OAuth
    // QR helper that imports it doesn't blow up the browser bundle.
    "qrcode-terminal",
    "@elizaos/skills",
    // The agent runtime is server-only — it lives in the API child
    // process, not in the renderer. app-core/dist code can leak agent
    // imports (account-pool etc.); stub them so Rollup doesn't try to
    // pull Node-only auth/credential code into the browser bundle.
    "@elizaos/agent",
    // Cloud helper module — server-only (handles cloud credentials,
    // tts proxy routes). Renderer references the exported names but
    // never executes the code; named-export stub registered above.
    "@elizaos/plugin-elizacloud",
    // @node-rs/argon2 has a wasm32-wasi variant that browser builds
    // surface via dynamic import. The browser can't resolve the bare
    // specifier at runtime; stub it so the bundle loads. Real hashing
    // happens server-side in the API child anyway.
    "@node-rs/argon2-wasm32-wasi",
    "@node-rs/argon2",
    "drizzle-orm",
    // esbuild is a build-time dep that drizzle-kit and friends pull in
    // transitively. Its `lib/main.js` does `process.versions.node.split(".")`
    // at module init, which throws in the renderer (process.versions.node
    // is undefined in browsers). Stub so the bundle never evaluates that.
    "esbuild",
    // OS keychain bridge — Node-only native addon (.node binary). Pulled
    // transitively by @elizaos/vault. Vite's commonjs--resolver chokes on
    // the platform-specific .node files; stub it for the renderer.
    "@napi-rs/keyring",
    // Password hashing native addon. Server-only (api/auth/passwords
    // route). Externalizing it leaves a bare `@node-rs/argon2` import in
    // the bundle output that the browser cannot resolve at runtime
    // (TypeError "Failed to resolve module specifier"); stub instead.
    "@node-rs/argon2",
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
  // @snazzah/davey (Discord voice native bridge) and its platform binaries.
  // The renderer never enters the voice-relay path; bare-specifier externals
  // would leak `import "@snazzah/davey"` into the browser output where it
  // can't resolve, so we stub the entire scope.
  const snazzahDaveyScopeRe = /^@snazzah\/davey(-.+)?$/;
  // Capacitor native plugins — mobile-only, must never run in the browser.
  // Stubbing prevents Rollup from failing when bun workspaces don't hoist them.
  const capacitorNativeScopeRe = /^@capacitor\/(?!core)(.+)$/;

  return {
    name: "native-module-stub",
    enforce: "pre",
    resolveId(id) {
      const normalizedId = id.replace(/\\/g, "/");
      if (normalizedId.includes("/packages/agent/src/")) {
        return VIRTUAL_PREFIX + id;
      }
      // Server-only `@elizaos/agent` is aliased via packageAgnosticAliases
      // to `elizaos-agent-browser-stub.ts`. The resolve.alias step runs
      // AFTER `commonjs--resolver` in some rollup paths, which causes
      // dist-side static-named-import scans to fail before the alias
      // fires. Intercept it here with enforce:"pre" so Rollup gets the
      // stub from the start.
      if (id === "@elizaos/agent") {
        return VIRTUAL_PREFIX + id;
      }
      // Plugin-elizacloud is server-only (cloud secrets, TTS routing).
      // The renderer reaches it transitively through `dist/api/onboarding-routes.js`
      // re-exports; stub the entire surface so static named-import scans pass.
      if (id === "@elizaos/plugin-elizacloud") {
        return appCoreSrcRoot
          ? path.join(
              appCoreSrcRoot,
              "platform/elizaos-plugin-elizacloud-browser-stub.ts",
            )
          : VIRTUAL_PREFIX + id;
      }
      // Some published/browser-side packages still deep-import this app-core
      // compatibility module even though the local app-core export map does
      // not list it. Intercept before commonjs--resolver validates exports.
      if (id === "@elizaos/app-core/ui-compat" && appCoreSrcRoot) {
        return path.join(appCoreSrcRoot, "ui-compat.ts");
      }
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
      // Scoped: @snazzah/davey + platform binaries (Discord voice native bridge)
      if (snazzahDaveyScopeRe.test(id)) return VIRTUAL_PREFIX + id;
      // Compiled Node native addons (.node binaries) — e.g. zlib-sync's
      // `build/Release/zlib_sync.node` pulled by @discordjs/ws. Browser
      // can never load these; stub so Rollup doesn't emit bare imports.
      if (/\.node(\?.*)?$/.test(id)) return VIRTUAL_PREFIX + id;
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
      if (bare.startsWith("@elizaos/plugin-")) return VIRTUAL_PREFIX + id;
      if (nativePackages.has(bare)) return VIRTUAL_PREFIX + id;
      return null;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null;

      const strippedId = id.slice(VIRTUAL_PREFIX.length);
      return generateNativeModuleStub(strippedId, capacitorNativeScopeRe);
    },
    // Patch @elizaos/core browser entry at transform time to add missing
    // exports and fix browser-incompatible patterns. Local-mode builds
    // hit `src/index.browser.ts` (TS source) directly — packages mode
    // hit the published dist `.js`. Cover both.
    transform(code, id) {
      const isCoreBrowserOrNodeFile =
        id.endsWith("index.browser.js") ||
        id.endsWith("index.node.js") ||
        id.endsWith("index.browser.ts") ||
        id.endsWith("index.node.ts");
      const normId = id.split(path.sep).join("/");
      const isCorePackagePath =
        normId.includes("/node_modules/@elizaos/core/") ||
        normId.includes("packages/core/dist/") ||
        normId.includes("packages/core/src/");
      if (!isCoreBrowserOrNodeFile || !isCorePackagePath) return null;

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
        // Additions for local-mode `index.browser.ts` — these live in
        // node-only modules (cloud-routing, runtime, etc.) so the
        // browser entry omits them. The renderer never invokes them,
        // but app-core's dist re-exports reach them statically.
        toRuntimeSettings: "function(){return{}}",
        AgentRuntime: "function(){}",
        AppRoutePluginLoader: "function(){}",
        AppRoutePluginRegistryEntry: "function(){}",
        ActionEventPayload: "function(){}",
        buildStoreVariantBlockedMessage: "function(){return ''}",
        BUILD_VARIANTS: "[]",
        ChannelType: "{}",
        classifySensitiveRequestSource: "function(){return 'unknown'}",
        createCharacter: "function(){return{}}",
        createMessageMemory: "function(){return{}}",
        createUniqueUuid: "function(){return ''}",
        DEFAULT_BUILD_VARIANT: "''",
        defaultSensitiveRequestPolicy: "{}",
        elizaLogger:
          "{info:function(){},warn:function(){},error:function(){},debug:function(){}}",
        EventPayload: "function(){}",
        EventType: "{}",
        GenerateTextParams: "function(){}",
        getBuildVariant: "function(){return ''}",
        getDirectDownloadUrl: "function(){return null}",
        IAgentRuntime: "function(){}",
        isDirectBuild: "function(){return false}",
        isLocalCodeExecutionAllowed: "function(){return false}",
        isStoreBuild: "function(){return false}",
        lifeOpsPassiveConnectorsEnabled: "function(){return false}",
        listAppRoutePluginLoaders: "function(){return []}",
        ModelType:
          "{TEXT_SMALL:'TEXT_SMALL',TEXT_LARGE:'TEXT_LARGE',TEXT_EMBEDDING:'TEXT_EMBEDDING'}",
        ModelTypeName: "function(){}",
        PluginManagerService: "function(){}",
        redactSensitiveRequestMetadata: "function(x){return x}",
        registerAppCoreRuntimeHooks: "function(){}",
        getElizaNamespace: "function(){return 'eliza'}",
        expandConnectorSourceFilter: "function(){return []}",
        getConnectorSourceAliases: "function(){return []}",
        isConnectorConfigured: "function(){return false}",
        isStreamingDestinationConfigured: "function(){return false}",
        isWechatConfigured: "function(){return false}",
        logger:
          "{info:function(){},warn:function(){},error:function(){},debug:function(){}}",
        normalizeConnectorSource: "function(x){return x}",
        registerAppRoutePluginLoader: "function(){}",
        registerConnectorSourceAliases: "function(){}",
        readWorkspaceFolderConfig: "function(){return null}",
        resolveStateDir: "function(){return ''}",
        resolveUserPath: "function(x){return x}",
      };
      // Check which are actually missing from the existing export block
      const needed = Object.keys(missingExports).filter((n) => {
        // Check if already exported (direct declaration, named export, or
        // re-export alias) before appending a browser stub.
        const directExport = new RegExp(
          `\\bexport\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${n}\\b`,
        );
        if (directExport.test(patched)) return false;
        const exportedAs = new RegExp(`\\b${n}\\b`);
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
    // Build variant baked into the renderer so @elizaos/ui/build-variant's
    // isStoreBuild()/getBuildVariant() resolve at runtime (they read ONLY this
    // define — no env fallback). Without it the iOS build is always detected as
    // "direct": store CSP is skipped and isNativeIosStoreBuild() is false, so
    // the embedded on-device agent is never used. Mirrors eliza
    // packages/app/vite.config.ts.
    __ELIZA_BUILD_VARIANT__: JSON.stringify(
      process.env.ELIZA_BUILD_VARIANT === "store" ? "store" : "direct",
    ),
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
    localSourceAliasFallbackPlugin(),
    nativeModuleStubPlugin(),
    asyncLocalStoragePatchPlugin(),
    watchWorkspacePackagesPlugin(),
    workspaceJsxInJsPlugin(),
    tailwindcss(),
    react(),
    desktopCorsPlugin(),
    appDevSettingsBannerPlugin(),
  ],
  resolve: {
    // Force vite to pick the "node" condition over "browser" for package
    // exports. Many upstream eliza plugins ship hand-curated browser
    // entries that are missing symbols server-side modules statically
    // import. The Node entries are complete; nativeModuleStubPlugin +
    // rollup externals neutralize Node-only APIs at module boundaries,
    // and tree-shaking drops unused code.
    conditions: ["node", "import", "module", "default"],
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
      // Local app-package aliases must run before optional stubs so local mode
      // actually exercises eliza/plugins/app-* packages.
      ...LOCAL_ELIZA_APP_ALIAS_ENTRIES,
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
      // Capacitor plugins — resolve to local plugin sources when present.
      ...NATIVE_PLUGIN_ALIAS_ENTRIES,
      {
        find: ELIZA_CAPACITOR_PLUGIN_STUB_PATTERN,
        replacement: nativePluginStubEntry,
      },
      // Local source aliases are only installed when the eliza checkout exists.
      // Published-only builds should resolve normal @elizaos package exports.
      ...resolveLocalUiAliases(),
      ...resolveLocalVaultAliases(),
      ...resolveLocalSharedCompatAliases(),
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
    exclude: [
      "node-llama-cpp",
      "@node-llama-cpp/mac-arm64-metal",
      // Contains native-only pty-state-capture / pty-console imports; skip pre-bundling.
      "@elizaos/plugin-agent-orchestrator",
      "pty-console",
      // @elizaos/agent is server-side and the published alpha lags develop
      // (missing newer subpaths like runtime/plugin-collector). esbuild
      // dep-prebundling resolves it from the stale published package and
      // crashes ("Missing ./runtime/plugin-collector specifier"); excluding it
      // lets resolve.alias map @elizaos/agent[/*] to local source instead.
      "@elizaos/agent",
      // Built-in secrets live in @elizaos/core features; Vite must not externalize them as a separate package.
      // Node-only HTTP client — crashes in browser, stub via nativeModuleStubPlugin
      "undici",
      // Browser automation is server-only and pulls in proxy-agent/httpUtil.
      "puppeteer-core",
      "@puppeteer/browsers",
      // Telegram account auth is server-only and pulls in GramJS + socks.
      "telegram",
      "socks",
      // OS keychain binding is desktop/server-only and pulls native .node assets.
      "@napi-rs/keyring",
      // Discord voice/gateway natives leak in via @discordjs/ws: @snazzah/davey
      // re-exports @snazzah/davey-wasm32-wasi and zlib-sync is a compiled .node
      // addon — neither resolves in the browser. nativeModuleStubPlugin covers
      // the rollup build + dev-server module serving, but esbuild's optimizeDeps
      // pre-bundle uses its own resolver; exclude them so the dev server's
      // pre-bundle scan doesn't crash (white screen) trying to resolve them.
      "@snazzah/davey",
      "zlib-sync",
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
    // first-paint network cost for the user. The remaining ~5.6MB main
    // chunk is the merged workspace surface (app-core + companion +
    // steward + task-coordinator + vincent + screenshare); splitting
    // them via manual chunks reintroduces circular-chunk + empty-chunk
    // warnings without measurable benefit. This is a deliberate warning
    // baseline, not a bundle-size fix. If a true cold-start budget matters
    // later, lift owner-of-route lazy() boundaries at the call
    // sites that own a single import path (route-level splits land in
    // their own chunks naturally — see AppsPageView / AutomationsView /
    // SettingsView / StreamView / etc. above).
    chunkSizeWarningLimit: 6000,
    minify: desktopFastDist ? false : undefined,
    cssMinify: desktopFastDist ? false : undefined,
    reportCompressedSize: !desktopFastDist,
    rolldownOptions: {
      onLog(level, log, defaultHandler) {
        if (level === "warn" && isKnownToleratedBuildWarning(log)) {
          return;
        }
        defaultHandler(level, log);
      },
      onwarn(warning, warn) {
        if (isKnownToleratedBuildWarning(warning)) {
          return;
        }
        warn(warning);
      },
    },
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
        if (/^@node-llama-cpp\//.test(id)) return true;
        // @solana/web3.js is an optional dynamic import in plugin-x402's
        // server-side Solana payment path. Not a declared dep; the renderer
        // never enters that branch. Externalize to skip the resolver.
        if (/^@solana\/web3\.js$/.test(id)) return true;
        // @opentelemetry/api is a server/Node-only distributed-tracing package
        // that the `ai` package (v6+) imports as an optional peer dep. The
        // renderer never enters those tracing code paths. Externalize so Rollup
        // doesn't fail trying to resolve a Node-only package in the browser
        // build context.
        if (/^@opentelemetry\/api(\/|$)/.test(id)) return true;
        // Note: server-only native binaries (@napi-rs/keyring, @node-rs/argon2,
        // @snazzah/davey, .node) are NOT externalized here — externalizing
        // leaves bare-specifier `import "@snazzah/davey"` in the renderer
        // output, which the browser cannot resolve. nativeModuleStubPlugin
        // intercepts these at the resolveId stage and returns a virtual
        // stub module so the bare specifier never escapes into the output.
        return false;
      },
      input: {
        main: path.resolve(here, "index.html"),
      },
      output: {
        manualChunks: resolveManualChunk,
      },
      // Suppress known-benign build noise so the log stays signal-rich.
      // Anything not matched here still surfaces via the default handler.
      onwarn(warning, defaultHandler) {
        const message = warning.message ?? "";
        const where = warning.id ?? warning.loc?.file ?? message;
        // @electric-sql/pglite ships Emscripten/WASM glue that uses eval().
        if (warning.code === "EVAL" && /pglite/i.test(where)) return;
        if (isKnownToleratedBuildWarning(warning)) return;
        // Modules imported both dynamically and statically: the dynamic imports
        // are intentional (the @elizaos/ui DynamicViewLoader string-keyed module
        // registry and plugin-browser lazy-loading), and the modules stay
        // statically reachable in the main chunk. Informational — not a defect;
        // converting either side would break the registry/lazy load.
        if (
          warning.plugin === "vite:reporter" &&
          /dynamically imported by[\s\S]*but also statically imported by/.test(
            message,
          )
        )
          return;
        defaultHandler(warning);
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
        xfwd: true,
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
      ignored: [
        "**/electrobun/build/**",
        "**/electrobun/artifacts/**",
        // Training data dirs and native C++ source trees cause EINVAL errors
        // during watch (deep paths, large binary datasets, .cpp directory names).
        "**/packages/training/data/raw/**",
        "**/plugin-local-inference/native/omnivoice.cpp/**",
        "**/plugin-local-inference/src/services/__tests__/**",
      ],
    },
  },
});
