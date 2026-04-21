/**
 * ATTACK_NPC — engage a nearby NPC in combat by its instance id.
 *
 * Expected LLM response format:
 *
 *   <action>ATTACK_NPC</action>
 *   <npcId>42</npcId>
 *
 * The LLM gets NPC instance ids from the `SCAPE_NEARBY` provider,
 * which lists them in the `npcs[].id` column each step.
 *
 * Server-side: `BotSdkActionRouter.attackNpc` →
 * `PlayerManager.attackNpcAsAgent` →
 * `NpcCombatInteractionHandler.startNpcAttack`. The server walks the
 * agent into attack range on its own; the LLM does not need to
 * walkTo the NPC first.
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

export const attackNpc: Action = {
    name: "ATTACK_NPC",
    description:
        "Engage a nearby NPC in combat by its instance id. The server pathfinds the agent into attack range automatically.",
    similes: ["FIGHT_NPC", "KILL_NPC", "ENGAGE"],
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
            callback?.({ text: err, action: "ATTACK_NPC" });
            return { success: false, message: err };
        }

        const text = getCurrentLlmResponse();
        const npcId = extractParamInt(text, "npcId") ?? extractParamInt(text, "id");
        if (npcId === null) {
            const err = "ATTACK_NPC requires <npcId>N</npcId>.";
            callback?.({ text: err, action: "ATTACK_NPC" });
            return { success: false, message: err };
        }

        const result = await service.executeAction({
            action: "attackNpc",
            npcId,
        });
        callback?.({
            text: result.message ?? (result.success ? "engaging" : "attack failed"),
            action: "ATTACK_NPC",
        });
        return result;
    },
};
