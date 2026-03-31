/**
 * /status slash command — Show system status.
 *
 * Available to everyone. Displays loaded plugins, active agents, and system info.
 */

import type { IAgentRuntime } from "@elizaos/core";
import type { ChatInputCommandInteraction } from "discord.js";
import os from "node:os";
import { requireAdmin, getInteractionUserRole } from "./validators";
import type { DiscordSlashCommand } from "./types";

export const statusCommand: DiscordSlashCommand = {
  name: "status",
  description: "Show system status — loaded plugins, active agents, system info",
  guildOnly: true,
  validator: requireAdmin,
  options: [],
};

/**
 * Handle the /status slash command interaction.
 */
export async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const lines: string[] = [];

    // Agent info
    const agentName = runtime.character?.name ?? "Unknown";
    lines.push(`**Agent:** ${agentName}`);
    lines.push(`**Agent ID:** \`${runtime.agentId}\``);

    // Loaded plugins
    const plugins = runtime.plugins ?? [];
    if (plugins.length > 0) {
      const pluginNames = plugins.map((p) => p.name ?? "unnamed");
      lines.push(`\n**Loaded Plugins (${pluginNames.length}):**`);
      // Show first 20 to avoid message limit
      const displayed = pluginNames.slice(0, 20);
      for (const name of displayed) {
        lines.push(`• ${name}`);
      }
      if (pluginNames.length > 20) {
        lines.push(`• ... and ${pluginNames.length - 20} more`);
      }
    } else {
      lines.push("\n**Plugins:** None loaded");
    }

    // Registered actions count
    const actions = runtime.getAllActions();
    lines.push(`\n**Registered Actions:** ${actions.length}`);

    // Active coding agents (if available)
    const listAction = actions.find((a) => a.name === "LIST_CODING_AGENTS");
    if (listAction) {
      lines.push("**Coding Agent Management:** ✅ Available");
    }

    // Service health
    const runtimeWithHealth = runtime as IAgentRuntime & {
      getServiceHealth?: () => Record<string, { status: string; instances: number }>;
    };
    if (typeof runtimeWithHealth.getServiceHealth === "function") {
      const health = runtimeWithHealth.getServiceHealth();
      const serviceCount = Object.keys(health).length;
      const runningCount = Object.values(health).filter(
        (s) => s.status === "registered",
      ).length;
      lines.push(`\n**Services:** ${runningCount}/${serviceCount} running`);
    }

    // SEC-4: System info is only shown to ADMIN+ users (contains heap, node version, platform)
    const role = await getInteractionUserRole(interaction, runtime);
    const isAdmin = role === "ADMIN" || role === "OWNER";

    if (isAdmin) {
      lines.push("\n**System:**");
      lines.push(`• Uptime: ${formatUptime(process.uptime())}`);
      lines.push(
        `• Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / ${Math.round(os.totalmem() / 1024 / 1024)}MB`,
      );
      lines.push(`• Node: ${process.version}`);
      lines.push(`• Platform: ${process.platform} ${process.arch}`);
    }

    const reply = lines.join("\n").slice(0, 2000);
    await interaction.editReply(reply);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await interaction.editReply(`❌ Error fetching status: ${errMsg}`);
  }
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}
