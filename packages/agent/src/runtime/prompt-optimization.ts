/**
 * Prompt optimization layer for milady.
 *
 * Wraps `runtime.useModel()` to apply context-aware action compaction
 * and optional prompt tracing/capture. Controlled via MILADY_* env vars.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";

import {
	compactActionsForIntent,
	compactModelPrompt,
	validateIntentActionMap,
} from "./prompt-compaction";

export {
	buildFullParamActionSet,
	compactActionsForIntent,
	detectIntentCategories,
} from "./prompt-compaction";

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

// ---------------------------------------------------------------------------
// Runtime state (per-runtime, attached to the runtime instance)
// ---------------------------------------------------------------------------

interface RuntimeWithOptState extends AgentRuntime {
	__miladyPromptOptInstalled?: boolean;
}

// ---------------------------------------------------------------------------
// Public API — install the useModel wrapper on a runtime
// ---------------------------------------------------------------------------

export function installPromptOptimizations(runtime: AgentRuntime): void {
	const rt = runtime as RuntimeWithOptState;
	if (rt.__miladyPromptOptInstalled) return;
	rt.__miladyPromptOptInstalled = true;

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
		if (!isTextLarge || !payload || typeof payload !== "object") {
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

		// --- Context-aware action compaction (when enabled) ---
		// Strips <params> from actions not relevant to the user's intent.
		// All action names remain visible — only param detail is stripped.
		let workingPrompt =
			MILADY_ACTION_COMPACTION
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
