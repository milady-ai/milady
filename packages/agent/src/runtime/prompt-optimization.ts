/**
 * Prompt optimization layer for milady.
 *
 * Wraps `runtime.useModel()` to compact prompts, gate expensive LLM
 * evaluator calls, and optionally trace prompt metrics.  All behaviour
 * is controlled via PARALLAX_* env vars (see .env.example).
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";

import { compactActionsForIntent, compactModelPrompt } from "./prompt-compaction";

// Re-export compaction functions for backwards compatibility
export { detectIntentCategories, buildFullParamActionSet, compactActionsForIntent } from "./prompt-compaction";

// ---------------------------------------------------------------------------
// Env-var driven configuration (evaluated once at import time)
// ---------------------------------------------------------------------------

const PARALLAX_PROMPT_OPT_MODE = (
  process.env.PARALLAX_PROMPT_OPT_MODE ?? "baseline"
).toLowerCase();

const PARALLAX_PROMPT_TRACE =
  process.env.PARALLAX_PROMPT_TRACE === "1" ||
  process.env.PARALLAX_PROMPT_TRACE?.toLowerCase() === "true";

const PARALLAX_EMBEDDING_FASTPATH =
  process.env.PARALLAX_EMBEDDING_FASTPATH === "1" ||
  process.env.PARALLAX_EMBEDDING_FASTPATH?.toLowerCase() === "true";

/**
 * When true, the security evaluation LLM call is completely bypassed and
 * replaced with a local keyword heuristic.  Defaults to false (security
 * LLM enabled).  Set PARALLAX_DISABLE_SECURITY_LLM=1 to explicitly
 * opt-in to disabling the security LLM.
 *
 * Interaction with PARALLAX_SECURITY_GATING: when the security LLM is
 * disabled (this flag = true), gating is irrelevant because no LLM call
 * is ever made.  When the security LLM is enabled (this flag = false),
 * PARALLAX_SECURITY_GATING controls whether low-risk messages skip the
 * LLM call (only high-risk messages are sent to the LLM).
 */
const PARALLAX_DISABLE_SECURITY_LLM = (() => {
  const raw = process.env.PARALLAX_DISABLE_SECURITY_LLM?.toLowerCase();
  if (raw === "0" || raw === "false") return false;
  if (raw === "1" || raw === "true") return true;
  return false;
})();

const PARALLAX_SECURITY_GATING = (() => {
  const raw = process.env.PARALLAX_SECURITY_GATING?.toLowerCase();
  if (raw === "0" || raw === "false") return false;
  if (raw === "1" || raw === "true") return true;
  return PARALLAX_PROMPT_OPT_MODE === "compact";
})();

const PARALLAX_SOCIAL_EVAL_EVERY_N = Math.max(
  1,
  Number(process.env.PARALLAX_SOCIAL_EVAL_EVERY_N ?? "3") || 3,
);

const PARALLAX_CAPTURE_PROMPTS =
  process.env.PARALLAX_CAPTURE_PROMPTS === "1" ||
  process.env.PARALLAX_CAPTURE_PROMPTS?.toLowerCase() === "true";

/** When false, context-aware action compaction is skipped entirely. Default: enabled. */
const PARALLAX_ACTION_COMPACTION = (() => {
  const raw = process.env.PARALLAX_ACTION_COMPACTION?.toLowerCase();
  if (raw === "0" || raw === "false") return false;
  return true;
})();

let promptCaptureSeq = 0;

// ---------------------------------------------------------------------------
// Security eval helpers
// ---------------------------------------------------------------------------

function extractSecurityMessage(prompt: string): string {
  const match = prompt.match(/Message to analyze:\s*"([\s\S]*?)"\s*Context:/i);
  if (!match?.[1]) return "";
  return match[1];
}

function isHighRiskMessage(text: string): boolean {
  return /\b(api[_ -]?key|secret|password|private[_ -]?key|token|oauth|sudo|ssh|wallet|seed phrase|mnemonic|bypass|jailbreak|prompt injection|exfiltrat|credential|admin|elevat)\b/i.test(
    text,
  );
}

function buildSecurityHeuristicResult(message: string): string {
  const highRisk = isHighRiskMessage(message);
  return JSON.stringify({
    detected: highRisk,
    confidence: highRisk ? 0.85 : 0.2,
    type: highRisk ? "suspicious_request" : "none",
    severity: highRisk ? "medium" : "low",
    reasoning: highRisk
      ? "Keyword heuristic flagged potentially sensitive or privilege-seeking content."
      : "Local heuristic classified message as low-risk.",
    indicators: highRisk ? ["keyword_match"] : [],
  });
}

