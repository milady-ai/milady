#!/usr/bin/env node
/**
 * Post-install patches for various @elizaos and dependency packages.
 *
 * 1) @elizaos/plugin-sql: Adds .onConflictDoNothing() to createWorld(), guards
 *    ensureEmbeddingDimension(), removes pgcrypto from extension list.
 *    Remove once plugin-sql publishes fixes.
 *
 * 2) Bun exports: Some published @elizaos packages set exports["."].bun =
 *    "./src/index.ts", which only exists in their dev workspace, not in the
 *    npm tarball. Bun picks "bun" first and fails. We remove the dead "bun"/
 *    "default" conditions so Bun resolves via "import" → dist/. WHY: See
 *    docs/plugin-resolution-and-node-path.md "Bun and published package exports".
 *
 * 3) @elizaos/core: Strips the hard-coded streaming retry line pushed to
 *    onChunk on each parse retry (avoids triple "-- that's not right..." in chat).
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  patchAutonomousMiladyOnboardingPresets,
  patchAutonomousTypeError,
  patchBrokenElizaCoreRuntimeDists,
  patchBunExports,
  patchCodexFolderApprovalPromptCompat,
  patchExtensionlessJsExports,
  patchMissingLifecycleScript,
  patchNobleHashesCompat,
  patchProperLockfileSignalExitCompat,
  patchPtyManagerCursorPositionCompat,
  patchPtyManagerEsmDirnameCompat,
  pruneNestedElizaPluginCoreCopies,
  warnStaleBunCache,
} from "./lib/patch-bun-exports.mjs";
import { patchElizaCoreClientChatEvaluate } from "./lib/patch-eliza-core-client-chat-eval.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Bust stale Bun cache entries for @elizaos packages.
// See warnStaleBunCache() in lib/patch-bun-exports.mjs for details.
// ---------------------------------------------------------------------------
warnStaleBunCache(root);

// ---------------------------------------------------------------------------
// Patch @elizaos packages whose exports["."].bun points to ./src/index.ts.
// Logic lives in scripts/lib/patch-bun-exports.mjs (testable).
// ---------------------------------------------------------------------------
try {
  patchBunExports(root, "@elizaos/plugin-coding-agent");
} catch {
  // May fail if the bun patch already modified package.json.
}
try {
  patchMissingLifecycleScript(
    root,
    "@elizaos/plugin-agent-orchestrator",
    "postinstall",
    "./scripts/ensure-node-pty.mjs",
  );
} catch {
  // May fail if the version already has the script or JSON is already patched.
}

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
patchElizaCoreClientChatEvaluate(root);
try {
  patchAutonomousMiladyOnboardingPresets(root);
} catch {
  // Source file may not exist (moved to @miladyai/shared).
}
patchAutonomousTypeError(root);

/**
 * Patch @elizaos/plugin-pdf broken ESM bundle.
 *
 * The published alpha.15 bundle exports `default3 as default` but never
 * defines `default3`. We replace it with a harmless empty default export.
 * Remove once a fixed @elizaos/plugin-pdf is published.
 */
function patchPluginPdfBrokenDefault() {
  const relPaths = ["dist/node/index.node.js", "dist/index.js"];
  const searchDirs = [resolve(root, "node_modules/@elizaos/plugin-pdf")];
  // Also search inside .bun cache
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      for (const entry of readdirSync(bunCacheDir)) {
        if (entry.startsWith("@elizaos+plugin-pdf@")) {
          searchDirs.push(
            resolve(bunCacheDir, entry, "node_modules/@elizaos/plugin-pdf"),
          );
        }
      }
    } catch {}
  }

  let patched = 0;
  for (const dir of searchDirs) {
    for (const relPath of relPaths) {
      const target = resolve(dir, relPath);
      if (!existsSync(target)) continue;
      let src = readFileSync(target, "utf8");
      const hasBroken =
        src.includes("default3 as default") || src.includes("{} as default");
      if (!hasBroken) continue;
      // Replace broken default exports with 'pdfPlugin as default' since
      // pdfPlugin is the main export and default3 / {} were broken aliases for it.
      src = src.replace(/\bdefault3 as default\b/g, "pdfPlugin as default");
      src = src.replace(/\{} as default/g, "pdfPlugin as default");
      writeFileSync(target, src, "utf8");
      patched++;
      console.log(`[patch-deps] Applied plugin-pdf default3 fix: ${target}`);
    }
  }
  if (patched > 0) {
    console.log(`[patch-deps] plugin-pdf: fixed ${patched} broken bundle(s).`);
  }
}
patchPluginPdfBrokenDefault();

