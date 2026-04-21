/**
 * CHAT_PUBLIC — broadcast a short message in public chat. The LLM
 * can use this to narrate what it's doing, ask other players for
 * help, or respond to operator prompts.
 *
 * Expected LLM response format:
 *
 *   <action>CHAT_PUBLIC</action>
 *   <message>Heading to the bank to stash my logs.</message>
 *
 * Server-side: `BotSdkActionRouter.chatPublic` → `MessagingService.queueChatMessage`.
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

const MAX_MESSAGE_LENGTH = 80;

export const chatPublic: Action = {
    name: "CHAT_PUBLIC",
    description:
        "Say something in public chat so nearby players and agents can see it. Use to narrate, socialize, or respond to operator prompts.",
    similes: ["SAY", "SPEAK", "TALK", "BROADCAST"],
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
            callback?.({ text: message, action: "CHAT_PUBLIC" });
            return { success: false, message };
        }

        const llmText = getCurrentLlmResponse();
        const message = extractParam(llmText, "message") ?? extractParam(llmText, "text");
        if (!message) {
            const err = "CHAT_PUBLIC requires <message>text</message>.";
            callback?.({ text: err, action: "CHAT_PUBLIC" });
            return { success: false, message: err };
        }

        const trimmed = message.slice(0, MAX_MESSAGE_LENGTH);
        const result = await service.executeAction({
            action: "chatPublic",
            text: trimmed,
        });
        callback?.({
            text: result.message ?? (result.success ? `said "${trimmed}"` : "chat failed"),
            action: "CHAT_PUBLIC",
        });
        return result;
    },
};
