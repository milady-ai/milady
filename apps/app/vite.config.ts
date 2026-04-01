import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import {
  resolveDesktopApiPort,
  resolveDesktopUiPort,
} from "../../packages/shared/src/runtime-env.ts";

const _require = createRequire(import.meta.url);

// Keep workspace-relative TS imports in this config so Vite transpiles them
// while bundling the config instead of asking Node to load package-exported
// .ts files directly in CI.
const here = path.dirname(fileURLToPath(import.meta.url));
const miladyRoot = path.resolve(here, "../..");

// The dev script sets MILADY_API_PORT; default to 31337 for standalone vite dev.
const apiPort = resolveDesktopApiPort(process.env);
const uiPort = resolveDesktopUiPort(process.env);
const enableAppSourceMaps = process.env.MILADY_APP_SOURCEMAP === "1";
/** Set by scripts/dev-platform.mjs for `vite build --watch` (Electrobun desktop). */
const desktopFastDist = process.env.MILADY_DESKTOP_VITE_FAST_DIST === "1";

function pathIncludesAny(id: string, markers: string[]): boolean {
  return markers.some((marker) => id.includes(marker));
}

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

    if (normalizedId.includes("/@sparkjsdev/spark/")) {
      return "vendor-spark";
    }

    if (normalizedId.includes("/three/examples/")) {
      return "vendor-three-extras";
    }

    if (pathIncludesAny(normalizedId, ["/three/build/", "/three/src/"])) {
      return "vendor-three";
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
function desktopCorsPlugin(): Plugin {
  return {
    name: "desktop-cors",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const origin = req.headers.origin;
        if (!origin || !req.url?.startsWith("/api")) return next();

        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, X-Milady-Token, X-Api-Key, X-Milady-Export-Token, X-Milady-Client-Id, X-Milady-Terminal-Token, X-Milady-UI-Language",
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
    "electron",
    "undici",
    "@elizaos/plugin-local-embedding",
  ]);
  const nativeScopeRe = /^@node-llama-cpp\//;

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
      // Exact or sub-path match against native packages
      if (nativePackages.has(bare)) return VIRTUAL_PREFIX + id;
      return null;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null;

      const modName = id.slice(VIRTUAL_PREFIX.length).split("/")[0];
      // node-llama-cpp is the most import-heavy native module — its consumers
      // use many named exports (LlamaLogLevel, getLlama, etc.).  Return a
      // module whose default export is a Proxy that returns no-op stubs for
      // any property access, AND re-export that proxy as every known name so
      // static `import { X }` statements resolve without error.
      if (modName === "node-llama-cpp") {
        return [
          "const handler = { get: (_, p) => (p === Symbol.toPrimitive ? () => 0 : typeof p === 'string' ? (() => {}) : undefined) };",
          "const stub = new Proxy({}, handler);",
          "export default stub;",
          // Known named exports used by @elizaos/plugin-local-embedding and
          // other consumers — extend as needed:
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

      // fs-extra: CJS module with default + named exports
      if (modName === "fs-extra") {
        return [
          "const noop = () => {};",
          "const stub = new Proxy({}, { get: () => noop });",
          "export default stub;",
          // Re-export common fs-extra named exports so static imports work:
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

      // events: CJS module, consumers use `import { EventEmitter } from "events"`
      if (modName === "events") {
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

      // undici: Node HTTP client — re-export browser globals (fetch, WebSocket, etc.)
      if (modName === "undici") {
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

      // node:* builtins — return a Proxy-based module that provides any
      // named export as a no-op function.  This handles @elizaos/core's node
      // entry which uses createRequire, randomUUID, fs, etc. at the top level.
      if (modName.startsWith("node:")) {
        // Dynamic: read the real Node module's export names at config time
        // and generate matching no-op stubs so esbuild's static analysis passes.
        return generateNodeBuiltinStub(id.slice(VIRTUAL_PREFIX.length));
      }

      // Generic fallback for other native modules
      return "export default {};\n";
    },
    // Patch @elizaos/core browser entry at transform time to add missing
    // exports that milady's agent plugins expect.
    transform(code, id) {
      if (
        !id.endsWith("index.browser.js") ||
        (!id.includes("@elizaos/core") &&
          !id.includes("packages/typescript/dist/browser"))
      )
        return null;
      // Names that downstream plugins (plugin-secrets-manager, agent runtime)
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
        const exportBlocks = code.match(/export\s*\{[^}]+\}/g) || [];
        return !exportBlocks.some((b) => exportedAs.test(b));
      });
      if (needed.length === 0) return null;
      // Use unique prefixed names to avoid collisions with minified vars
      const prefix = "__milady_stub_";
      const stubs = needed
        .map((n) => `var ${prefix}${n} = ${missingExports[n]};`)
        .join("\n");
      const exports = `export { ${needed.map((n) => `${prefix}${n} as ${n}`).join(", ")} };`;
      return { code: `${code}\n${stubs}\n${exports}`, map: null };
    },
  };
}

/**
 * Absolute path to the workspace-root three package directory.
 * Electrobun ships a nested three\@0.165 under its own node_modules; without
 * pinning resolution, some deps may pick up that copy, creating a second
 * THREE.ShaderChunk that never receives Spark's splatDefines registration.
 */
const threeRootDir = path.resolve(miladyRoot, "node_modules/three");

/**
 * Spark + VRM need exactly one physical `three` package in the bundle.
 * WHY resolveId (not only resolve.alias): a broad alias to an absolute
 * `node_modules/three` path broke Rollup’s production path handling; a
 * pre-hook re-resolve from non-root importers keeps dev + `vite build` stable.
 */
function sparkPatchPlugin(): Plugin {
  return {
    name: "spark-patch",
    enforce: "pre",
    resolveId: {
      order: "pre",
      async handler(source, importer, opts) {
        if (opts.custom?.["spark-patch:skip"]) return null;
        if (source !== "three" || !importer) return null;
        // Only intercept imports from files outside the root three package
        // (prevents infinite recursion and lets three's internal imports work).
        if (importer.startsWith(threeRootDir)) return null;
        const skipOpts = {
          ...opts,
          custom: { ...opts.custom, "spark-patch:skip": true },
        };
        const resolved = await this.resolve(source, importer, skipOpts);
        if (!resolved) return null;
        // If the resolved path is NOT under the root three dir (e.g. it
        // resolved to electrobun's nested copy), redirect to the root copy.
        if (!resolved.id.startsWith(threeRootDir)) {
          return (
            (await this.resolve(
              source,
              path.join(threeRootDir, "package.json"),
              skipOpts,
            )) ?? resolved
          );
        }
        return null;
      },
    },
    transform(code, id) {
      if (!id.includes("@sparkjsdev/spark/dist/spark.module.js")) return null;
      let patched = code;

      // Inline data: WASM URLs that Vite can't handle.
      patched = patched.replace(
        /new URL\(("(?:data:application\/wasm;base64,[^"]+)"),\s*import\.meta\.url\)/g,
        "$1",
      );

      // Spark lazily registers THREE.ShaderChunk.splatDefines inside
      // getShaders(), which only runs in the SparkRenderer constructor.
      // Compute shaders (Readback / PackedSplats) may be compiled earlier
      // via SplatMesh init and reference #include <splatDefines>, causing
      // "Can not resolve #include <splatDefines>" in Three.js.
      // Patch: hoist the ShaderChunk registration to module load time.
      patched = patched.replace(
        /function getShaders\(\)\s*\{\s*if\s*\(!shaders\)\s*\{/,
        "THREE.ShaderChunk.splatDefines = splatDefines_default;\nfunction getShaders() {\n  if (!shaders) {",
      );

      if (patched === code) return null;
      return { code: patched, map: null };
    },
  };
}

function watchWorkspacePackagesPlugin(): Plugin {
  return {
    name: "watch-workspace-packages",
    configureServer(server) {
      server.watcher.add(path.resolve(miladyRoot, "packages"));
      server.watcher.on("change", (file) => {
        if (file.includes("/packages/")) {
          if (file.endsWith("package.json")) {
            server.restart();
          } else {
            // Force a full reload on any other package file change (e.g. ts/tsx files)
            server.ws.send({ type: "full-reload" });
          }
        }
      });
    },
  };
}

export default defineConfig({
  root: here,
  base: "./",
  // Keep pre-bundle cache under the app dir (not node_modules/.vite) so Bun
  // installs don't fight Vite, and `bun run clean` / docs can target one path.
  cacheDir: path.resolve(here, ".vite"),
  publicDir: path.resolve(here, "public"),
  define: {
    global: "globalThis",
    // Mirror MILADY_TTS_DEBUG into the client bundle so one env enables UI + server TTS logs in dev.
    "import.meta.env.MILADY_TTS_DEBUG": JSON.stringify(
      process.env.MILADY_TTS_DEBUG ?? "",
    ),
    // Settings load/save trace (MiladyClient + shared isMiladySettingsDebugEnabled).
    "import.meta.env.MILADY_SETTINGS_DEBUG": JSON.stringify(
      process.env.MILADY_SETTINGS_DEBUG ?? "",
    ),
    "import.meta.env.VITE_MILADY_SETTINGS_DEBUG": JSON.stringify(
      process.env.VITE_MILADY_SETTINGS_DEBUG ?? "",
    ),
    "import.meta.env.VITE_ASSET_BASE_URL": JSON.stringify(
      process.env.VITE_ASSET_BASE_URL ??
        process.env.MILADY_ASSET_BASE_URL ??
        "",
    ),
  },
  plugins: [
    nativeModuleStubPlugin(),
    sparkPatchPlugin(),
    watchWorkspacePackagesPlugin(),
    tailwindcss(),
    react(),
    desktopCorsPlugin(),
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
      "@sparkjsdev/spark",
      "@miladyai/app-core",
    ],
    alias: [
      // Bare Node built-in polyfills for browser — pathe provides ESM path,
      // events is pre-bundled via optimizeDeps.
      { find: /^path$/, replacement: "pathe" },
      // Node built-in subpaths that browser polyfills don't provide.
      // Server-only code imports these but they're never executed in-browser.
      ...["util/types", "stream/promises", "stream/web"].flatMap((sub) => [
        {
          find: `node:${sub}`,
          replacement: path.resolve(here, "src/stubs/empty-node-module.ts"),
        },
        {
          find: sub,
          replacement: path.resolve(here, "src/stubs/empty-node-module.ts"),
        },
      ]),
      // Capacitor plugins — resolve to local plugin sources
      {
        find: /^@miladyai\/capacitor-agent$/,
        replacement: path.resolve(here, "plugins/agent/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-camera$/,
        replacement: path.resolve(here, "plugins/camera/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-canvas$/,
        replacement: path.resolve(here, "plugins/canvas/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-desktop$/,
        replacement: path.resolve(here, "plugins/desktop/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-gateway$/,
        replacement: path.resolve(here, "plugins/gateway/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-location$/,
        replacement: path.resolve(here, "plugins/location/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-screencapture$/,
        replacement: path.resolve(here, "plugins/screencapture/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-swabble$/,
        replacement: path.resolve(here, "plugins/swabble/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-talkmode$/,
        replacement: path.resolve(here, "plugins/talkmode/src/index.ts"),
      },
      // Force local @miladyai/app-core when workspace-linked (prevents stale
      // bun cache copies from overriding the symlinked local source).
      ...(() => {
        const appCorePkgPath = path.resolve(
          miladyRoot,
          "packages/app-core/package.json",
        );
        const appCorePkgDir = path.dirname(appCorePkgPath);
        const appCorePkg = JSON.parse(fs.readFileSync(appCorePkgPath, "utf8"));

        const generatedAliases = [];

        for (const [key, value] of Object.entries(appCorePkg.exports || {})) {
          if (typeof value === "string") {
            const aliasKey =
              key === "."
                ? "@miladyai/app-core"
                : `@miladyai/app-core/${key.replace(/^\.\//, "")}`;
            // If the package exports something ending with .js instead of .ts, we check for .ts locally
            // But the exports in app-core point directly to .ts, .tsx, .css, so we can just resolve it
            const targetPath = path.resolve(appCorePkgDir, value);

            generatedAliases.push({
              find: new RegExp(`^${aliasKey}$`),
              replacement: targetPath,
            });
            // Also map .js extension for users importing it as .js
            if (!aliasKey.endsWith(".js") && !aliasKey.endsWith(".css")) {
              generatedAliases.push({
                find: new RegExp(`^${aliasKey}\\.js$`),
                replacement: targetPath,
              });
            }
          }
        }

        const uiSource = path.resolve(miladyRoot, "packages/ui/src");
        const _autonomousSource = path.resolve(
          miladyRoot,
          "node_modules/@miladyai/agent/packages/agent/src",
        );

        return [
          ...generatedAliases,
          {
            find: /^@miladyai\/ui$/,
            replacement: path.join(uiSource, "index.ts"),
          },
          {
            find: /^@miladyai\/ui\/(.*)$/,
            replacement: `${uiSource}/$1/index.ts`, // assumes subpaths are directories
          },
          // NOTE: @elizaos/agent barrel re-exports server-only code (eliza.ts,
          // server.ts) that imports native modules (node-llama-cpp, node:module).
          // Nothing in the browser needs the barrel — only subpath imports like
          // @miladyai/agent/contracts/onboarding are used.  Map the bare import
          // to an empty module so Vite never traverses the server-side tree.
          {
            find: /^@elizaos\/agent$/,
            replacement: path.resolve(here, "src/stubs/empty-node-module.ts"),
          },
          // @elizaos/plugin-knowledge browser build is broken — force node entry.
          {
            find: /^@elizaos\/plugin-knowledge$/,
            replacement: `${path.dirname(
              _require.resolve("@elizaos/plugin-knowledge/package.json"),
            )}/dist/node/index.node.js`,
          },
          // @elizaos/core — force ALL copies (including nested ones in plugins
          // like plugin-secrets-manager that ship their own older core) to the
          // main workspace copy's browser entry.  The browser entry has all
          // needed exports and avoids pulling in createRequire/node:fs/etc.
          {
            find: /^@elizaos\/core$/,
            replacement: `${path.dirname(
              _require.resolve("@elizaos/core/package.json"),
            )}/dist/browser/index.browser.js`,
          },
        ];
      })(),
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      // Three.js core + all subpath imports must be pre-bundled together so
      // esbuild shares a single module identity. Without this, Spark (excluded
      // from pre-bundling) and the pre-bundled examples/jsm/* addons end up
      // with different THREE.ShaderChunk objects, causing "Can not resolve
      // #include <splatDefines>" at render time.
      "three",
      "three/examples/jsm/controls/OrbitControls.js",
      "three/examples/jsm/libs/meshopt_decoder.module.js",
      "three/examples/jsm/loaders/DRACOLoader.js",
      "three/examples/jsm/loaders/GLTFLoader.js",
      "three/examples/jsm/loaders/FBXLoader.js",
      "three/examples/jsm/webxr/VRButton.js",
      // CJS polyfills that browser deps import as ESM named exports —
      // pre-bundling converts them so Vite can serve named imports.
      "events",
      "util",
      "buffer",
      "stream-browserify",
    ],
    // Remap node: builtins to npm polyfills during dep optimization so
    // esbuild doesn't externalize them as "browser-external:node:*".
    esbuildOptions: {
      plugins: [
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
      "@sparkjsdev/spark",
      "node-llama-cpp",
      "@node-llama-cpp/mac-arm64-metal",
      // Contains native-only pty-state-capture import; skip pre-bundling.
      "@elizaos/plugin-agent-orchestrator",
      // Ships its own @elizaos/core copy that references exports missing from
      // the browser entry; skip pre-bundling so it's served on-demand via the
      // transform plugin that patches missing exports.
      "@elizaos/plugin-secrets-manager",
      // Node-only HTTP client — crashes in browser, stub via nativeModuleStubPlugin
      "undici",
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
    // Keep warnings focused on regressions after splitting the heavy 3D vendor surface.
    chunkSizeWarningLimit: 2300,
    minify: desktopFastDist ? false : undefined,
    cssMinify: desktopFastDist ? false : undefined,
    reportCompressedSize: !desktopFastDist,
    rollupOptions: {
      // Native-only deps and Node built-ins that must not be resolved during
      // the browser build. The agent package barrel-exports server-only modules
      // that import Node APIs; these are tree-shaken at runtime but Rollup
      // still needs to resolve them.
      external: (id) => {
        if (
          [
            "pty-state-capture",
            "electron",
            "node-llama-cpp",
            "pty-manager",
          ].includes(id)
        )
          return true;
        if (/^@node-llama-cpp\//.test(id)) return true;
        if (/^node:/.test(id)) return true;
        // Bare Node built-in names and sub-paths (fs, fs/promises, path, etc.)
        const nodeBuiltins = [
          "fs",
          "path",
          "os",
          "net",
          "dns",
          "util",
          "crypto",
          "http",
          "https",
          "http2",
          "stream",
          "zlib",
          "child_process",
          "events",
          "buffer",
          "url",
          "module",
          "tls",
          "dgram",
          "readline",
          "tty",
          "assert",
          "constants",
          "punycode",
          "querystring",
          "string_decoder",
          "timers",
          "vm",
          "worker_threads",
          "perf_hooks",
          "async_hooks",
          "inspector",
          "cluster",
          "v8",
          "process",
          "console",
        ];
        const base = id.split("/")[0];
        if (nodeBuiltins.includes(base)) return true;
        return false;
      },
      input: {
        main: path.resolve(here, "index.html"),
        screenshotter: path.resolve(here, "public_src/screenshotter.html"),
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
    // WKWebView (Electrobun) can build broken HMR / source-map URLs when the
    // client advertises 0.0.0.0; pin the HMR endpoint to loopback.
    hmr: {
      host: "127.0.0.1",
      port: uiPort,
    },
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
      },
    },
    fs: {
      // Allow serving files from the app directory and milady src
      allow: [here, miladyRoot],
    },
    watch: {
      // Polling is only needed in Docker/WSL where native fs events are unreliable
      usePolling: process.env.MILADY_DEV_POLLING === "1",
      // Electrobun postBuild copies renderer HTML/assets into electrobun/build/.
      // Watching those paths triggers full reloads while deps are still optimizing,
      // which breaks with "chunk-*.js does not exist" in node_modules/.vite/deps.
      ignored: ["**/electrobun/build/**", "**/electrobun/artifacts/**"],
    },
  },
});
