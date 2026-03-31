/**
 * Local type definitions for Discord slash commands.
 *
 * These mirror the types from @elizaos/plugin-discord but are defined
 * locally to avoid a hard import dependency on the Discord plugin
 * (which may not be installed).
 */

import type { IAgentRuntime } from "@elizaos/core";
import type { Interaction } from "discord.js";

/**
 * Local numeric enum mirroring discord.js ApplicationCommandOptionType.
 * Using raw numbers avoids a hard static import of discord.js at the module
 * level, so command files work even when discord.js is not installed.
 */
export const enum ApplicationCommandOptionType {
  Subcommand = 1,
  SubcommandGroup = 2,
  String = 3,
  Integer = 4,
  Boolean = 5,
  User = 6,
  Channel = 7,
  Role = 8,
  Mentionable = 9,
  Number = 10,
  Attachment = 11,
}

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
