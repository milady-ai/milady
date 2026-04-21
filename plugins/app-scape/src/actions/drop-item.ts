/**
 * DROP_ITEM — remove an item from the agent's inventory and spawn it
 * on the ground at the agent's current tile.
 *
 * Expected LLM response format:
 *
 *   <action>DROP_ITEM</action>
 *   <slot>3</slot>
 *
 * `slot` is the inventory slot index (0..27). The LLM gets slot
 * numbers from the `SCAPE_INVENTORY` provider.
 *
 * Server-side: `BotSdkActionRouter.dropItem` →
 * `InventoryService.consumeItem` + `GroundItemManager.spawn`.
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

export const dropItem: Action = {
    name: "DROP_ITEM",
    description:
        "Drop an item from an inventory slot onto the ground at your feet. Useful when inventory is full or you don't need an item.",
    similes: ["DISCARD", "THROW_AWAY", "DUMP"],
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
            callback?.({ text: err, action: "DROP_ITEM" });
            return { success: false, message: err };
        }

        const text = getCurrentLlmResponse();
        const slot = extractParamInt(text, "slot");
        if (slot === null) {
            const err = "DROP_ITEM requires <slot>N</slot>.";
            callback?.({ text: err, action: "DROP_ITEM" });
            return { success: false, message: err };
        }

        const result = await service.executeAction({
            action: "dropItem",
            slot,
        });
        callback?.({
            text: result.message ?? (result.success ? "dropped" : "drop failed"),
            action: "DROP_ITEM",
        });
        return result;
    },
};
