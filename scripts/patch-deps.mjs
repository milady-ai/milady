#!/usr/bin/env node
/**
 * Post-install patches for remaining third-party/runtime packaging issues.
 *
 * First-party @elizaos and @miladyai source fixes should land in their own
 * packages and releases instead of being maintained here.
 *
 * Current responsibilities:
 * 1) Bun/runtime packaging compatibility (broken export maps, stale cache
 *    repairs, nested package skew, platform shims).
 * 2) Dependency compatibility fixes (@noble/*, cssstyle, @ai-sdk/groq,
 *    proper-lockfile, pty-manager).
 * 3) Startup noise / native loader suppression (bigint-buffer, sharp, jsdom).
 */
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  patchAutonomousMiladyOnboardingPresets,
  patchBrokenElizaCoreRuntimeDists,
  patchCodexFolderApprovalPromptCompat,
  patchElectrobunWindowsTar,
  patchExtensionlessJsExports,
  patchNobleHashesCompat,
  patchProperLockfileSignalExitCompat,
  patchPtyManagerCursorPositionCompat,
  patchPtyManagerEsmDirnameCompat,
  pruneNestedElizaPluginCoreCopies,
  warnStaleBunCache,
} from "./lib/patch-bun-exports.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Bust stale Bun cache entries for @elizaos packages.
// See warnStaleBunCache() in lib/patch-bun-exports.mjs for details.
// ---------------------------------------------------------------------------
warnStaleBunCache(root);

// @noble/curves and @noble/hashes publish ".js" subpath exports, while ethers
// imports extensionless paths like "@noble/curves/secp256k1" and
// "@noble/hashes/sha3". Add extensionless aliases so Bun resolves them.
patchExtensionlessJsExports(root, "@noble/curves");

// @noble/hashes only exports subpaths with explicit ".js" suffixes (for
// example "./sha3.js"), but ethers imports "@noble/hashes/sha3". Add
// extensionless aliases so Bun resolves the published package at runtime.
patchExtensionlessJsExports(root, "@noble/hashes");
patchNobleHashesCompat(root);
patchProperLockfileSignalExitCompat(root);
patchPtyManagerEsmDirnameCompat(root);
patchPtyManagerCursorPositionCompat(root);
patchCodexFolderApprovalPromptCompat(root);
patchBrokenElizaCoreRuntimeDists(root);
pruneNestedElizaPluginCoreCopies(root);
try {
  patchAutonomousMiladyOnboardingPresets(root);
} catch {
  // Source file may not exist (moved to @miladyai/shared).
}
patchElectrobunWindowsTar(root);

function uniqueResolvedPaths(paths) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
}
function collectInstalledPackageDirs(
  packageName,
  { includeGlobalBunCache = false } = {},
) {
  const searchDirs = [resolve(root, `node_modules/${packageName}`)];

  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    const bunEntryPrefix = `${packageName.replace("/", "+")}@`;
    try {
      for (const entry of readdirSync(bunCacheDir)) {
        if (entry.startsWith(bunEntryPrefix)) {
          searchDirs.push(
            resolve(bunCacheDir, entry, "node_modules", packageName),
          );
        }
      }
    } catch {}
  }

  if (includeGlobalBunCache && process.env.HOME) {
    const globalBunCacheDir = resolve(
      process.env.HOME,
      ".bun",
      "install",
      "cache",
    );
    if (existsSync(globalBunCacheDir)) {
      const [scope, unscopedName] = packageName.split("/");
      if (packageName.startsWith("@") && unscopedName) {
        const scopedCacheDir = resolve(globalBunCacheDir, scope);
        if (existsSync(scopedCacheDir)) {
          const globalEntryPrefix = `${unscopedName}@`;
          try {
            for (const entry of readdirSync(scopedCacheDir)) {
              if (entry.startsWith(globalEntryPrefix)) {
                searchDirs.push(resolve(scopedCacheDir, entry));
              }
            }
          } catch {}
        }
      } else {
        const globalEntryPrefix = `${packageName}@`;
        try {
          for (const entry of readdirSync(globalBunCacheDir)) {
            if (entry.startsWith(globalEntryPrefix)) {
              searchDirs.push(resolve(globalBunCacheDir, entry));
            }
          }
        } catch {}
      }
    }
  }

  return uniqueResolvedPaths(searchDirs);
}

