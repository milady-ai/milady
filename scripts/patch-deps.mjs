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
  patchAutonomousTypeError,
  patchBrokenElizaCoreRuntimeDists,
  patchBunExports,
  patchCodexFolderApprovalPromptCompat,
  patchElectrobunWindowsTar,
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
patchElectrobunWindowsTar(root);

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
 * Patch @elizaos/plugin-elizacloud alpha.7 text/object inference handlers.
 *
 * The published bundle routes TEXT_* / OBJECT_* through @ai-sdk/openai chat
 * completions. As of March 28, 2026, Eliza Cloud's `/chat/completions`
 * endpoint returns an empty HTTP 500 for otherwise valid requests, and
 * `/responses` returns a different 500 when `input` is a plain string:
 * `n.map is not a function`.
 *
 * The working request shape is `/responses` with array-form `input`, e.g.:
 *   { input: [{ role, content: [{ type: "input_text", text }] }] }
 *
 * We patch the node bundle to use that path directly so runtime text/object
 * generation surfaces the real upstream error (for example 402 insufficient
 * funds) and works again once the cloud account is funded.
 *
 * Remove once a fixed @elizaos/plugin-elizacloud is published.
 */
function patchPluginElizaCloudResponsesCompat() {
  const relPaths = ["dist/node/index.node.js"];
  const searchDirs = [resolve(root, "node_modules/@elizaos/plugin-elizacloud")];
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      for (const entry of readdirSync(bunCacheDir)) {
        if (entry.startsWith("@elizaos+plugin-elizacloud@")) {
          searchDirs.push(
            resolve(
              bunCacheDir,
              entry,
              "node_modules/@elizaos/plugin-elizacloud",
            ),
          );
        }
      }
    } catch {}
  }

  const oldGenerateObject =
    String.raw`async function generateObjectByModelType(runtime, params, modelType, getModelFn) {
  const openai = createOpenAIClient(runtime);
  const modelName = getModelFn(runtime);
  logger8.log(\`[ELIZAOS_CLOUD] Using \${modelType} model: \${modelName}\`);
  const reasoning = isReasoningModel(modelName);
  try {
    const model = openai.chat(modelName);
    const { object, usage } = await generateObject({
      model,
      output: "no-schema",
      prompt: params.prompt,
      ...reasoning ? {} : { temperature: params.temperature ?? 0 },
      experimental_repairText: getJsonRepairFunction()
    });
    if (usage) {
      emitModelUsageEvent(runtime, modelType, params.prompt, usage);
    }
    return object;
  } catch (error) {
    if (error instanceof JSONParseError2) {
      logger8.error(\`[generateObject] Failed to parse JSON: \${error.message}\`);
      const repairFunction = getJsonRepairFunction();
      const repairedJsonString = await repairFunction({
        text: error.text,
        error
      });
      if (repairedJsonString) {
        try {
          const repairedObject = JSON.parse(repairedJsonString);
          logger8.info("[generateObject] Successfully repaired JSON.");
          return repairedObject;
        } catch (repairParseError) {
          const message = repairParseError instanceof Error ? repairParseError.message : String(repairParseError);
          logger8.error(\`[generateObject] Failed to parse repaired JSON: \${message}\`);
          throw repairParseError;
        }
      } else {
        logger8.error("[generateObject] JSON repair failed.");
        throw error;
      }
    } else {
      const message = error instanceof Error ? error.message : String(error);
      logger8.error(\`[generateObject] Error: \${message}\`);
      throw error;
    }
  }
}`
      .replaceAll("\\`", "`")
      .replaceAll("\\${", "${");
  const newGenerateObject =
    String.raw`async function generateObjectByModelType(runtime, params, modelType, getModelFn) {
  const modelName = getModelFn(runtime);
  logger8.log(\`[ELIZAOS_CLOUD] Using \${modelType} model: \${modelName}\`);
  const reasoning = isReasoningModel(modelName);
  const prompt = params.prompt;
  const input = [];
  if (runtime.character.system) {
    input.push({
      role: "system",
      content: [{ type: "input_text", text: runtime.character.system }]
    });
  }
  input.push({
    role: "user",
    content: [{ type: "input_text", text: prompt }]
  });
  const requestBody = {
    model: modelName,
    input,
    max_output_tokens: params.maxTokens ?? 8192
  };
  if (!reasoning && typeof params.temperature === "number") {
    requestBody.temperature = params.temperature;
  }
  const response = await fetch(\`\${getBaseURL(runtime)}/responses\`, {
    method: "POST",
    headers: {
      ...getAuthHeader(runtime),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
  const responseText = await response.text();
  let data = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      logger8.error(\`[generateObject] Failed to parse Eliza Cloud JSON: \${parseErr instanceof Error ? parseErr.message : String(parseErr)}\`);
    }
  }
  if (!response.ok) {
    const errorBody = typeof data === "object" && data ? data.error : undefined;
    const errorMessage = typeof errorBody?.message === "string" && errorBody.message.trim() ? errorBody.message.trim() : \`elizaOS Cloud error \${response.status}\`;
    const requestError = new Error(errorMessage);
    requestError.status = response.status;
    if (errorBody) {
      requestError.error = errorBody;
    }
    throw requestError;
  }
  if (data?.usage) {
    emitModelUsageEvent(runtime, modelType, prompt, {
      inputTokens: data.usage.input_tokens ?? 0,
      outputTokens: data.usage.output_tokens ?? 0,
      totalTokens: data.usage.total_tokens ?? 0
    });
  }
  let jsonText = typeof data?.output_text === "string" ? data.output_text : "";
  if (!jsonText && Array.isArray(data?.output)) {
    jsonText = data.output.flatMap((item) => Array.isArray(item?.content) ? item.content : []).map((part) => typeof part?.text === "string" ? part.text : "").join("");
  }
  if (!jsonText.trim()) {
    throw new Error("Object generation returned empty response");
  }
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const repairFunction = getJsonRepairFunction();
    const repairedJsonString = await repairFunction({
      text: jsonText,
      error
    });
    if (repairedJsonString) {
      try {
        const repairedObject = JSON.parse(repairedJsonString);
        logger8.info("[generateObject] Successfully repaired JSON.");
        return repairedObject;
      } catch (repairParseError) {
        const message = repairParseError instanceof Error ? repairParseError.message : String(repairParseError);
        logger8.error(\`[generateObject] Failed to parse repaired JSON: \${message}\`);
        throw repairParseError;
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    logger8.error(\`[generateObject] Failed to parse JSON: \${message}\`);
    throw error;
  }
}`
      .replaceAll("\\`", "`")
      .replaceAll("\\${", "${");

  const oldGenerateText =
    String.raw`async function generateTextWithModel(runtime, modelType, params) {
  const { generateParams, modelName, prompt } = buildGenerateParams(runtime, modelType, params);
  logger11.debug(\`[ELIZAOS_CLOUD] Generating text with \${modelType} model: \${modelName}\`);
  if (params.stream) {
    return handleStreamingGeneration(runtime, modelType, generateParams, prompt);
  }
  logger11.log(\`[ELIZAOS_CLOUD] Using \${modelType} model: \${modelName}\`);
  logger11.log(prompt);
  const response = await generateText(generateParams);
  if (response.usage) {
    emitModelUsageEvent(runtime, modelType, prompt, response.usage);
  }
  return response.text;
}`
      .replaceAll("\\`", "`")
      .replaceAll("\\${", "${");
  const newGenerateText =
    String.raw`async function generateTextWithModel(runtime, modelType, params) {
  const { modelName, prompt } = buildGenerateParams(runtime, modelType, params);
  logger11.debug(\`[ELIZAOS_CLOUD] Generating text with \${modelType} model: \${modelName}\`);
  if (params.stream) {
    logger11.warn("[ELIZAOS_CLOUD] Streaming text disabled for responses compatibility; falling back to buffered response.");
  }
  logger11.log(\`[ELIZAOS_CLOUD] Using \${modelType} model: \${modelName}\`);
  logger11.log(prompt);
  const reasoning = isReasoningModel2(modelName) || modelType === ModelType5.TEXT_REASONING_SMALL || modelType === ModelType5.TEXT_REASONING_LARGE;
  const input = [];
  if (runtime.character.system) {
    input.push({
      role: "system",
      content: [{ type: "input_text", text: runtime.character.system }]
    });
  }
  input.push({
    role: "user",
    content: [{ type: "input_text", text: prompt }]
  });
  const requestBody = {
    model: modelName,
    input,
    max_output_tokens: params.maxTokens ?? 8192
  };
  if (!reasoning && typeof params.temperature === "number") {
    requestBody.temperature = params.temperature;
  }
  const response = await fetch(\`\${getBaseURL(runtime)}/responses\`, {
    method: "POST",
    headers: {
      ...getAuthHeader(runtime),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
  const responseText = await response.text();
  let data = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      logger11.error(\`[ELIZAOS_CLOUD] Failed to parse responses JSON: \${parseErr instanceof Error ? parseErr.message : String(parseErr)}\`);
    }
  }
  if (!response.ok) {
    const errorBody = typeof data === "object" && data ? data.error : undefined;
    const errorMessage = typeof errorBody?.message === "string" && errorBody.message.trim() ? errorBody.message.trim() : \`elizaOS Cloud error \${response.status}\`;
    const requestError = new Error(errorMessage);
    requestError.status = response.status;
    if (errorBody) {
      requestError.error = errorBody;
    }
    throw requestError;
  }
  if (data?.usage) {
    emitModelUsageEvent(runtime, modelType, prompt, {
      inputTokens: data.usage.input_tokens ?? 0,
      outputTokens: data.usage.output_tokens ?? 0,
      totalTokens: data.usage.total_tokens ?? 0
    });
  }
  let text = typeof data?.output_text === "string" ? data.output_text : "";
  if (!text && Array.isArray(data?.output)) {
    text = data.output.flatMap((item) => Array.isArray(item?.content) ? item.content : []).map((part) => typeof part?.text === "string" ? part.text : "").join("");
  }
  if (!text.trim()) {
    throw new Error("elizaOS Cloud returned no text response");
  }
  return text;
}`
      .replaceAll("\\`", "`")
      .replaceAll("\\${", "${");

  let patched = 0;
  const seenTargets = new Set();
  const objectCompatPattern =
    /async function generateObjectByModelType\(runtime, params, modelType, getModelFn\) \{[\s\S]*?\n\}(?=\nasync function handleObjectSmall)/;
  const textCompatPattern =
    /async function generateTextWithModel\(runtime, modelType, params\) \{[\s\S]*?\n\}(?=\nasync function handleTextSmall)/;
  for (const dir of searchDirs) {
    const packageDir = existsSync(dir) ? realpathSync(dir) : dir;
    for (const relPath of relPaths) {
      const target = resolve(packageDir, relPath);
      if (!existsSync(target) || seenTargets.has(target)) continue;
      seenTargets.add(target);

      let src = readFileSync(target, "utf8");
      const original = src;
      if (src.includes(oldGenerateObject)) {
        src = src.replace(oldGenerateObject, newGenerateObject);
      } else if (objectCompatPattern.test(src)) {
        src = src.replace(objectCompatPattern, newGenerateObject);
      }
      if (src.includes(oldGenerateText)) {
        src = src.replace(oldGenerateText, newGenerateText);
      } else if (textCompatPattern.test(src)) {
        src = src.replace(textCompatPattern, newGenerateText);
      }
      if (src.includes("Streaming text disabled for responses compatibility")) {
        src = src.replaceAll("\\${", "${");
        src = src.replaceAll("\\`", "`");
      }
      if (src === original) continue;

      writeFileSync(target, src, "utf8");
      patched++;
      console.log(
        `[patch-deps] Applied plugin-elizacloud responses compatibility fix: ${target}`,
      );
    }
  }

  if (patched > 0) {
    console.log(
      `[patch-deps] plugin-elizacloud: fixed ${patched} text/object inference bundle(s).`,
    );
  }
}
patchPluginElizaCloudResponsesCompat();

