/**
 * Prompt optimization layer for milady.
 *
 * Wraps `runtime.useModel()` to compact prompts, gate expensive LLM
 * evaluator calls, and optionally trace prompt metrics.  All behaviour
 * is controlled via PARALLAX_* env vars (see .env.example).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";

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

const PARALLAX_DISABLE_SECURITY_LLM = (() => {
  const raw = process.env.PARALLAX_DISABLE_SECURITY_LLM?.toLowerCase();
  if (raw === "0" || raw === "false") return false;
  if (raw === "1" || raw === "true") return true;
  return true;
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

let promptCaptureSeq = 0;

// ---------------------------------------------------------------------------
// Prompt compaction helpers
// ---------------------------------------------------------------------------

function compactInitialCodeMarker(prompt: string): string {
  return prompt.replace(
    /initial code:\s*([0-9a-f]{8})[0-9a-f-]*/gi,
    "<initial_code>$1</initial_code>",
  );
}

// compactActionDocs removed — replaced by compactActionsForIntent which
// provides context-aware action formatting instead of blanket compaction.

function compactRegistryCatalog(prompt: string): string {
  return prompt.replace(
    /\*\*Available Plugins from Registry \((\d+) total\):[\s\S]*?(?=\n## Project Context \(Workspace\)|\n### AGENTS\.md|$)/g,
    (_match, total: string) =>
      `**Available Plugins from Registry (${total} total):** [omitted in compact mode; query on demand]\n`,
  );
}

function compactCodingActionExamples(prompt: string): string {
  const next = prompt.replace(
    /\n# Coding Agent Action Call Examples[\s\S]*?(?=\nPossible response actions:|\n# Available Actions|\n## Project Context \(Workspace\)|$)/g,
    "\n",
  );
  return next.replace(/\nPossible response actions:[^\n]*\n?/g, "\n");
}

function compactUiCatalog(prompt: string): string {
  return prompt.replace(
    /\n## Rich UI Output — you can render interactive components in your replies[\s\S]*?(?=\n## Project Context \(Workspace\)|\n### AGENTS\.md|$)/g,
    "\n",
  );
}

function compactLoadedPluginLists(prompt: string): string {
  const loadedCountMatch = prompt.match(
    /\*\*Loaded Plugins:\*\*[\s\S]*?(?=\n\*\*System Plugins:\*\*)/,
  );
  const loadedCount = loadedCountMatch
    ? (loadedCountMatch[0].match(/\n- /g)?.length ?? 0)
    : 0;

  return prompt.replace(
    /\n\*\*Loaded Plugins:\*\*[\s\S]*?(?=\n\*\*Available Plugins from Registry|\nNo access to role information|\nSECURITY ALERT:|$)/g,
    `\n**Loaded Plugins:** ${loadedCount} loaded [list omitted in compact mode]`,
  );
}

function compactEmoteCatalog(prompt: string): string {
  return prompt.replace(
    /\n## Available Emotes[\s\S]*?(?=\n# Active Workspaces & Agents|\n## Project Context \(Workspace\)|$)/g,
    "\n## Available Emotes\n[emote catalog omitted in compact mode]\n",
  );
}

function compactWorkspaceContextForNonCoding(prompt: string): string {
  return prompt.replace(
    /\n## Project Context \(Workspace\)[\s\S]*?(?=\nAdmin trust:|\nThe current date and time is|\n# Conversation Messages|$)/g,
    "\n## Project Context (Workspace)\n[workspace file contents omitted in compact mode for non-coding intent]\n",
  );
}

function compactUiComponentCatalog(prompt: string): string {
  return prompt.replace(
    /\n### Available components \((\d+) total\)[\s\S]*?(?=\n## Available Emotes|\n## Project Context \(Workspace\)|$)/g,
    (_match, total: string) =>
      `\n### Available components (${total} total)\n[component catalog omitted in compact mode]\n`,
  );
}

function compactInstalledSkills(prompt: string): string {
  return prompt.replace(
    /\n## Installed Skills \((\d+)\)[\s\S]*?\*Use TOGGLE_SKILL to enable\/disable skills\.[\s\S]*?(?=\nMima is|\n\*\*Loaded Plugins:\*\*|\n## Project Context \(Workspace\)|$)/g,
    (_match, total: string) =>
      `\n## Installed Skills (${total})\n[skill list omitted in compact mode; query on demand]\n`,
  );
}

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

const CODING_INTENT_RE =
  /\b(code|coding|repo|repository|pull request|pr\b|branch|test(s)?\b|compile|build|debug|fix|start_coding_task|spawn_coding_agent|send_to_coding_agent)\b|https?:\/\/(?:github\.com|gitlab\.com|bitbucket\.org)\//i;
const PLUGIN_UI_INTENT_RE =
  /\b(plugin|plugins|configure|configuration|setup|install|enable|disable|api key|credential|secret|dashboard|form|ui|interface|\[config:)\b/i;
const TERMINAL_INTENT_RE =
  /\b(shell|command|execute|run|npm|bun|git\b|bash|terminal|script|pip)\b/i;
const EMOTE_INTENT_RE =
  /\b(emote|wave|dance|bow|clap|laugh|angry|sad|think|sit|play_emote)\b/i;
const ISSUE_INTENT_RE =
  /\b(issue|bug|ticket|label|close|reopen|github issue|create issue)\b/i;

/** Actions that are always included at full detail. */
const UNIVERSAL_ACTIONS = new Set(["REPLY", "NONE", "IGNORE"]);

/** Map intent categories → action names that get full params when detected. */
const INTENT_ACTION_MAP: Record<string, Set<string>> = {
  coding: new Set([
    "START_CODING_TASK",
    "SPAWN_CODING_AGENT",
    "PROVISION_WORKSPACE",
    "FINALIZE_WORKSPACE",
    "LIST_CODING_AGENTS",
    "SEND_TO_CODING_AGENT",
  ]),
  terminal: new Set(["RUN_IN_TERMINAL", "RESTART_AGENT"]),
  issues: new Set(["MANAGE_ISSUES"]),
  emote: new Set(["PLAY_EMOTE"]),
};

function hasIntent(prompt: string, keywords: RegExp): boolean {
  const taskMatch = prompt.match(/<task>([\s\S]*?)<\/task>/i);
  const taskText = (taskMatch?.[1] ?? "").slice(0, 2000);
  if (keywords.test(taskText)) return true;

  // Extract just the user's message line(s) from "# Received Message".
  // The section also contains instructions with generic words like "execute",
  // "run", "command" — only match against the actual user text.
  const msgSection = prompt.indexOf("# Received Message");
  if (msgSection !== -1) {
    const afterHeader = prompt.slice(msgSection + "# Received Message".length);
    // User message is between the header and the next section marker (# or <)
    const nextSection = afterHeader.search(/\n#|\n<|\n\n\n/);
    const userMsg = (
      nextSection !== -1 ? afterHeader.slice(0, nextSection) : afterHeader.slice(0, 500)
    ).trim();
    if (keywords.test(userMsg)) return true;
  }

  // Fallback: scan last few user messages in the conversation
  const convSection = prompt.indexOf("# Conversation Messages");
  if (convSection !== -1) {
    const convBlock = prompt.slice(convSection, prompt.indexOf("# Received Message", convSection));
    // Match only lines that start with "User:" or "user:"
    const userLines = convBlock.match(/^(?:User|user):.*$/gm);
    if (userLines) {
      const recentUserText = userLines.slice(-3).join(" ");
      if (keywords.test(recentUserText)) return true;
    }
  }

  return false;
}

/**
 * Detect which intent categories are present in the prompt.
 * Returns array of category names (e.g. ["coding", "terminal"]).
 * Multiple categories can match simultaneously.
 */
export function detectIntentCategories(prompt: string): string[] {
  const categories: string[] = [];
  if (hasIntent(prompt, CODING_INTENT_RE)) categories.push("coding");
  if (hasIntent(prompt, TERMINAL_INTENT_RE)) categories.push("terminal");
  if (hasIntent(prompt, ISSUE_INTENT_RE)) categories.push("issues");
  if (hasIntent(prompt, EMOTE_INTENT_RE)) categories.push("emote");
  if (hasIntent(prompt, PLUGIN_UI_INTENT_RE)) categories.push("plugin_ui");
  return categories;
}

/**
 * Build the set of action names that should get full param detail.
 * Universal actions are always included. Intent-matched actions are
 * added based on detected categories. Everything else gets stub-only.
 */
export function buildFullParamActionSet(
  intentCategories: string[],
): Set<string> {
  const fullActions = new Set(UNIVERSAL_ACTIONS);
  for (const cat of intentCategories) {
    const actions = INTENT_ACTION_MAP[cat];
    if (actions) {
      for (const a of actions) fullActions.add(a);
    }
  }
  // Coding intent also implies terminal + issues
  if (intentCategories.includes("coding")) {
    for (const a of INTENT_ACTION_MAP.terminal) fullActions.add(a);
    for (const a of INTENT_ACTION_MAP.issues) fullActions.add(a);
  }
  return fullActions;
}

/**
 * Context-aware action formatting. Replaces the <actions>...</actions>
 * block in the prompt with a version where only intent-relevant actions
 * have full <params> — the rest are stubs with just name + description.
 *
 * If no intents are detected, keeps all params (safe fallback).
 */
export function compactActionsForIntent(prompt: string): string {
  // Find the first <actions>...</actions> block (the Available Actions section)
  const actionsStart = prompt.indexOf("<actions>");
  if (actionsStart === -1) return prompt;
  const actionsEnd = prompt.indexOf("</actions>", actionsStart);
  if (actionsEnd === -1) return prompt;

  const actionsBlock = prompt.slice(
    actionsStart + "<actions>".length,
    actionsEnd,
  );

  const intentCategories = detectIntentCategories(prompt);
  // When no specific intent is detected, it's general chat — only universal
  // actions (REPLY, NONE, IGNORE) need full detail. All other actions get
  // stubs so the LLM knows they exist but doesn't waste context on params.
  const fullParamActions = buildFullParamActionSet(intentCategories);

  // Parse individual <action>...</action> blocks
  const actionRegex = /<action>([\s\S]*?)<\/action>/g;
  const compactedActions: string[] = [];

  for (const match of actionsBlock.matchAll(actionRegex)) {
    const actionInner = match[1];
    const nameMatch = actionInner.match(/<name>([\s\S]*?)<\/name>/);
    if (!nameMatch) continue;

    const actionName = nameMatch[1].trim();

    if (fullParamActions.has(actionName)) {
      // Keep full action with params
      compactedActions.push(`  <action>${actionInner}</action>`);
    } else {
      // Stub: name + description only, strip <params>
      const descMatch = actionInner.match(
        /<description>([\s\S]*?)<\/description>/,
      );
      const desc = descMatch?.[1]?.trim() ?? "";
      compactedActions.push(
        `  <action>\n    <name>${actionName}</name>\n    <description>${desc}</description>\n  </action>`,
      );
    }
  }

  const compactedBlock = `<actions>\n${compactedActions.join("\n")}\n</actions>`;
  return `${prompt.slice(0, actionsStart)}${compactedBlock}${prompt.slice(actionsEnd + "</actions>".length)}`;
}

function compactModelPrompt(prompt: string): string {
  const hasCodingIntent = hasIntent(prompt, CODING_INTENT_RE);
  const hasPluginUiIntent = hasIntent(prompt, PLUGIN_UI_INTENT_RE);

  let next = prompt;
  next = compactInitialCodeMarker(next);
  if (!hasCodingIntent) {
    next = compactCodingActionExamples(next);
  }
  // Context-aware action compaction (replaces old compactActionDocs)
  next = compactActionsForIntent(next);
  next = compactLoadedPluginLists(next);
  next = compactEmoteCatalog(next);
  if (!hasCodingIntent) {
    next = compactInstalledSkills(next);
  }
  if (!hasPluginUiIntent) {
    next = compactRegistryCatalog(next);
    next = compactUiCatalog(next);
  } else {
    next = compactUiComponentCatalog(next);
  }
  if (!hasCodingIntent) {
    next = compactWorkspaceContextForNonCoding(next);
  }
  return next;
}

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

function buildSecuritySafeResult(message: string): string {
  return JSON.stringify({
    detected: false,
    confidence: 0.2,
    type: "none",
    severity: "low",
    reasoning:
      message.length > 0
        ? "Fast-path low-risk classification in compact mode."
        : "Fast-path low-risk classification in compact mode (no analyzable message).",
    indicators: [],
  });
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

function hasAdminContext(prompt: string): boolean {
  return /\b(admin trust: current speaker is world owner|current speaker is world owner|role:\s*admin|speaker.*\bowner\b|world owner)\b/i.test(
    prompt,
  );
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
        mkdirSync(captureDir, { recursive: true });
        const seq = String(++promptCaptureSeq).padStart(4, "0");
        const filename = `${seq}-${modelType}.txt`;
        writeFileSync(
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
      const adminContext = hasAdminContext(originalPrompt);
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
      const heuristic = adminContext
        ? buildSecuritySafeResult(analyzedMessage)
        : buildSecurityHeuristicResult(analyzedMessage);
      rt.__miladySecurityEvalCache.set(cacheKey, { at: now, value: heuristic });
      if (PARALLAX_PROMPT_TRACE) {
        runtime.logger?.info(
          adminContext
            ? "[milady] Security LLM disabled; admin context fast-pathed safe"
            : "[milady] Security LLM disabled; using local heuristic",
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
          const safe = buildSecuritySafeResult(analyzedMessage);
          rt.__miladySecurityEvalCache.set(cacheKey, { at: now, value: safe });
          if (PARALLAX_PROMPT_TRACE) {
            runtime.logger?.info(
              "[milady] Security eval skipped for low-risk prompt",
            );
          }
          return safe;
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

    // --- Context-aware action compaction (always active) ---
    // Strips <params> from actions not relevant to the user's intent.
    // Safe to run always: all action names remain visible, only detail is stripped.
    let workingPrompt = isTextLarge
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
