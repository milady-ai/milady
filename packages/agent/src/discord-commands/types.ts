/**
 * Local type definitions for Discord slash commands.
 *
 * These mirror the types from @elizaos/plugin-discord but are defined
 * locally to avoid a hard import dependency on the Discord plugin
 * (which may not be installed).
 */

import type { IAgentRuntime } from "@elizaos/core";
import type { Interaction } from "discord.js";

export interface DiscordSlashCommandOption {
  name: string;
  type: number;
  description: string;
  required?: boolean;
  options?: DiscordSlashCommandOption[];
  channel_types?: number[];
}

/**
 * Escape user-supplied strings for safe interpolation into XML.
 * Prevents tag injection (SEC-3).
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface DiscordSlashCommand {
  name: string;
  description: string;
  options?: DiscordSlashCommandOption[];
  guildOnly?: boolean;
  bypassChannelWhitelist?: boolean;
  requiredPermissions?: bigint | string | null;
  contexts?: number[];
  guildIds?: string[];
  validator?: (
    interaction: Interaction,
    runtime: IAgentRuntime,
  ) => Promise<boolean>;
}