// ---------------------------------------------------------------------------
// Social eval helpers
// ---------------------------------------------------------------------------

function buildEmptySocialExtractionResult(): Record<string, unknown> {
  return {
    platformIdentities: [],
    relationships: [],
    mentionedPeople: [],
    disputes: [],
    privacyBoundaries: [],
    trustSignals: [],
  };
}

// ---------------------------------------------------------------------------
// Embedding fast-path
// ---------------------------------------------------------------------------

let cachedFastEmbedding: number[] | null = null;
function getFastEmbeddingVector(): number[] {
  if (cachedFastEmbedding) return cachedFastEmbedding;
  const parsedDims = Number(process.env.LOCAL_EMBEDDING_DIMENSIONS ?? "768");
  const dims =
    Number.isInteger(parsedDims) && parsedDims > 0 && parsedDims <= 4096
      ? parsedDims
      : 768;
  cachedFastEmbedding = new Array(dims).fill(0);
  return cachedFastEmbedding;
}

// ---------------------------------------------------------------------------
// Runtime state (per-runtime, attached to the runtime instance)
// ---------------------------------------------------------------------------

interface RuntimeWithOptState extends AgentRuntime {
  __miladySecurityEvalCache?: Map<string, { at: number; value: string }>;
  __miladySocialEvalCounter?: number;
  __miladyPromptOptInstalled?: boolean;
}

// ---------------------------------------------------------------------------
// Public API — install the useModel wrapper on a runtime
// ---------------------------------------------------------------------------

