/**
 * User name provider — injects the user's display name into the system prompt
 * when chatting via the app (client_chat). Tells the agent the user's name if
 * known, or hints that it can ask.
 *
 * Only active for `source === "client_chat"` so it never leaks into Telegram,
 * Discord, or other connectors.
 */

import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";

const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

async function fetchOwnerName(): Promise<string | null> {
  try {
    const res = await fetch(`http://localhost:${API_PORT}/api/config`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const cfg = (await res.json()) as Record<string, unknown>;
    const ui = cfg.ui as Record<string, unknown> | undefined;
    const name =
      typeof ui?.ownerName === "string" ? ui.ownerName.trim() : null;
    return name || null;
  } catch {
    return null;
  }
}

export function createUserNameProvider(): Provider {
  return {
    name: "userName",
    description:
      "Injects the app user's display name into context (app chat only).",
    position: 10,
    dynamic: true,

    async get(
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      const content = message.content as Record<string, unknown> | undefined;
      if (content?.source !== "client_chat") {
        return { text: "" };
      }

      const name = await fetchOwnerName();

      if (name) {
        return {
          text: `The user's name is ${name}.`,
          values: { userName: name },
        };
      }

      return {
        text:
          "The user has not told you their name yet. " +
          "If it comes up naturally in conversation, you can ask what " +
          "they'd like to be called and use the SET_USER_NAME action to remember it.",
      };
    },
  };
}
