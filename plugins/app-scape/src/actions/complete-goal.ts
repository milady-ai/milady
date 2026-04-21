/**
 * COMPLETE_GOAL — mark a goal as completed or abandoned. The LLM
 * chooses this when it's satisfied the goal is done, or when it
 * decides the goal was a bad idea.
 *
 * LLM response shape:
 *
 *   <action>COMPLETE_GOAL</action>
 *   <status>completed</status>  (or "abandoned")
 *   <notes>Hit level 20 at the cow field near Falador.</notes>
 *
 * `id` is optional — if omitted, the active goal is used.
 */

import type {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";

import { getCurrentLlmResponse } from "../shared-state.js";
import type { ScapeGameService } from "../services/game-service.js";
import { extractParam } from "./param-parser.js";

export const completeGoal: Action = {
    name: "COMPLETE_GOAL",
    description:
        "Mark the active goal (or a specific goal id) as completed or abandoned. Use <status>completed|abandoned</status> and optional <notes>why</notes>.",
    similes: ["FINISH_GOAL", "ABANDON_GOAL", "CLOSE_GOAL"],
    examples: [],
    validate: async (runtime: IAgentRuntime): Promise<boolean> => {
        return runtime.getService("scape_game") != null;
    },
    handler: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state: State | undefined,
        _options: Record<string, unknown>,
        callback?: HandlerCallback,
    ): Promise<unknown> => {
        const service = runtime.getService("scape_game") as unknown as ScapeGameService | null;
        const journal = service?.getJournalService?.();
        if (!journal) {
            const err = "Scape journal not available.";
            callback?.({ text: err, action: "COMPLETE_GOAL" });
            return { success: false, message: err };
        }

        const text = getCurrentLlmResponse();
        const explicitId = extractParam(text, "id");
        const statusRaw = (extractParam(text, "status") ?? "completed").toLowerCase();
        if (statusRaw !== "completed" && statusRaw !== "abandoned") {
            const err = "status must be 'completed' or 'abandoned'.";
            callback?.({ text: err, action: "COMPLETE_GOAL" });
            return { success: false, message: err };
        }
        const notes = extractParam(text, "notes") ?? undefined;

        const goalId = explicitId ?? journal.getActiveGoal()?.id;
        if (!goalId) {
            const err = "no goal to close.";
            callback?.({ text: err, action: "COMPLETE_GOAL" });
            return { success: false, message: err };
        }

        const updated = journal.markGoalStatus(
            goalId,
            statusRaw as "completed" | "abandoned",
            notes,
        );
        if (!updated) {
            const err = `goal id=${goalId} not found.`;
            callback?.({ text: err, action: "COMPLETE_GOAL" });
            return { success: false, message: err };
        }

        const msg = `goal "${updated.title}" → ${statusRaw}`;
        callback?.({ text: msg, action: "COMPLETE_GOAL" });
        return { success: true, message: msg };
    },
};