// ---------------------------------------------------------------------------
// @elizaos/plugin-openrouter — this repo uses workspace:* during local
// development, but the last known-good published tarball remains 2.0.0-alpha.10.
//
// WHY: npm @elizaos/plugin-openrouter@2.0.0-alpha.12 shipped truncated
// dist/node/index.node.js and dist/browser/index.browser.js: only the config
// helper chunk is present, but the module still exports openrouterPlugin /
// default aliases for symbols that are never defined. Bun then fails loading
// the plugin ("not declared in this file"). alpha.10 publishes a full bundle.
// We do not patch the broken tarball here because the implementation chunk is
// missing entirely (unlike plugin-pdf's wrong export identifier).
//
// Before bumping: verify the new tarball's dist entry defines the plugin, or
// run: bun build node_modules/@elizaos/plugin-openrouter/dist/node/index.node.js --target=bun
// Docs: docs/plugin-resolution-and-node-path.md (Pinned: @elizaos/plugin-openrouter)
// ---------------------------------------------------------------------------

/**
 * Patch bigint-buffer optional native binding warning noise.
 *
 * Workspace override plugins can resolve transitive packages directly from the
 * user's Bun install cache instead of the repo's node_modules tree. When
 * bigint-buffer cannot build its optional native addon, it logs a warning even
 * though the pure JS fallback is fully functional. Keep the fallback and hide
 * the warning unless explicitly debugging native bindings.
 */
function patchBigintBufferNativeFallbackNoise() {
  const relPaths = ["dist/node.js"];
  const searchDirs = [resolve(root, "node_modules/bigint-buffer")];
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      for (const entry of readdirSync(bunCacheDir)) {
        if (entry.startsWith("bigint-buffer@")) {
          searchDirs.push(
            resolve(bunCacheDir, entry, "node_modules/bigint-buffer"),
          );
        }
      }
    } catch {}
  }

  const globalBunCacheDir =
    process.env.HOME &&
    existsSync(resolve(process.env.HOME, ".bun", "install", "cache"))
      ? resolve(process.env.HOME, ".bun", "install", "cache")
      : null;
  if (globalBunCacheDir) {
    try {
      for (const entry of readdirSync(globalBunCacheDir)) {
        if (entry.startsWith("bigint-buffer@")) {
          searchDirs.push(resolve(globalBunCacheDir, entry));
        }
      }
    } catch {}
  }

  const oldSnippet =
    "console.warn('bigint: Failed to load bindings, pure JS will be used (try npm run rebuild?)');";
  const newSnippet =
    "if (process.env.MILADY_DEBUG_BIGINT_BINDINGS === \"1\") {\n        console.warn('bigint: Failed to load bindings, pure JS will be used (try npm run rebuild?)');\n    }";

  let patched = 0;
  for (const dir of uniqueResolvedPaths(searchDirs)) {
    for (const relPath of relPaths) {
      const target = resolve(dir, relPath);
      if (!existsSync(target)) continue;
      let src = readFileSync(target, "utf8");
      if (!src.includes(oldSnippet)) continue;
      src = src.replace(oldSnippet, newSnippet);
      writeFileSync(target, src, "utf8");
      patched++;
      console.log(
        `[patch-deps] Applied bigint-buffer native fallback log patch: ${target}`,
      );
    }
  }

  if (patched > 0) {
    console.log(
      `[patch-deps] bigint-buffer: patched ${patched} native fallback warning path(s).`,
    );
  }
}
patchBigintBufferNativeFallbackNoise();