/**
 * Patch @elizaos/plugin-sql UUID validation regex.
 *
 * The upstream plugin strictly checks for UUID versions 1-5, but elizaOS
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

/**
 * Patch testcafe for Bun compatibility.
 *
 * Two issues prevent TestCafe from running under `bunx testcafe`:
 *
 * 1) api-based.js uses `module.constructor` to get the Module object, but in
 *    Bun `module.constructor._nodeModulePaths` is undefined. We fall back to
 *    `require('module')` which has the function.
 *
 * 2) callsite.js assumes callsite objects are always non-null, but Bun's stack
 *    trace capture can produce null callsites. We add null guards.
 *
 * Remove once TestCafe ships Bun-compatible builds.
 */
function patchTestCafeBunCompat() {
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (!existsSync(bunCacheDir)) return;

  let patched = 0;

  for (const entry of readdirSync(bunCacheDir)) {
    if (!entry.startsWith("testcafe@")) continue;

    const tcRoot = resolve(bunCacheDir, entry, "node_modules/testcafe");

    if (!existsSync(tcRoot)) continue;

    // Patch 1: module.constructor -> require('module') fallback
    const apiBasedPath = resolve(tcRoot, "lib/compiler/test-file/api-based.js");
    const moduleNeedle = "const Module = module.constructor;";
    if (!existsSync(apiBasedPath)) {
      console.warn(
        "[patch-deps] testcafe: expected file missing (layout may have changed). " +
          `Update patchTestCafeBunCompat() in patch-deps.mjs. Missing: ${apiBasedPath}`,
      );
    } else {
      let src = readFileSync(apiBasedPath, "utf8");
      const moduleAlreadyPatched =
        src.includes("typeof module.constructor._nodeModulePaths") &&
        src.includes("require('module')");
      if (src.includes(moduleNeedle)) {
        src = src.replace(
          moduleNeedle,
          "const Module = typeof module.constructor._nodeModulePaths === 'function' ? module.constructor : require('module');",
        );
        writeFileSync(apiBasedPath, src, "utf8");
        patched++;
        console.log(
          `[patch-deps] Applied testcafe Module constructor Bun fix: ${apiBasedPath}`,
        );
      } else if (!moduleAlreadyPatched) {
        console.warn(
          "[patch-deps] testcafe: Module constructor patch needle not found in api-based.js — " +
            "TestCafe may have refactored; Bun runs may fail until patch-deps.mjs is updated. " +
            `File: ${apiBasedPath}`,
        );
      }
    }

    // Patch 2: null-safe callsite helpers
    const callsitePath = resolve(tcRoot, "lib/utils/callsite.js");
    const oldStackFrame =
      "function getCallsiteStackFrameString(callsite) {\n    return callsite.stackFrames[callsite.callsiteFrameIdx].toString();\n}";
    const newStackFrame =
      "function getCallsiteStackFrameString(callsite) {\n    if (!callsite || !callsite.stackFrames) return '<unknown>';\n    return callsite.stackFrames[callsite.callsiteFrameIdx].toString();\n}";
    const oldGetId =
      "function getCallsiteId(callsite) {\n    return `\u0024{callsite.filename}:\u0024{callsite.lineNum}`;\n}";
    const newGetId =
      "function getCallsiteId(callsite) {\n    if (!callsite) return '<unknown>:0';\n    return `\u0024{callsite.filename}:\u0024{callsite.lineNum}`;\n}";

    if (!existsSync(callsitePath)) {
      console.warn(
        "[patch-deps] testcafe: expected file missing (layout may have changed). " +
          `Update patchTestCafeBunCompat() in patch-deps.mjs. Missing: ${callsitePath}`,
      );
    } else {
      let src = readFileSync(callsitePath, "utf8");
      let changed = false;

      if (src.includes(oldStackFrame)) {
        src = src.replace(oldStackFrame, newStackFrame);
        changed = true;
      }

      if (src.includes(oldGetId)) {
        src = src.replace(oldGetId, newGetId);
        changed = true;
      }

      if (changed) {
        writeFileSync(callsitePath, src, "utf8");
        patched++;
        console.log(
          `[patch-deps] Applied testcafe callsite null-guard Bun fix: ${callsitePath}`,
        );
      } else {
        const callsiteAlreadyPatched =
          src.includes("if (!callsite || !callsite.stackFrames)") &&
          src.includes("if (!callsite) return '<unknown>:0'");
        if (!callsiteAlreadyPatched) {
          console.warn(
            "[patch-deps] testcafe: callsite.js present but patch patterns not found — " +
              "TestCafe may have refactored; Bun runs may fail until patch-deps.mjs is updated. " +
              `File: ${callsitePath}`,
          );
        }
      }
    }
  }

  if (patched > 0) {
    console.log(
      `[patch-deps] testcafe: applied ${patched} Bun compatibility patch(es).`,
    );
  }
}
patchTestCafeBunCompat();

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
