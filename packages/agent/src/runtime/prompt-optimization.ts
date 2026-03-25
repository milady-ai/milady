/**
 * Prompt optimization layer for milady.
 *
 * Wraps `runtime.useModel()` to compact prompts and optionally trace
 * prompt metrics.  All behaviour is controlled via MILADY_* env vars.
 */

import type { AgentRuntime } from "@elizaos/core";

import { compactActionsForIntent, compactModelPrompt } from "./prompt-compaction";

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

/** When false, context-aware action compaction is skipped entirely. Default: enabled. */
const MILADY_ACTION_COMPACTION = (() => {
  const raw = process.env.MILADY_ACTION_COMPACTION?.toLowerCase();
  if (raw === "0" || raw === "false") return false;
  return true;
})();

/**
 * Skip the security evaluation LLM. Default: disabled (security LLM runs).
 *
 * Enable with MILADY_SKIP_SECURITY_EVAL=1 for personal/DM sessions where the
 * user is the admin and security eval always returns "safe" but burns 2-6 LLM
 * calls per message. Replaces those calls with a keyword heuristic that flags
 * obvious sensitive terms (api key, password, seed phrase, etc.).
 *
 * Leave disabled (default) for public channel deployments (Discord, Telegram)
 * where untrusted users can inject prompts.
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

    // --- Security eval bypass (DM/admin sessions) ---
    // Replaces the 2-6 LLM security calls per message with a keyword
    // heuristic. High-risk messages (containing sensitive terms) still
    // get flagged. Saves ~2 LLM calls per chat turn.
    if (
      MILADY_SKIP_SECURITY_EVAL &&
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