/**
 * Patch @elizaos/plugin-sql UUID validation regex.
 *
 * The upstream plugin strictly checks for UUID versions 1-5, but ElizaOS
 * generates custom version 0 UUIDs. We patch the regex to allow version 0.
 * Remove once upstream fixes its isValidUUID method.
 */
function patchPluginSqlUUID() {
  const relPaths = ["dist/node/index.node.js", "dist/browser/index.browser.js"];
  const searchDirs = [resolve(root, "node_modules/@elizaos/plugin-sql")];
  // Also search inside .bun cache
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      for (const entry of readdirSync(bunCacheDir)) {
        if (entry.startsWith("@elizaos+plugin-sql@")) {
          searchDirs.push(
            resolve(bunCacheDir, entry, "node_modules/@elizaos/plugin-sql"),
          );
        }
      }
    } catch {}
  }

  let patched = 0;
  for (const dir of searchDirs) {
    for (const relPath of relPaths) {
      const target = resolve(dir, relPath);
      if (!existsSync(target)) continue;
      let src = readFileSync(target, "utf8");

      const searchString =
        "/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i";
      const replaceString =
        "/^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i";

      if (!src.includes(searchString)) continue;

      src = src.replace(searchString, replaceString);
      writeFileSync(target, src, "utf8");
      patched++;
      console.log(`[patch-deps] Applied plugin-sql UUID regex fix: ${target}`);
    }
  }
  if (patched > 0) {
    console.log(
      `[patch-deps] plugin-sql: fixed ${patched} UUID validation check(s).`,
    );
  }
}
patchPluginSqlUUID();

/**
 * Patch @elizaos/plugin-trajectory-logger JSONB array decoding.
 *
 * PGlite/Postgres can return JSONB arrays as native JS arrays. The published
 * logger only accepted strings and plain objects, so `steps_json` decoded to
 * `[]` and the Trajectories detail view appeared blank even when call counts
 * were present.
 *
 * Remove once upstream accepts native JSON arrays in rowToTrajectory().
 */
function patchTrajectoryLoggerJsonArrayDecode() {
  const relPaths = ["dist/node/index.node.js", "dist/index.js"];
  const searchDirs = [
    resolve(root, "node_modules/@elizaos/plugin-trajectory-logger"),
  ];
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      for (const entry of readdirSync(bunCacheDir)) {
        if (entry.startsWith("@elizaos+plugin-trajectory-logger@")) {
          searchDirs.push(
            resolve(
              bunCacheDir,
              entry,
              "node_modules/@elizaos/plugin-trajectory-logger",
            ),
          );
        }
      }
    } catch {}
  }

  let patched = 0;
  const brokenGuard =
    'if (typeof cell === "object" && cell !== null && !Array.isArray(cell)) {';
  const fixedGuard = 'if (typeof cell === "object" && cell !== null) {';

  for (const dir of searchDirs) {
    for (const relPath of relPaths) {
      const target = resolve(dir, relPath);
      if (!existsSync(target)) continue;
      let src = readFileSync(target, "utf8");
      if (!src.includes(brokenGuard)) continue;
      src = src.replaceAll(brokenGuard, fixedGuard);
      writeFileSync(target, src, "utf8");
      patched++;
      console.log(
        `[patch-deps] Applied trajectory logger JSON array decode fix: ${target}`,
      );
    }
  }

  if (patched > 0) {
    console.log(
      `[patch-deps] plugin-trajectory-logger: fixed ${patched} JSON decode guard(s).`,
    );
  }
}
patchTrajectoryLoggerJsonArrayDecode();

