/**
 * @elizaos/core DefaultMessageService.processMessage awaits runtime.evaluate()
 * after the assistant reply is saved. Evaluators may call TEXT_LARGE again; when
 * Eliza Cloud returns 401, streaming can stall and evaluate never settles, so
 * handleMessage never returns → conversation SSE never emits `done` → Milady
 * stays in "replying" forever.
 *
 * For `client_chat` (dashboard / desktop REST chat), run evaluate in the
 * background so the message handler returns and the API can close the SSE
 * stream. Late evaluator callbacks hit writeSse guards once the response ended.
 *
 * Remove when upstream makes evaluate non-blocking for streaming API or fails
 * fast on auth errors.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const EVAL_PATCH_MARKER =
  "[milady-patch] defer evaluate for client_chat";

const SEARCH_BLOCK = `    await runtime2.evaluate(message2, state2, shouldRespondToMessage, async (content) => {
      runtime2.logger.debug({ src: "service:message", content }, "Evaluate callback");
      if (responseContent) {
        responseContent.evalCallbacks = content;
      }
      if (callback) {
        if (content.text) {
          content.text = runtime2.redactSecrets(content.text);
        }
        return callback(content);
      }
      return [];
    }, responseMessages);`;

const REPLACE_BLOCK = `    const miladyRunEvaluate = () => runtime2.evaluate(message2, state2, shouldRespondToMessage, async (content) => {
      runtime2.logger.debug({ src: "service:message", content }, "Evaluate callback");
      if (responseContent) {
        responseContent.evalCallbacks = content;
      }
      if (callback) {
        if (content.text) {
          content.text = runtime2.redactSecrets(content.text);
        }
        return callback(content);
      }
      return [];
    }, responseMessages);
    // ${EVAL_PATCH_MARKER}
    if (message2.content?.source === "client_chat") {
      void miladyRunEvaluate().catch((err) => {
        runtime2.logger.warn({
          err,
          src: "service:message"
        }, "[milady-patch] Deferred evaluate failed");
      });
    } else {
      await miladyRunEvaluate();
    }`;

/**
 * @param {string} src
 * @returns {{ src: string; changed: boolean }}
 */
export function applyClientChatEvaluateDeferPatch(src) {
  if (src.includes(EVAL_PATCH_MARKER)) {
    return { src, changed: false };
  }
  if (!src.includes(SEARCH_BLOCK)) {
    return { src, changed: false };
  }
  return {
    src: src.replace(SEARCH_BLOCK, REPLACE_BLOCK),
    changed: true,
  };
}

/**
 * @param {string} repoRoot
 */
export function patchElizaCoreClientChatEvaluate(repoRoot) {
  const searchDirs = [resolve(repoRoot, "node_modules/@elizaos/core")];
  const bunCache = resolve(repoRoot, "node_modules/.bun");
  if (existsSync(bunCache)) {
    try {
      for (const entry of readdirSync(bunCache)) {
        if (entry.startsWith("@elizaos+core@")) {
          searchDirs.push(
            resolve(bunCache, entry, "node_modules/@elizaos/core"),
          );
        }
      }
    } catch {
      /* ignore */
    }
  }

  let patched = 0;
  for (const dir of searchDirs) {
    const target = resolve(dir, "dist/node/index.node.js");
    if (!existsSync(target)) continue;
    const before = readFileSync(target, "utf8");
    const { src: after, changed } = applyClientChatEvaluateDeferPatch(before);
    if (!changed) continue;
    writeFileSync(target, after, "utf8");
    patched++;
    console.log(
      `[patch-deps] Applied @elizaos/core client_chat deferred evaluate: ${target}`,
    );
  }

  if (patched === 0) {
    const primary = resolve(
      repoRoot,
      "node_modules/@elizaos/core/dist/node/index.node.js",
    );
    if (
      existsSync(primary) &&
      readFileSync(primary, "utf8").includes(EVAL_PATCH_MARKER)
    ) {
      console.log(
        "[patch-deps] @elizaos/core client_chat evaluate patch already applied.",
      );
    } else {
      console.log(
        "[patch-deps] @elizaos/core client_chat evaluate: pattern not found, skipping.",
      );
    }
  }
}
