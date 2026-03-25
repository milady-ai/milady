/**
 * Prompt optimization layer for milady.
 *
 * Wraps `runtime.useModel()` to compact prompts and optionally trace
 * prompt metrics.  All behaviour is controlled via MILADY_* env vars.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";

import {
  compactActionsForIntent,
  compactModelPrompt,
  validateIntentActionMap,
} from "./prompt-compaction";

// Re-export compaction functions for backwards compatibility
export { detectIntentCategories, buildFullParamActionSet, compactActionsForIntent } from "./prompt-compaction";

// ---------------------------------------------------------------------------
// Env-var driven configuration (evaluated once at import time)
// ---------------------------------------------------------------------------

const MILADY_PROMPT_OPT_MODE = (
  process.env.MILADY_PROMPT_OPT_MODE ?? "baseline"
).toLowerCase();

const MILADY_PROMPT_TRACE =
  process.env.MILADY_PROMPT_TRACE === "1" ||
  process.env.MILADY_PROMPT_TRACE?.toLowerCase() === "true";

/**
 * Dump raw prompts to .tmp/prompt-captures/ for analysis. Dev-only.
 * WARNING: captures contain full conversation content including user messages.
 */
const MILADY_CAPTURE_PROMPTS =
  process.env.MILADY_CAPTURE_PROMPTS === "1" ||
  process.env.MILADY_CAPTURE_PROMPTS?.toLowerCase() === "true";

let promptCaptureSeq = 0;

/** When false, context-aware action compaction is skipped entirely. Default: enabled. */
const MILADY_ACTION_COMPACTION = (() => {
  const raw = process.env.MILADY_ACTION_COMPACTION?.toLowerCase();
  if (raw === "0" || raw === "false") return false;
  return true;
})();

/**
 * Skip the LLM security evaluator. Default: disabled (full LLM eval runs).
 *
 * Set MILADY_SKIP_SECURITY_EVAL=1 for personal/DM deployments where the
 * user is trusted. This replaces 2-6 LLM security calls per message with
 * a keyword heuristic. Leave unset or =0 for public channel deployments
 * (Discord, Telegram) where untrusted users can inject prompts.
 */
const MILADY_SKIP_SECURITY_EVAL =
  process.env.MILADY_SKIP_SECURITY_EVAL === "1" ||
  process.env.MILADY_SKIP_SECURITY_EVAL?.toLowerCase() === "true";


/**
 * Run the social/relationship extraction LLM every N messages. Default: 3.
 *
 * Skipped messages return empty extraction results (no relationships, no
 * identities). This is safe because the relationship store accumulates over
 * time — missing one extraction doesn't corrupt existing data, and the next
 * extraction (every Nth message) catches up. Saves ~0.3 LLM calls/turn.
 */
const MILADY_SOCIAL_EVAL_EVERY_N = Math.max(
  1,
  Number(process.env.MILADY_SOCIAL_EVAL_EVERY_N ?? "3") || 3,
);

// ---------------------------------------------------------------------------
// Security eval helpers
// ---------------------------------------------------------------------------

function extractSecurityMessage(prompt: string): string {
  const match = prompt.match(/Message to analyze:\s*"([\s\S]*?)"\s*Context:/i);
  return match?.[1] ?? "";
}

/** Whether the security LLM evaluator should be skipped (env-var only). */
export function shouldSkipSecurityEval(): boolean {
  return MILADY_SKIP_SECURITY_EVAL;
}

export function isHighRiskMessage(text: string): boolean {
  return /\b(api[_ -]?key|secret|password|private[_ -]?key|token|oauth|sudo|ssh|wallet|seed phrase|mnemonic|bypass|jailbreak|prompt injection|exfiltrat\w*|credential|elevat\w*)\b/i.test(
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
      ? "Keyword heuristic flagged potentially sensitive content."
      : "Local heuristic classified message as low-risk.",
    indicators: highRisk ? ["keyword_match"] : [],
  });
}

// ---------------------------------------------------------------------------
// Social eval helpers
// ---------------------------------------------------------------------------

