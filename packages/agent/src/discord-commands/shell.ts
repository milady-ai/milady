/**
 * /shell slash command — Execute a shell command.
 *
 * Usage: /shell command:<string>
 *
 * OWNER ONLY. Ephemeral responses. Output truncated to Discord's 2000 char limit.
 * Executes via plugin-shell's ShellService.
 */

import { logger, type IAgentRuntime } from "@elizaos/core";
import type { ChatInputCommandInteraction } from "discord.js";
import { ApplicationCommandOptionType } from "discord.js";
import { requireOwner } from "./validators";
import type { DiscordSlashCommand } from "./types";

const DISCORD_MAX_CHARS = 2000;
const TRUNCATION_NOTE = "\n… (output truncated)";

export const shellCommand: DiscordSlashCommand = {
  name: "shell",
  description: "Execute a shell command (owner only)",
  guildOnly: true,
  validator: requireOwner,
  options: [
    {
      name: "command",
      type: ApplicationCommandOptionType.String,
      description: "Shell command to execute",
      required: true,
    },
  ],
};

/**
 * Handle the /shell slash command interaction.
 */
export async function handleShellCommand(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const command = interaction.options.getString("command", true);

  // Defer with ephemeral — only the invoker sees the response
  await interaction.deferReply({ ephemeral: true });

  try {
    // Get ShellService from the runtime
    const shellService = runtime.getService("shell") as unknown as
      | { executeCommand: (cmd: string, convId?: string) => Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number | null; error?: string }> }
      | undefined;

    if (!shellService?.executeCommand) {
      await interaction.editReply(
        "❌ Shell service not available. Is `plugin-shell` loaded?",
      );
      return;
    }

    const result = await shellService.executeCommand(command, `discord-${interaction.user.id}`);

    // Build output
    let output = "";
    if (result.stdout) output += result.stdout;
    if (result.stderr) output += (output ? "\n" : "") + result.stderr;
    if (result.error) output += (output ? "\n" : "") + `Error: ${result.error}`;
    if (!output) output = "(no output)";

    const exitLine = `\n[exit ${result.exitCode ?? "?"}]`;
    const prefix = `\`$ ${command}\`\n\`\`\`\n`;
    const suffix = `\n\`\`\`${exitLine}`;

    const maxContentLen = DISCORD_MAX_CHARS - prefix.length - suffix.length - TRUNCATION_NOTE.length;

    let truncated = false;
    if (output.length > maxContentLen) {
      output = output.slice(0, maxContentLen) + TRUNCATION_NOTE;
      truncated = true;
    }

    const reply = `${prefix}${output}${suffix}${truncated ? "" : ""}`;

    // Final safety check
    await interaction.editReply(reply.slice(0, DISCORD_MAX_CHARS));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[discord-commands] /shell error: ${errMsg}`);
    await interaction.editReply(`❌ Shell execution failed: ${errMsg}`.slice(0, DISCORD_MAX_CHARS));
  }
}
