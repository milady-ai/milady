/**
 * WALK_TO — the only fully-wired action in PR 4. Moves the agent toward
 * a world tile. Routes through `ScapeGameService.executeAction("walkTo")`
 * which calls the xRSPS bot-SDK, which calls `PlayerManager.moveAgent`
 * — the same movement service human clients use.
 *
 * Expected LLM response format:
 *
 *   <action>WALK_TO</action>
 *   <x>3222</x>
 *   <z>3218</z>
 *   <run>true</run>
 *
 * The LLM can also omit x/z and supply a named destination (not yet
 * wired — PR 5 adds a "named destination" resolver that translates
 * "lumbridge bank" into coordinates via world-knowledge data).
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
import {
    extractParamBool,
    extractParamInt,
} from "./param-parser.js";

export const walkTo: Action = {
    name: "WALK_TO",
    description:
        "Walk the agent toward a specific world tile (x, z). Use this to move to banks, NPCs, resource nodes, or just to explore.",
    similes: ["MOVE_TO", "GO_TO", "TRAVEL_TO", "HEAD_TO"],
    examples: [],
    validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
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
        if (!service) {
            const message = "'scape game service not available.";
            callback?.({ text: message, action: "WALK_TO" });
            return { success: false, message };
        }

        const text = getCurrentLlmResponse();
        const x = extractParamInt(text, "x");
        const z = extractParamInt(text, "z");
        const run = extractParamBool(text, "run");

        if (x === null || z === null) {
            const message =
                "WALK_TO requires <x>N</x> and <z>N</z> params. Example: <x>3222</x><z>3218</z>";
            callback?.({ text: message, action: "WALK_TO" });
            return { success: false, message };
        }

        const result = await service.executeAction({
            action: "walkTo",
            x,
            z,
            run,
        });

        callback?.({
            text: result.message ?? (result.success ? "walking…" : "walk failed"),
            action: "WALK_TO",
        });
        return result;
    },
};