/**
 * Empty stub matching the schema expected by @elizaos/core's social
 * extraction consumer (see relationship-extraction evaluator). Empty
 * arrays are safe — the store accumulates over time, so skipped
 * extractions don't corrupt existing data.
 */
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

  // Warn when security eval is skipped via env var
  if (MILADY_SKIP_SECURITY_EVAL) {
    runtime.logger?.warn(
      "[milady] MILADY_SKIP_SECURITY_EVAL=1 — LLM security evaluation is disabled for ALL channels. " +
        "Only a keyword heuristic is active. Set =0 or remove the var for public channel deployments.",
    );
  }

  // Validate intent-action map against registered actions
  const actionNames = runtime.actions?.map((a) => a.name) ?? [];
  if (actionNames.length > 0) {
    validateIntentActionMap(actionNames, runtime.logger);
  }

  const originalUseModel = runtime.useModel.bind(runtime);

  runtime.useModel = (async (
    ...args: Parameters<typeof originalUseModel>
  ) => {
    const modelType = String(args[0] ?? "").toUpperCase();

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

    // --- Prompt capture (dev debugging) ---
    if (MILADY_CAPTURE_PROMPTS) {
      const captureDir = path.resolve(".tmp", "prompt-captures");
      const seq = String(++promptCaptureSeq).padStart(4, "0");
      const filename = `${seq}-${modelType}.txt`;
      await mkdir(captureDir, { recursive: true }).catch(() => {});
      await writeFile(
        path.join(captureDir, filename),
        `--- model: ${modelType} | key: ${promptKey} | chars: ${originalPrompt.length} ---\n\n${originalPrompt}`,
      ).catch(() => {});
    }

    // --- Security eval bypass (dynamic per source) ---
    // DM/web UI sessions skip the security LLM (user is admin).
    // Public channels (Discord, Telegram) run the full eval.
    // High-risk messages always get flagged by keyword heuristic.
    if (
      isTextLarge &&
      originalPrompt.startsWith("You are a security evaluation system.") &&
      shouldSkipSecurityEval()
    ) {
      const analyzedMessage = extractSecurityMessage(originalPrompt);
      const cacheKey = analyzedMessage.slice(0, 1000);
      const now = Date.now();
      const cacheTtlMs = 5 * 60_000;
      rt.__miladySecurityEvalCache ??= new Map();
      const cached = rt.__miladySecurityEvalCache.get(cacheKey);
      if (cached && now - cached.at < cacheTtlMs) {
        if (MILADY_PROMPT_TRACE) {
          runtime.logger?.info("[milady] Security heuristic cache hit");
        }
        return cached.value;
      }
      const heuristic = buildSecurityHeuristicResult(analyzedMessage);
      rt.__miladySecurityEvalCache.set(cacheKey, { at: now, value: heuristic });
      if (MILADY_PROMPT_TRACE) {
        runtime.logger?.info("[milady] Security eval skipped (DM session heuristic)");
      }
      return heuristic;
    }

    // --- Social eval throttling ---
    // Run relationship extraction every N messages instead of every message.
    if (
      isObjectSmall &&
      originalPrompt.startsWith(
        "You are analyzing a conversation to extract social and identity information.",
      )
    ) {
      const nextCount = (rt.__miladySocialEvalCounter ?? 0) + 1;
      rt.__miladySocialEvalCounter = nextCount;
      if (nextCount % MILADY_SOCIAL_EVAL_EVERY_N !== 0) {
        if (MILADY_PROMPT_TRACE) {
          runtime.logger?.info(
            `[milady] Social extraction skipped (cadence=${MILADY_SOCIAL_EVAL_EVERY_N})`,
          );
        }
        return buildEmptySocialExtractionResult();
      }
    }

    // --- Context-aware action compaction (when enabled) ---
    // Strips <params> from actions not relevant to the user's intent.
    // Safe to run always: all action names remain visible, only detail is stripped.
    let workingPrompt = isTextLarge && MILADY_ACTION_COMPACTION
      ? compactActionsForIntent(originalPrompt)
      : originalPrompt;

    // --- Full prompt compaction (compact mode only) ---
    if (MILADY_PROMPT_OPT_MODE !== "compact") {
      if (workingPrompt !== originalPrompt) {
        if (MILADY_PROMPT_TRACE) {
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
      MILADY_PROMPT_TRACE &&
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
