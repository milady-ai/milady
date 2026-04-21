/**
 * SET_GOAL — the agent declares a new goal (or updates the current
 * active goal). Written directly to the Scape Journal; other actions
 * and providers can read it back next step.
 *
 * LLM response shape:
 *
 *   <action>SET_GOAL</action>
 *   <title>Reach 20 mining</title>
 *   <notes>Train on copper ore near Lumbridge until level 20.</notes>
 *
 * Operator-initiated goals flow through a different path (the HTTP
 * endpoint in PR 7); this action is strictly agent-self-managed.
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

export const setGoal: Action = {
    name: "SET_GOAL",
    description:
        "Declare a new goal you want to pursue. Write a short title and optional notes; the goal goes into the Scape Journal and drives future steps until it's completed or abandoned.",
    similes: ["DECLARE_GOAL", "NEW_GOAL", "PLAN"],
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
            callback?.({ text: err, action: "SET_GOAL" });
            return { success: false, message: err };
        }

        const text = getCurrentLlmResponse();
        const title = extractParam(text, "title");
        if (!title) {
            const err = "SET_GOAL requires <title>text</title>.";
            callback?.({ text: err, action: "SET_GOAL" });
            return { success: false, message: err };
        }
        const notes = extractParam(text, "notes") ?? undefined;

        const goal = journal.setGoal({
            title,
            notes,
            source: "agent",
        });
        const msg = `goal set: "${goal.title}"`;
        callback?.({ text: msg, action: "SET_GOAL" });
        return { success: true, message: msg };
    },
};
