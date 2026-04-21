/**
 * EAT_FOOD — consume a food item in inventory to restore hitpoints.
 *
 * Expected LLM response format:
 *
 *   <action>EAT_FOOD</action>
 *   <slot>0</slot>
 *
 * `slot` is optional; if omitted, the server picks the first item in
 * the agent's inventory. The LLM should usually specify a slot based
 * on the `SCAPE_INVENTORY` provider.
 *
 * Server-side: `BotSdkActionRouter.eatFood` →
 * `InventoryActionHandler.executeInventoryConsumeAction`. Food
 * healing is applied by the item's associated effect script.
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
import { extractParamInt } from "./param-parser.js";

export const eatFood: Action = {
    name: "EAT_FOOD",
    description:
        "Eat a food item from an inventory slot to restore hitpoints. Prioritize this when HP is low.",
    similes: ["CONSUME_FOOD", "HEAL", "EAT"],
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
            const err = "'scape game service not available.";
            callback?.({ text: err, action: "EAT_FOOD" });
            return { success: false, message: err };
        }

        const text = getCurrentLlmResponse();
        const slot = extractParamInt(text, "slot");
        const result = await service.executeAction({
            action: "eatFood",
            slot: slot ?? undefined,
        });
        callback?.({
            text: result.message ?? (result.success ? "ate" : "eat failed"),
            action: "EAT_FOOD",
        });
        return result;
    },
};