/**
 * Force Baileys to reuse the repo root sharp package.
 *
 * Bun's virtual store can leave nested sharp copies under Baileys cache entries.
 * If both a nested sharp and the repo root sharp load in the same process, macOS
 * ends up with duplicate libvips dylibs and Objective-C class warnings. Replace
 * Baileys' nested sharp copies with a symlink to the canonical root package so
 * the process only loads one sharp/libvips pair.
 */
function patchBaileysNestedSharpCopies() {
  const bunCacheDir = resolve(root, "node_modules/.bun");
  const rootSharp = resolve(root, "node_modules/sharp");
  if (!existsSync(bunCacheDir) || !existsSync(rootSharp)) {
    return;
  }

  const rootSharpRealPath = realpathSync(rootSharp);
  const linkType = process.platform === "win32" ? "junction" : "dir";
  let patched = 0;

  try {
    for (const entry of readdirSync(bunCacheDir)) {
      if (!entry.startsWith("@whiskeysockets+baileys@")) continue;
      const nestedSharp = resolve(bunCacheDir, entry, "node_modules/sharp");
      rmSync(nestedSharp, { recursive: true, force: true });
      symlinkSync(rootSharpRealPath, nestedSharp, linkType);
      patched++;
      console.log(
        `[patch-deps] Linked Baileys nested sharp to root sharp: ${nestedSharp} -> ${rootSharpRealPath}`,
      );
    }
  } catch (error) {
    console.warn(
      `[patch-deps] Failed to normalize Baileys sharp dependency: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (patched > 0) {
    console.log(
      `[patch-deps] Baileys: normalized ${patched} nested sharp path(s) to the root sharp package.`,
    );
  }
}
patchBaileysNestedSharpCopies();

/**
 * Normalize stale Bun sharp store aliases to the canonical root sharp version.
 *
 * Bun can retain older sharp store entries after dependency upgrades. If any
 * import path still resolves to the stale 0.33.5 store while the repo root
 * uses 0.34.5, macOS ends up loading both libvips 1.0.4 and 1.2.4 into the
 * same process. Alias the stale store entries to the canonical ones so every
 * resolution path lands on the same sharp/libvips build.
 */
function patchLegacySharpStoreAliases() {
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (!existsSync(bunCacheDir)) {
    return;
  }

  const linkType = process.platform === "win32" ? "junction" : "dir";
  const aliasPairs = [
    ["sharp@0.33.5", "sharp@0.34.5"],
    ["@img+sharp-darwin-arm64@0.33.5", "@img+sharp-darwin-arm64@0.34.5"],
    [
      "@img+sharp-libvips-darwin-arm64@1.0.4",
      "@img+sharp-libvips-darwin-arm64@1.2.4",
    ],
  ];

  let patched = 0;
  for (const [staleEntry, canonicalEntry] of aliasPairs) {
    const stalePath = resolve(bunCacheDir, staleEntry);
    const canonicalPath = resolve(bunCacheDir, canonicalEntry);
    if (!existsSync(stalePath) || !existsSync(canonicalPath)) continue;

    const canonicalRealPath = realpathSync(canonicalPath);
    const staleRealPath = realpathSync(stalePath);
    if (staleRealPath === canonicalRealPath) continue;

    rmSync(stalePath, { recursive: true, force: true });
    symlinkSync(canonicalRealPath, stalePath, linkType);
    patched++;
    console.log(
      `[patch-deps] Aliased stale sharp store entry ${staleEntry} -> ${canonicalRealPath}`,
    );
  }

  if (patched > 0) {
    console.log(
      `[patch-deps] sharp: normalized ${patched} stale Bun store alias(es) to the canonical sharp version.`,
    );
  }
}
patchLegacySharpStoreAliases();

/**
 * Keep jsdom from eagerly requiring node-canvas on startup.
 *
 * Browser-workspace code uses jsdom for DOM parsing, but Milady does not need
 * canvas-backed rendering in normal runtime boot. jsdom's eager `require("canvas")`
 * pulls in a second libvips/gio stack on macOS, which collides with sharp.
 * Make canvas opt-in for the rare cases that genuinely need it.
 */
function patchJsdomCanvasAutoload() {
  const relPaths = ["lib/jsdom/utils.js"];
  const searchDirs = collectInstalledPackageDirs("jsdom", {
    includeGlobalBunCache: true,
  });
  const oldSnippet = `try {
  exports.Canvas = require("canvas");
} catch {
  exports.Canvas = null;
}`;
  const newSnippet = `if (process.env.MILADY_ENABLE_JSDOM_CANVAS === "1") {
  try {
    exports.Canvas = require("canvas");
  } catch {
    exports.Canvas = null;
  }
} else {
  exports.Canvas = null;
}`;

  let patched = 0;
  for (const dir of searchDirs) {
    for (const relPath of relPaths) {
      const target = resolve(dir, relPath);
      if (!existsSync(target)) continue;

      const src = readFileSync(target, "utf8");
      if (!src.includes(oldSnippet)) continue;

      writeFileSync(target, src.replace(oldSnippet, newSnippet), "utf8");
      patched++;
      console.log(
        `[patch-deps] Disabled eager jsdom canvas autoload: ${target}`,
      );
    }
  }

  if (patched > 0) {
    console.log(
      `[patch-deps] jsdom: patched ${patched} eager canvas autoload path(s).`,
    );
  }
}
patchJsdomCanvasAutoload();

/**
 * Vite caches prebundled dependencies under node_modules/.vite. When patch-deps
 * rewrites installed @elizaos packages, that cache can keep serving the old
 * upstream app-core bundle until it is cleared or Vite is forced to rebuild.
 * Always drop the optimize cache here so the frontend picks up patched deps.
 */
for (const viteCacheDir of [
  resolve(root, "node_modules", ".vite"),
  resolve(root, "apps/app", "node_modules", ".vite"),
]) {
  if (!existsSync(viteCacheDir)) continue;
  rmSync(viteCacheDir, { recursive: true, force: true });
  console.log(`[patch-deps] Cleared Vite optimize cache: ${viteCacheDir}`);
}

function addUniquePath(targets, seenRealpaths, path) {
  if (!existsSync(path)) return;
  try {
    const rp = realpathSync(path);
    if (seenRealpaths.has(rp)) return;
    seenRealpaths.add(rp);
    targets.push(path);
  } catch {
    if (!targets.includes(path)) targets.push(path);
  }
}

/**
 * Patch @pixiv/three-vrm node-material helpers for Three r168+.
 *
 * The published nodes bundle still references THREE_WEBGPU.tslFn in the
 * compatibility helper. Three r182 no longer exports tslFn from three/webgpu,
 * so Vite/Rollup emits a noisy missing-export warning even though the runtime
 * branch would use THREE_TSL.Fn instead. We patch the helper to the modern
 * path directly because this repo pins Three r182.
 */
function findAllThreeVrmNodeFiles() {
  const targets = [];
  const seenRealpaths = new Set();
  const relPaths = ["lib/nodes/index.module.js", "lib/nodes/index.cjs"];
  const searchRoots = [root, resolve(root, "apps/app")];

  for (const searchRoot of searchRoots) {
    for (const relPath of relPaths) {
      addUniquePath(
        targets,
        seenRealpaths,
        resolve(searchRoot, `node_modules/@pixiv/three-vrm/${relPath}`),
      );
    }

    const bunCacheDir = resolve(searchRoot, "node_modules/.bun");
    if (existsSync(bunCacheDir)) {
      try {
        const entries = readdirSync(bunCacheDir);
        for (const entry of entries) {
          if (entry.startsWith("@pixiv+three-vrm@")) {
            for (const relPath of relPaths) {
              addUniquePath(
                targets,
                seenRealpaths,
                resolve(
                  bunCacheDir,
                  entry,
                  `node_modules/@pixiv/three-vrm/${relPath}`,
                ),
              );
            }
          }
        }
      } catch {
        // Ignore bun cache traversal errors.
      }
    }
  }

  return targets;
}

const threeVrmNodeTargets = findAllThreeVrmNodeFiles();
const threeVrmFnCompatBuggy = `return THREE_WEBGPU.tslFn(jsFunc);`;
const threeVrmFnCompatFixed = `return THREE_TSL.Fn(jsFunc);`;

let threeVrmPatched = 0;
if (threeVrmNodeTargets.length === 0) {
  console.log("[patch-deps] three-vrm nodes bundle not found, skipping patch.");
} else {
  for (const target of threeVrmNodeTargets) {
    let src = readFileSync(target, "utf8");

    if (!src.includes(threeVrmFnCompatBuggy)) continue;

    src = src.replaceAll(threeVrmFnCompatBuggy, threeVrmFnCompatFixed);
    writeFileSync(target, src, "utf8");
    threeVrmPatched++;
    console.log(`[patch-deps] Applied three-vrm FnCompat patch: ${target}`);
  }
  console.log(
    `[patch-deps] three-vrm: checked ${threeVrmNodeTargets.length} file(s), applied ${threeVrmPatched} patch(es).`,
  );
}

// Action parsing patch removed — fix shipped in @elizaos/core@2.0.0-alpha.106
// (PR #6661: parseKeyValueXml preserves raw XML string for <actions> content).

/**
 * Patch cssstyle's CommonJS parser bundle to use a CJS-compatible css-color.
 *
 * cssstyle@6.2.0 still calls require("@asamuzakjp/css-color"), but the 5.x
 * css-color line is ESM-only. Under some CI Node/Vitest fork-worker runs this
 * trips ERR_REQUIRE_ASYNC_MODULE before jsdom-based tests even start.
 *
 * We install a root alias pinned to @asamuzakjp/css-color@4.1.2, whose exports
 * still provide a require-compatible CJS entry point, then rewrite cssstyle's
 * require() to target that alias.
 *
 * Remove once cssstyle ships a compatible CommonJS import path or the test
 * stack stops loading it via require().
 */
function patchCssstyleColorCompat() {
  const relPath = "lib/parsers.js";
  const searchDirs = [resolve(root, "node_modules/cssstyle")];
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      for (const entry of readdirSync(bunCacheDir)) {
        if (entry.startsWith("cssstyle@")) {
          searchDirs.push(resolve(bunCacheDir, entry, "node_modules/cssstyle"));
        }
      }
    } catch {}
  }

  const needle = 'require("@asamuzakjp/css-color")';
  const replacement = 'require("@miladyai/css-color-cjs")';

  let patched = 0;
  for (const dir of searchDirs) {
    const target = resolve(dir, relPath);
    if (!existsSync(target)) continue;
    let src = readFileSync(target, "utf8");
    if (!src.includes(needle)) continue;
    src = src.replaceAll(needle, replacement);
    writeFileSync(target, src, "utf8");
    patched++;
    console.log(`[patch-deps] Applied cssstyle color compat fix: ${target}`);
  }

  if (patched > 0) {
    console.log(
      `[patch-deps] cssstyle: fixed ${patched} parser require path(s).`,
    );
  }
}
patchCssstyleColorCompat();

/**
 * 8) @elizaos/plugin-groq: The published plugin bundles @ai-sdk/groq@1.x which
 *    creates v1-spec models. Our root overrides ai@6.x (AI SDK 5) which requires
 *    spec v2+. Symlink the nested @ai-sdk/groq to the root's @ai-sdk/groq@3.x
 *    so the plugin uses the compatible version.
 */
function patchGroqSdkVersion() {
  const rootGroq = resolve(root, "node_modules", "@ai-sdk", "groq");
  if (!existsSync(rootGroq)) return;

  const bunDir = resolve(root, "node_modules", ".bun");
  if (!existsSync(bunDir)) return;

  let patched = 0;
  for (const entry of readdirSync(bunDir)) {
    if (!entry.startsWith("@elizaos+plugin-groq@")) continue;
    const nested = resolve(bunDir, entry, "node_modules", "@ai-sdk", "groq");
    if (!existsSync(nested)) continue;

    // Skip if already a symlink pointing to root
    try {
      if (lstatSync(nested).isSymbolicLink()) {
        if (realpathSync(nested) === realpathSync(rootGroq)) continue;
        unlinkSync(nested);
      } else {
        rmSync(nested, { recursive: true, force: true });
      }
    } catch {
      continue;
    }

    try {
      symlinkSync(rootGroq, nested);
      patched++;
    } catch {
      // Symlink may fail on some systems; non-critical
    }
  }

  if (patched > 0) {
    console.log(
      `[patch-deps] Replaced ${patched} nested @ai-sdk/groq with root v3.x for AI SDK 5 compat`,
    );
  }
}
patchGroqSdkVersion();

/**
 * Stub missing @elizaos/core type declarations.
 *
 * The npm-published @elizaos/core@2.0.0-alpha.115 declares
 * `"types": "./dist/node/index.d.ts"` in its exports but doesn't ship that
 * file. TypeScript strict-mode builds that import @elizaos/core then fail
 * with TS7016 (noImplicitAny). This creates a minimal re-export stub so the
 * package resolves types correctly.
 */
function patchElizaCoreNodeTypes() {
  const bunCacheDir = resolve(root, "node_modules/.bun");
  const dirs = [resolve(root, "node_modules/@elizaos/core")];
  if (existsSync(bunCacheDir)) {
    try {
      for (const entry of readdirSync(bunCacheDir)) {
        if (entry.startsWith("@elizaos+core@")) {
          dirs.push(resolve(bunCacheDir, entry, "node_modules/@elizaos/core"));
        }
      }
    } catch {}
  }

  let patched = 0;
  for (const pkgDir of dirs) {
    const nodeDir = resolve(pkgDir, "dist/node");
    const dtsTarget = resolve(nodeDir, "index.d.ts");
    if (existsSync(dtsTarget)) continue;

    // Find the main .d.ts that contains the real type exports.
    const mainDts = resolve(pkgDir, "dist/index.d.ts");
    if (!existsSync(mainDts) || !existsSync(nodeDir)) continue;

    try {
      writeFileSync(
        dtsTarget,
        '// Auto-generated stub — see patch-deps.mjs patchElizaCoreNodeTypes\nexport * from "../index";\n',
      );
      patched++;
    } catch {}
  }
  if (patched > 0) {
    console.log(
      `[patch-deps] Created ${patched} @elizaos/core dist/node/index.d.ts stub(s)`,
    );
  }
}
patchElizaCoreNodeTypes();

// ---------------------------------------------------------------------------
// MILADY FORK PATCHES
//
// These two patches address upstream alpha API drift that breaks the agent
// runtime on our fork. Both are surgical edits to the compiled node_modules
// dist files, idempotent across reruns, and logged so you can see them
// happening at postinstall time.
// ---------------------------------------------------------------------------

/**
 * Patch @elizaos/plugin-sql countMemories to accept both the old positional
 * signature `(roomId, unique, tableName)` AND the new object signature
 * `({roomIds, unique, tableName})`.
 *
 * Why: upstream @elizaos/core@2.0.0-alpha.113+ calls `adapter.countMemories`
 * with an object `{ roomIds, unique, tableName }`, but
 * @elizaos/plugin-sql@2.0.0-alpha.17 still defines the method with the old
 * positional signature. When core passes an object, plugin-sql receives
 * `roomId = {...}` and `tableName = ""` (default), then throws
 * "tableName is required" on every chat message and completely breaks the
 * /v1/chat/completions endpoint plus every message the bot tries to send.
 *
 * Until plugin-sql is updated upstream to match core's new interface, we
 * rewrite the method prologue to detect and destructure the object form.
 */
function patchPluginSqlCountMemoriesSignature() {
  const dirs = [
    ...collectInstalledPackageDirs("@elizaos/plugin-sql", {
      includeGlobalBunCache: true,
    }),
    resolve(root, "plugins/plugin-sql/typescript"),
  ];
  const needle =
    'async countMemories(roomId, unique3 = true, tableName = "") {';
  const replacement =
    'async countMemories(roomIdOrParams, unique3 = true, tableName = "") { let roomId = roomIdOrParams; if (typeof roomIdOrParams === "object" && roomIdOrParams !== null && !Array.isArray(roomIdOrParams)) { const p = roomIdOrParams; tableName = p.tableName ?? tableName; unique3 = p.unique !== undefined ? p.unique : unique3; roomId = (p.roomIds && p.roomIds[0]) ?? p.roomId; }';
  let patched = 0;
  for (const pkgDir of dirs) {
    const file = resolve(pkgDir, "dist/node/index.node.js");
    if (!existsSync(file)) continue;
    try {
      const content = readFileSync(file, "utf8");
      if (!content.includes(needle)) continue; // already patched or signature changed
      writeFileSync(file, content.replace(needle, replacement));
      patched++;
    } catch {
      // Best-effort — ignore patch failures.
    }
  }
  if (patched > 0) {
    console.log(
      `[patch-deps] Patched ${patched} @elizaos/plugin-sql countMemories signature (milady fork, object-style support)`,
    );
  }
}
patchPluginSqlCountMemoriesSignature();

/**
 * Patch @elizaos/core MemoryService.requireStorage() to return a no-op
 * stub when no MemoryStorageProvider is registered, instead of throwing.
 *
 * Why: upstream @elizaos/core@2.0.0-alpha.113+ introduced an
 * advanced-memory plugin that expects a "memoryStorage" service to be
 * registered by a database plugin. @elizaos/plugin-sql@2.0.0-alpha.17
 * hasn't been updated to provide one. When any api path composes state
 * or runs evaluators, MemoryService.requireStorage() throws
 * "MemoryStorageProvider not available", which breaks the
 * /v1/chat/completions endpoint and several providers.
 *
 * Until plugin-sql catches up, we replace requireStorage() with a shim
 * that returns an in-memory no-op provider. Advanced-memory features
 * (long-term memory, session summaries) gracefully degrade to no-ops
 * instead of crashing the whole message pipeline.
 */
function patchElizaCoreMemoryStorageStub() {
  const dirs = collectInstalledPackageDirs("@elizaos/core", {
    includeGlobalBunCache: true,
  });
  const needle = `requireStorage() {
      if (!this.storage) {
        throw new Error("MemoryStorageProvider not available. Register a memoryStorage service from your database plugin.");
      }
      return this.storage;
    }`;
  const replacement = `requireStorage() {
      if (!this.storage) {
        // milady patch: return a no-op stub so advanced-memory gracefully
        // degrades when no database plugin provides memoryStorage. Without
        // this the api layer throws on every chat message.
        return {
          storeLongTermMemory: async (m) => ({ ...m, id: "stub-" + Date.now(), createdAt: Date.now(), updatedAt: Date.now(), accessCount: 0 }),
          getLongTermMemories: async () => [],
          updateLongTermMemory: async () => {},
          deleteLongTermMemory: async () => {},
          storeSessionSummary: async (s) => ({ ...s, id: "stub-" + Date.now(), createdAt: Date.now(), updatedAt: Date.now() }),
          getCurrentSessionSummary: async () => null,
          updateSessionSummary: async () => {},
          getSessionSummaries: async () => [],
        };
      }
      return this.storage;
    }`;
  let patched = 0;
  for (const pkgDir of dirs) {
    const file = resolve(pkgDir, "dist/node/index.node.js");
    if (!existsSync(file)) continue;
    try {
      const content = readFileSync(file, "utf8");
      if (!content.includes(needle)) continue; // already patched or text drifted
      writeFileSync(file, content.replace(needle, replacement));
      patched++;
    } catch {
      // Best-effort — ignore patch failures.
    }
  }
  if (patched > 0) {
    console.log(
      `[patch-deps] Patched ${patched} @elizaos/core MemoryService.requireStorage stub (milady fork, graceful degradation)`,
    );
  }
}
patchElizaCoreMemoryStorageStub();