/**
 * Patch @miladyai/agent ensureBrowserServerLink() file extension.
 *
 * The upstream code checks for `dist/index` without `.js` extension, but
 * existsSync() requires the full filename. Fix to `dist/index.js`.
 * Remove once the upstream adds the extension.
 */
function patchBrowserServerIndexExtension() {
  const searchDirs = [resolve(root, "node_modules/@miladyai/agent")];
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      for (const entry of readdirSync(bunCacheDir)) {
        if (entry.startsWith("@elizaos+autonomous@")) {
          searchDirs.push(
            resolve(bunCacheDir, entry, "node_modules/@miladyai/agent"),
          );
        }
      }
    } catch {}
  }

  let patched = 0;
  for (const dir of searchDirs) {
    const target = resolve(dir, "src/runtime/eliza.ts");
    if (!existsSync(target)) continue;
    let src = readFileSync(target, "utf8");
    if (!src.includes('"dist", "index"')) continue;
    // Only fix the two browser-server checks, not other index references
    src = src.replace(
      /path\.join\(serverDir, "dist", "index"\)/g,
      'path.join(serverDir, "dist", "index.js")',
    );
    src = src.replace(
      /path\.join\(stagehandDir, "dist", "index"\)/g,
      'path.join(stagehandDir, "dist", "index.js")',
    );
    writeFileSync(target, src, "utf8");
    patched++;
    console.log(
      `[patch-deps] Applied browser server index.js extension fix: ${target}`,
    );
  }
  if (patched > 0) {
    console.log(
      `[patch-deps] autonomous: fixed ${patched} browser server check(s).`,
    );
  }
}
patchBrowserServerIndexExtension();

/**
 * Patch @miladyai/agent server reset safety check.
 *
 * The upstream isSafeResetStateDir only allows state directories whose path
 * contains ".eliza" or "eliza" as a segment. Since Milady sets ELIZA_NAMESPACE
 * to "milady", the state dir resolves to ~/.milady which the safety check
 * rejects. We expand the allowed segments set to include "milady" / ".milady".
 * Remove once the upstream accepts custom namespaces in the safety check.
 */
function patchAutonomousResetAllowedSegments() {
  const serverJs = resolve(
    root,
    "node_modules/@miladyai/agent/packages/agent/src/api/server.js",
  );
  if (!existsSync(serverJs)) {
    console.log(
      "[patch-deps] autonomous server.js not found, skipping reset-segments patch.",
    );
    return;
  }
  let src = readFileSync(serverJs, "utf8");
  const needle =
    'const RESET_STATE_ALLOWED_SEGMENTS = new Set([".eliza", "eliza"])';
  if (!src.includes(needle)) {
    if (
      src.includes('"milady"') &&
      src.includes("RESET_STATE_ALLOWED_SEGMENTS")
    ) {
      console.log(
        "[patch-deps] autonomous server.js already patched for milady reset.",
      );
    } else {
      console.log(
        "[patch-deps] autonomous server.js: expected reset-segments pattern not found, skipping.",
      );
    }
    return;
  }
  src = src.replace(
    needle,
    'const RESET_STATE_ALLOWED_SEGMENTS = new Set([".eliza", "eliza", ".milady", "milady"])',
  );
  writeFileSync(serverJs, src, "utf8");
  console.log(
    "[patch-deps] Applied autonomous reset-segments patch for milady namespace.",
  );
}
patchAutonomousResetAllowedSegments();

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

