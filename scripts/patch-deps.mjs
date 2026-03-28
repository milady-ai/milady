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

// ---------------------------------------------------------------------------
// @elizaos/plugin-openrouter — version is pinned in root package.json to
// 2.0.0-alpha.10 (exact, no caret).
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
 * Patch @elizaos/plugin-sql participant insertion for Postgres dialect drift.
 *
 * Some deployments produce an invalid ON CONFLICT target for participants and
 * fail with:
 *   "there is no unique or exclusion constraint matching ON CONFLICT specification"
 *
 * We replace addParticipant/addParticipantsRoom to perform an explicit
 * existence check followed by plain insert, avoiding ON CONFLICT entirely.
 * Remove once upstream fixes the generated participant insert query.
 */
function patchPluginSqlParticipantInsertConflict() {
  const relPaths = [
    "dist/node/index.node.js",
    "dist/cjs/index.node.cjs",
    "dist/browser/index.browser.js",
  ];
  const searchDirs = [resolve(root, "node_modules/@elizaos/plugin-sql")];
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

  const oldAddParticipant = `await this.db.insert(participantTable).values({
          entityId,
          roomId,
          agentId: this.agentId
        }).onConflictDoNothing();
        return true;`;
  const newAddParticipant = `const existing = await this.db.select({ id: participantTable.id }).from(participantTable).where(and(eq2(participantTable.entityId, entityId), eq2(participantTable.roomId, roomId), eq2(participantTable.agentId, this.agentId))).limit(1);
        if (existing.length === 0) {
          await this.db.insert(participantTable).values({
            entityId,
            roomId,
            agentId: this.agentId
          });
        }
        return true;`;

  const oldAddParticipantsRoom = `const values = entityIds.map((id) => ({
          entityId: id,
          roomId,
          agentId: this.agentId
        }));
        await this.db.insert(participantTable).values(values).onConflictDoNothing().execute();
        return true;`;
  const newAddParticipantsRoom = `for (const id of entityIds) {
          const existing = await this.db.select({ id: participantTable.id }).from(participantTable).where(and(eq2(participantTable.entityId, id), eq2(participantTable.roomId, roomId), eq2(participantTable.agentId, this.agentId))).limit(1);
          if (existing.length === 0) {
            await this.db.insert(participantTable).values({
              entityId: id,
              roomId,
              agentId: this.agentId
            });
          }
        }
        return true;`;

  let patched = 0;
  for (const dir of searchDirs) {
    for (const relPath of relPaths) {
      const target = resolve(dir, relPath);
      if (!existsSync(target)) continue;
      let src = readFileSync(target, "utf8");
      const before = src;

      src = src.replace(oldAddParticipant, newAddParticipant);
      src = src.replace(oldAddParticipantsRoom, newAddParticipantsRoom);

      if (src !== before) {
        writeFileSync(target, src, "utf8");
        patched++;
        console.log(
          `[patch-deps] Applied plugin-sql participant ON CONFLICT workaround: ${target}`,
        );
      }
    }
  }

  if (patched > 0) {
    console.log(
      `[patch-deps] plugin-sql: patched ${patched} participant insertion path(s).`,
    );
  }
}
patchPluginSqlParticipantInsertConflict();

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
 * Patch @elizaos/plugin-local-embedding Linux GPU probe noise in slim images.
 *
 * Debian slim containers often do not include lspci. Upstream logs this as an
 * error during startup, even though GPU probing is optional. Downgrade that
 * path to debug/warn and keep returning null.
 *
 * Remove once upstream handles missing lspci gracefully.
 */
function patchLocalEmbeddingLinuxGpuProbe() {
  const relPaths = ["dist/index.js"];
  const searchDirs = [
    resolve(root, "node_modules/@elizaos/plugin-local-embedding"),
  ];
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      for (const entry of readdirSync(bunCacheDir)) {
        if (entry.startsWith("@elizaos+plugin-local-embedding@")) {
          searchDirs.push(
            resolve(
              bunCacheDir,
              entry,
              "node_modules/@elizaos/plugin-local-embedding",
            ),
          );
        }
      }
    } catch {}
  }

  const oldSnippet = `logger3.error("Linux GPU detection failed", { error });
        return null;`;
  const newSnippet = `const message = error instanceof Error ? error.message : String(error);
        if (message.includes("lspci") && message.includes("not found")) {
          logger3.debug("Linux GPU detection skipped: lspci not installed");
        } else {
          logger3.warn("Linux GPU detection failed", { error: message });
        }
        return null;`;

  let patched = 0;
  for (const dir of searchDirs) {
    for (const relPath of relPaths) {
      const target = resolve(dir, relPath);
      if (!existsSync(target)) continue;
      let src = readFileSync(target, "utf8");
      if (!src.includes(oldSnippet)) continue;
      src = src.replace(oldSnippet, newSnippet);
      writeFileSync(target, src, "utf8");
      patched++;
      console.log(
        `[patch-deps] Applied local-embedding Linux GPU probe log patch: ${target}`,
      );
    }
  }

  if (patched > 0) {
    console.log(
      `[patch-deps] plugin-local-embedding: patched ${patched} Linux GPU probe path(s).`,
    );
  }
}
patchLocalEmbeddingLinuxGpuProbe();

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

/**
 * Patch @elizaos/plugin-agent-skills GET_SKILL_GUIDANCE local skill fallback.
 *
 * When the remote marketplace search fails (e.g. 429 rate limit) and returns
 * no results, the upstream code short-circuits on `!bestRemote` and says
 * "couldn't find skill" — ignoring a strong local match entirely.
 *
 * We flip the condition so that a strong local match (score >= 8) always wins,
 * regardless of whether the remote search succeeded.
 *
 * Remove once upstream fixes the local-first fallback logic.
 */
function patchAgentSkillsLocalFallback() {
  const relPath = "dist/index.js";
  const searchDirs = [
    resolve(root, "node_modules/@elizaos/plugin-agent-skills"),
  ];
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      for (const entry of readdirSync(bunCacheDir)) {
        if (entry.startsWith("@elizaos+plugin-agent-skills@")) {
          searchDirs.push(
            resolve(
              bunCacheDir,
              entry,
              "node_modules/@elizaos/plugin-agent-skills",
            ),
          );
        }
      }
    } catch {}
  }

  const needle =
    "if (!bestRemote || bestRemote.score < 0.25 && !localIsStrong) {";
  const replacement =
    "if (!localIsStrong && (!bestRemote || bestRemote.score < 0.25)) {";

  let patched = 0;
  for (const dir of searchDirs) {
    const target = resolve(dir, relPath);
    if (!existsSync(target)) continue;
    let src = readFileSync(target, "utf8");
    if (!src.includes(needle)) continue;
    src = src.replaceAll(needle, replacement);
    writeFileSync(target, src, "utf8");
    patched++;
    console.log(
      `[patch-deps] Applied plugin-agent-skills local fallback fix: ${target}`,
    );
  }
  if (patched > 0) {
    console.log(
      `[patch-deps] plugin-agent-skills: fixed ${patched} local fallback check(s).`,
    );
  } else {
    console.log(
      "[patch-deps] plugin-agent-skills local fallback: already patched or pattern not found.",
    );
  }
}
patchAgentSkillsLocalFallback();
