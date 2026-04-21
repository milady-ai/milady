/**
 * journal provider — recent memories in TOON form.
 *
 * The LLM sees the 8 newest memories prefixed with their kind and
 * weight, so it can weigh novelty ("I just levelled up!") against
 * routine observations. Earlier memories are dropped by the journal
 * store's prune policy, not by this provider.
 */

import { encode } from "@toon-format/toon";
import type {
    IAgentRuntime,
    Memory,
    Provider,
    State,
} from "@elizaos/core";

import type { ScapeGameService } from "../services/game-service.js";

const RECENT_MEMORY_COUNT = 8;

export const journalProvider: Provider = {
    name: "SCAPE_JOURNAL",
    description:
        "Recent Scape Journal memories — observations, combat events, level-ups, and decisions from the last few steps or sessions.",
    get: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State,
    ): Promise<string> => {
        const service = runtime.getService("scape_game") as unknown as ScapeGameService | null;
        if (!service) return "";
        const journal = service.getJournalService?.();
        if (!journal) return "";

        const memories = journal.getMemories(RECENT_MEMORY_COUNT);
        if (memories.length === 0) {
            return "# JOURNAL\n(no memories yet — this is your first step)";
        }

        const toon = encode({
            memories: memories.map((m) => ({
                kind: m.kind,
                text: m.text,
                weight: m.weight ?? 1,
            })),
        });
        return `# JOURNAL (recent ${memories.length})\n${toon}`;
    },
};
