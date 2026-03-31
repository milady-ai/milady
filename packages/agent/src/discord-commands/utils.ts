/**
 * Shared utilities for Discord slash command handlers.
 */

import {
  createUniqueUuid,
  stringToUuid,
  type IAgentRuntime,
  type Memory,
  type UUID,
} from "@elizaos/core";
import type { ChatInputCommandInteraction } from "discord.js";

/**
 * Build a properly typed Memory object for invoking action handlers from
 * Discord slash command interactions.
 *
 * Centralises the 11× `as unknown as Memory` casts that were scattered
 * throughout individual command files (SEC-5 / reviewer 1g).
 */
export function makeCommandMemory(
  runtime: IAgentRuntime,
  interaction: ChatInputCommandInteraction,
  opts: {
    idSuffix: string;
    text: string;
    params?: string;
    actions?: string[];
  },
): Memory {
  const entityId = createUniqueUuid(runtime, interaction.user.id) as UUID;
  const roomId = createUniqueUuid(runtime, interaction.channelId) as UUID;

  return {
    id: stringToUuid(`slash-${opts.idSuffix}-${Date.now()}`) as UUID,
    entityId,
    agentId: runtime.agentId,
    roomId,
    content: {
      text: opts.text,
      source: "discord",
      ...(opts.params !== undefined ? { params: opts.params } : {}),
      ...(opts.actions !== undefined ? { actions: opts.actions } : {}),
    },
  } as unknown as Memory;
}
