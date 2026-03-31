/**
 * Discord Commands Integration
 *
 * Registers slash commands with the Discord plugin when it connects to a server.
 * Listens for DISCORD_SERVER_CONNECTED to emit DISCORD_REGISTER_COMMANDS,
 * and handles DISCORD_SLASH_COMMAND for command dispatch.
 *
 * This module gracefully degrades — if Discord is not configured or the
 * plugin is not loaded, it simply does nothing.
 */

import { logger, type EventPayload, type IAgentRuntime } from "@elizaos/core";
import type { ChatInputCommandInteraction, Interaction } from "discord.js";

/** Params emitted with DISCORD_SLASH_COMMAND events. */
interface DiscordSlashCommandParams extends EventPayload {
  interaction?: ChatInputCommandInteraction & {
    isCommand?: () => boolean;
    replied?: boolean;
    deferred?: boolean;
  };
}

import { codeCommand, handleCodeCommand } from "./code";
import { agentsCommand, handleAgentsCommand } from "./agents";
import { statusCommand, handleStatusCommand } from "./status";
import { shellCommand, handleShellCommand } from "./shell";
import { cronCommand, handleCronCommand } from "./cron";
import type { DiscordSlashCommand } from "./types";

const LOG_PREFIX = "[discord-commands]";

/** All slash commands to register. */
const COMMANDS: DiscordSlashCommand[] = [codeCommand, agentsCommand, statusCommand, shellCommand, cronCommand];

/** Map command names to their handlers. */
const HANDLERS: Record<
  string,
  (interaction: ChatInputCommandInteraction, runtime: IAgentRuntime) => Promise<void>
> = {
  code: handleCodeCommand,
  agents: handleAgentsCommand,
  status: handleStatusCommand,
  shell: handleShellCommand,
  cron: handleCronCommand,
};

/** Map command names to their validators for auth checks (SEC-1). */
const VALIDATORS: Record<
  string,
  (interaction: Interaction, runtime: IAgentRuntime) => Promise<boolean>
> = Object.fromEntries(
  COMMANDS.filter((c) => c.validator).map((c) => [c.name, c.validator!]),
);

/**
 * Set up Discord slash command integration on a runtime.
 *
 * Call this after the runtime is initialized. It registers event listeners
 * that fire when the Discord plugin connects to a server and when slash
 * commands are received.
 *
 * Safe to call even when Discord is not configured — the events simply
 * never fire.
 */
export function setupDiscordCommands(runtime: IAgentRuntime): void {
  let commandsRegistered = false;

  // When Discord connects to a guild, register our slash commands.
  runtime.registerEvent("DISCORD_SERVER_CONNECTED", async (_params: EventPayload) => {
    if (commandsRegistered) return;

    logger.info(`${LOG_PREFIX} Discord server connected — registering ${COMMANDS.length} slash commands`);

    // Emit DISCORD_REGISTER_COMMANDS to tell the Discord plugin to register
    // our commands with Discord's API.
    await runtime.emitEvent("DISCORD_REGISTER_COMMANDS", {
      runtime,
      source: "discord-commands",
      commands: COMMANDS,
    } as unknown as EventPayload);

    // Set flag AFTER successful registration (fix: was set before emitEvent)
    commandsRegistered = true;

    logger.info(
      `${LOG_PREFIX} Registered commands: ${COMMANDS.map((c) => `/${c.name}`).join(", ")}`,
    );
  });

  // Handle incoming slash command interactions.
  runtime.registerEvent("DISCORD_SLASH_COMMAND", async (params: DiscordSlashCommandParams) => {
    const interaction = params?.interaction;
    if (!interaction?.isCommand?.()) return;

    const commandName = interaction.commandName;
    const handler = HANDLERS[commandName];
    if (!handler) return; // Not one of our commands

    logger.info(
      `${LOG_PREFIX} Handling /${commandName} from ${interaction.user?.username ?? "unknown"}`,
    );

    // [SEC-1] Enforce permission validators before dispatching to handler
    const validator = VALIDATORS[commandName];
    if (validator) {
      const allowed = await validator(interaction as Interaction, runtime);
      if (!allowed) {
        logger.warn(
          `${LOG_PREFIX} Permission denied: /${commandName} from ${interaction.user?.username ?? "unknown"} (${interaction.user?.id})`,
        );
        await interaction.reply({
          content: "🚫 Permission denied. You do not have the required role for this command.",
          ephemeral: true,
        });
        return;
      }
    }

    try {
      await handler(interaction as ChatInputCommandInteraction, runtime);
    } catch (err) {
      logger.error(
        `${LOG_PREFIX} Error handling /${commandName}: ${err instanceof Error ? err.message : String(err)}`,
      );

      // Try to reply with error if we haven't already
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "An internal error occurred while processing this command.",
            ephemeral: true,
          });
        } else if (interaction.deferred) {
          await interaction.editReply(
            "An internal error occurred while processing this command.",
          );
        }
      } catch {
        // Response already sent or expired
      }
    }
  });

  logger.info(`${LOG_PREFIX} Discord commands module initialized (waiting for server connection)`);
}