export function installPromptOptimizations(runtime: AgentRuntime): void {
  const rt = runtime as RuntimeWithOptState;
  if (rt.__miladyPromptOptInstalled) return;
  rt.__miladyPromptOptInstalled = true;

  const originalUseModel = runtime.useModel.bind(runtime);

  runtime.useModel = (async (
    ...args: Parameters<typeof originalUseModel>
  ) => {
    const modelType = String(args[0] ?? "").toUpperCase();

    // Embedding fast-path: return zero-vectors instead of calling model
    if (PARALLAX_EMBEDDING_FASTPATH && modelType.includes("TEXT_EMBEDDING")) {
      if (PARALLAX_PROMPT_TRACE) {
        runtime.logger?.info(
          `[milady] Embedding fast-path active (dims=${getFastEmbeddingVector().length})`,
        );
      }
      return getFastEmbeddingVector();
    }

    const payload = args[1];
    const isTextLarge = modelType.includes("TEXT_LARGE");
    const isObjectSmall = modelType.includes("OBJECT_SMALL");
    if (
      (!isTextLarge && !isObjectSmall) ||
      !payload ||
      typeof payload !== "object"
    ) {
      return originalUseModel(...args);
    }

    const promptRecord = payload as Record<string, unknown>;
    const promptKey =
      typeof promptRecord.prompt === "string"
        ? "prompt"
        : typeof promptRecord.userPrompt === "string"
          ? "userPrompt"
          : typeof promptRecord.input === "string"
            ? "input"
            : null;
    if (!promptKey) {
      return originalUseModel(...args);
    }

    const originalPrompt = String(promptRecord[promptKey] ?? "");

    // Dump raw prompts to .tmp/prompt-captures/ for analysis
    if (PARALLAX_CAPTURE_PROMPTS) {
      try {
        const captureDir = path.resolve(".tmp", "prompt-captures");
        await mkdir(captureDir, { recursive: true });
        const seq = String(++promptCaptureSeq).padStart(4, "0");
        const filename = `${seq}-${modelType}.txt`;
        await writeFile(
          path.join(captureDir, filename),
          `--- model: ${modelType} | key: ${promptKey} | chars: ${originalPrompt.length} ---\n\n${originalPrompt}`,
        );
      } catch {
        // Best effort — don't break the runtime for a debug capture
      }
    }

    // --- Security LLM bypass ---
    if (
      PARALLAX_DISABLE_SECURITY_LLM &&
      isTextLarge &&
      originalPrompt.startsWith("You are a security evaluation system.")
    ) {
      const analyzedMessage = extractSecurityMessage(originalPrompt);
      const cacheKey = analyzedMessage.slice(0, 1000);
      const now = Date.now();
      const cacheTtlMs = 5 * 60_000;
      rt.__miladySecurityEvalCache ??= new Map();
      const cached = rt.__miladySecurityEvalCache.get(cacheKey);
      if (cached && now - cached.at < cacheTtlMs) {
        if (PARALLAX_PROMPT_TRACE) {
          runtime.logger?.info("[milady] Security heuristic cache hit");
        }
        return cached.value;
      }
      const heuristic = buildSecurityHeuristicResult(analyzedMessage);
      rt.__miladySecurityEvalCache.set(cacheKey, { at: now, value: heuristic });
      if (PARALLAX_PROMPT_TRACE) {
        runtime.logger?.info(
          "[milady] Security LLM disabled; using local heuristic",
        );
      }
      return heuristic;
    }

    // --- Security gating (only send high-risk to LLM) ---
    if (PARALLAX_SECURITY_GATING) {
      if (
        isTextLarge &&
        originalPrompt.startsWith("You are a security evaluation system.")
      ) {
        const analyzedMessage = extractSecurityMessage(originalPrompt);
        const isHighRisk = isHighRiskMessage(analyzedMessage);
        const cacheKey = analyzedMessage.slice(0, 1000);
        const now = Date.now();
        const cacheTtlMs = 5 * 60_000;
        rt.__miladySecurityEvalCache ??= new Map();
        const cached = rt.__miladySecurityEvalCache.get(cacheKey);
        if (cached && now - cached.at < cacheTtlMs) {
          if (PARALLAX_PROMPT_TRACE) {
            runtime.logger?.info(
              "[milady] Security eval cache hit (fast path)",
            );
          }
          return cached.value;
        }
        if (!isHighRisk) {
          const heuristic = buildSecurityHeuristicResult(analyzedMessage);
          rt.__miladySecurityEvalCache.set(cacheKey, { at: now, value: heuristic });
          if (PARALLAX_PROMPT_TRACE) {
            runtime.logger?.info(
              "[milady] Security eval skipped for low-risk prompt",
            );
          }
          return heuristic;
        }
      }

      // --- Social eval throttling ---
      if (
        isObjectSmall &&
        originalPrompt.startsWith(
          "You are analyzing a conversation to extract social and identity information.",
        )
      ) {
        const analyzedMessage = originalPrompt.slice(0, 2000);
        const isHighRisk = isHighRiskMessage(analyzedMessage);
        const nextCount = (rt.__miladySocialEvalCounter ?? 0) + 1;
        rt.__miladySocialEvalCounter = nextCount;
        const shouldRun =
          isHighRisk || nextCount % PARALLAX_SOCIAL_EVAL_EVERY_N === 0;
        if (!shouldRun) {
          if (PARALLAX_PROMPT_TRACE) {
            runtime.logger?.info(
              `[milady] Social extraction skipped (cadence=${PARALLAX_SOCIAL_EVAL_EVERY_N})`,
            );
          }
          return buildEmptySocialExtractionResult();
        }
      }
    }

    // --- Context-aware action compaction (when enabled) ---
    // Strips <params> from actions not relevant to the user's intent.
    // Safe to run always: all action names remain visible, only detail is stripped.
    let workingPrompt = isTextLarge && PARALLAX_ACTION_COMPACTION
      ? compactActionsForIntent(originalPrompt)
      : originalPrompt;

    // --- Full prompt compaction (compact mode only) ---
    if (PARALLAX_PROMPT_OPT_MODE !== "compact") {
      if (workingPrompt !== originalPrompt) {
        if (PARALLAX_PROMPT_TRACE) {
          runtime.logger?.info(
            `[milady] Action compaction: ${originalPrompt.length} -> ${workingPrompt.length} chars (saved ${originalPrompt.length - workingPrompt.length})`,
          );
        }
        const rewrittenPayload = {
          ...(payload as Record<string, unknown>),
          [promptKey]: workingPrompt,
        };
        const rewrittenArgs = [
          args[0],
          rewrittenPayload as Parameters<typeof originalUseModel>[1],
          ...args.slice(2),
        ] as Parameters<typeof originalUseModel>;
        return originalUseModel(...rewrittenArgs);
      }
      return originalUseModel(...args);
    }

    const compactedPrompt = compactModelPrompt(workingPrompt);
    if (
      PARALLAX_PROMPT_TRACE &&
      compactedPrompt.length !== originalPrompt.length
    ) {
      runtime.logger?.info(
        `[milady] Compact prompt rewrite: ${originalPrompt.length} -> ${compactedPrompt.length} chars`,
      );
    }
    if (compactedPrompt === originalPrompt) {
      return originalUseModel(...args);
    }

    const rewrittenPayload = {
      ...(payload as Record<string, unknown>),
      [promptKey]: compactedPrompt,
    };
    const rewrittenArgs = [
      args[0],
      rewrittenPayload as Parameters<typeof originalUseModel>[1],
      ...args.slice(2),
    ] as Parameters<typeof originalUseModel>;
    return originalUseModel(...rewrittenArgs);
  }) as typeof runtime.useModel;
}