/**
 * Patch @elizaos/core synthetic action/reply chat messages.
 *
 * The published core runtime currently persists internal action bookkeeping as
 * normal conversation memories, which shows up in Milady chat as:
 *   - "Generated reply: ..."
 *   - "Executed action: ..."
 *
 * Milady already surfaces the real assistant reply and the avatar side effects,
 * so these extra messages duplicate the turn and clutter chat history. We keep
 * the action results in runtime state/logs, but stop emitting them as
 * user-facing chat memories.
 */
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

function findAllElizaCoreBundleFiles() {
  const targets = [];
  const seenRealpaths = new Set();
  const relPaths = [
    "dist/index.node.js",
    "dist/index.browser.js",
    "dist/index.js",
    "dist/testing/index.js",
    "dist/browser/index.browser.js",
    "dist/node/index.node.js",
  ];
  const searchRoots = [root, resolve(root, "apps/app")];

  for (const searchRoot of searchRoots) {
    for (const relPath of relPaths) {
      addUniquePath(
        targets,
        seenRealpaths,
        resolve(searchRoot, `node_modules/@elizaos/core/${relPath}`),
      );
    }

    const bunCacheDir = resolve(searchRoot, "node_modules/.bun");
    if (!existsSync(bunCacheDir)) continue;

    try {
      const entries = readdirSync(bunCacheDir);
      for (const entry of entries) {
        if (!entry.startsWith("@elizaos+core@")) continue;
        for (const relPath of relPaths) {
          addUniquePath(
            targets,
            seenRealpaths,
            resolve(
              bunCacheDir,
              entry,
              `node_modules/@elizaos/core/${relPath}`,
            ),
          );
        }
      }
    } catch {
      // Ignore bun cache traversal errors.
    }
  }

  return targets;
}

const elizaCoreBundleTargets = findAllElizaCoreBundleFiles();
const coreGeneratedReplyPattern =
  /text:\s*`Generated reply: \${[$A-Za-z_][\w$]*\.text}`,/g;
const coreActionMemoryPattern =
  /const ([$A-Za-z_][\w$]*) = \{\s*id: ([$A-Za-z_][\w$]*),\s*entityId: this\.agentId,\s*roomId: ([$A-Za-z_][\w$]*)\.roomId,\s*worldId: \3\.worldId,\s*content: \{\s*text: ([$A-Za-z_][\w$]*)\?\.text \|\| `Executed action: \$\{([$A-Za-z_][\w$]*)\.name\}`,\s*source: "action"\s*\}\s*\};\s*await this\.createMemory\(\1, "messages"\);/g;

let elizaCorePatched = 0;
if (elizaCoreBundleTargets.length === 0) {
  console.log(
    "[patch-deps] @elizaos/core bundle not found, skipping chat patch.",
  );
} else {
  for (const target of elizaCoreBundleTargets) {
    let src = readFileSync(target, "utf8");
    const original = src;

    src = src.replace(coreGeneratedReplyPattern, 'text: "",');
    src = src.replace(
      coreActionMemoryPattern,
      (_match, memoryVar, actionIdVar, messageVar, actionResultVar) =>
        [
          `const actionText = typeof ${actionResultVar}?.text === "string" ? ${actionResultVar}.text.trim() : "";`,
          "        if (actionText) {",
          `          const ${memoryVar} = {`,
          `            id: ${actionIdVar},`,
          "            entityId: this.agentId,",
          `            roomId: ${messageVar}.roomId,`,
          `            worldId: ${messageVar}.worldId,`,
          "            content: {",
          "              text: actionText,",
          '              source: "action"',
          "            }",
          "          };",
          `          await this.createMemory(${memoryVar}, "messages");`,
          "        }",
        ].join("\n"),
    );

    if (src !== original) {
      writeFileSync(target, src, "utf8");
      elizaCorePatched++;
      console.log(`[patch-deps] Applied @elizaos/core chat patch: ${target}`);
    }
  }
  console.log(
    `[patch-deps] @elizaos/core: checked ${elizaCoreBundleTargets.length} file(s), applied ${elizaCorePatched} patch(es).`,
  );
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
