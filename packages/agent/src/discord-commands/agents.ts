/**
 * /agents slash command — List, check status, stop, or send messages to coding agents.
 *
 * Subcommands:
 *   /agents list          — List active coding agents
 *   /agents status <id>   — Get status of a specific agent
 *   /agents stop <id>     — Stop a coding agent
 *   /agents send <id> <message> — Send a message to a coding agent
 *
 * Maps to LIST_CODING_AGENTS, STOP_CODING_AGENT, SEND_TO_CODING_AGENT
 * from plugin-agent-orchestrator.
 */

import { type IAgentRuntime } from "@elizaos/core";
import type { ChatInputCommandInteraction } from "discord.js";
import { requireAdmin } from "./validators";
import { escapeXml, ApplicationCommandOptionType, type DiscordSlashCommand } from "./types";
import { makeCommandMemory } from "./utils";

export const agentsCommand: DiscordSlashCommand = {
  name: "agents",
  description: "Manage coding agents",
  guildOnly: true,
  validator: requireAdmin,
  options: [
    {
      name: "list",
      type: ApplicationCommandOptionType.Subcommand,
      description: "List all active coding agents",
    },
    {
      name: "status",
      type: ApplicationCommandOptionType.Subcommand,
      description: "Get status of a specific agent",
      options: [
        {
          name: "id",
          type: ApplicationCommandOptionType.String,
          description: "Agent session ID",
          required: true,
        },
      ],
    },
    {
      name: "stop",
      type: ApplicationCommandOptionType.Subcommand,
      description: "Stop a coding agent",
      options: [
        {
          name: "id",
          type: ApplicationCommandOptionType.String,
          description: "Agent session ID to stop",
          required: true,
        },
      ],
    },
    {
      name: "send",
      type: ApplicationCommandOptionType.Subcommand,
      description: "Send a message to a coding agent",
      options: [
        {
          name: "id",
          type: ApplicationCommandOptionType.String,
          description: "Agent session ID",
          required: true,
        },
        {
          name: "message",
          type: ApplicationCommandOptionType.String,
          description: "Message to send to the agent",
          required: true,
        },
      ],
    },
  ],
};

/**
 * Handle the /agents slash command interaction.
 */
export async function handleAgentsCommand(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand(true);

  await interaction.deferReply({ ephemeral: true });

  try {
    const actions = runtime.getAllActions();

    switch (subcommand) {
      case "list": {
        const listAction = actions.find(
          (a) => a.name === "LIST_CODING_AGENTS",
        );
        if (!listAction?.handler) {
          await interaction.editReply(
            "❌ LIST_CODING_AGENTS action not available.",
          );
          return;
        }

        const memory = makeCommandMemory(runtime, interaction, {
          idSuffix: "agents-list",
          text: "List coding agents",
          actions: ["LIST_CODING_AGENTS"],
        });

        const messages: string[] = [];
        await listAction.handler(
          runtime,
          memory,
          undefined,
          {},
          async (content: { text?: string }) => {
            if (content.text) messages.push(content.text);
            return [];
          },
        );

        const reply =
          messages.length > 0
            ? messages.join("\n").slice(0, 2000)
            : "No active coding agents.";
        await interaction.editReply(reply);
        break;
      }

      case "status": {
        const agentId = interaction.options.getString("id", true);
        // SEC-3: Escape user input for XML interpolation
        const safeAgentId = escapeXml(agentId);

        // Try STATUS_CODING_AGENT first, fall back to LIST_CODING_AGENTS with filter
        const statusAction = actions.find(
          (a) => a.name === "STATUS_CODING_AGENT",
        );
        const listAction = actions.find(
          (a) => a.name === "LIST_CODING_AGENTS",
        );

        const actionToUse = statusAction ?? listAction;
        if (!actionToUse?.handler) {
          await interaction.editReply(
            "❌ Agent status action not available.",
          );
          return;
        }

        const statusMemory = makeCommandMemory(runtime, interaction, {
          idSuffix: "agents-status",
          text: `Show status of coding agent ${agentId}`,
          params: `<${actionToUse.name}><sessionId>${safeAgentId}</sessionId></${actionToUse.name}>`,
          actions: [actionToUse.name],
        });

        const statusMessages: string[] = [];
        await actionToUse.handler(
          runtime,
          statusMemory,
          undefined,
          {},
          async (content: { text?: string }) => {
            if (content.text) statusMessages.push(content.text);
            return [];
          },
        );

        const statusReply =
          statusMessages.length > 0
            ? statusMessages.join("\n").slice(0, 2000)
            : `No information for agent \`${agentId}\`.`;
        await interaction.editReply(statusReply);
        break;
      }

      case "stop": {
        const agentId = interaction.options.getString("id", true);
        const stopAction = actions.find(
          (a) => a.name === "STOP_CODING_AGENT",
        );
        if (!stopAction?.handler) {
          await interaction.editReply(
            "❌ STOP_CODING_AGENT action not available.",
          );
          return;
        }

        // SEC-3: Escape user input for XML interpolation
        const safeStopId = escapeXml(agentId);

        const stopMemory = makeCommandMemory(runtime, interaction, {
          idSuffix: "agents-stop",
          text: `Stop coding agent ${agentId}`,
          params: `<STOP_CODING_AGENT><sessionId>${safeStopId}</sessionId></STOP_CODING_AGENT>`,
          actions: ["STOP_CODING_AGENT"],
        });

        const messages: string[] = [];
        await stopAction.handler(
          runtime,
          stopMemory,
          undefined,
          {},
          async (content: { text?: string }) => {
            if (content.text) messages.push(content.text);
            return [];
          },
        );

        const reply =
          messages.length > 0
            ? messages.join("\n").slice(0, 2000)
            : `✅ Sent stop signal to agent \`${agentId}\`.`;
        await interaction.editReply(reply);
        break;
      }

      case "send": {
        const agentId = interaction.options.getString("id", true);
        const message = interaction.options.getString("message", true);
        const sendAction = actions.find(
          (a) => a.name === "SEND_TO_CODING_AGENT",
        );
        if (!sendAction?.handler) {
          await interaction.editReply(
            "❌ SEND_TO_CODING_AGENT action not available.",
          );
          return;
        }

        // SEC-3: Escape user input for XML interpolation
        const safeSendId = escapeXml(agentId);
        const safeMessage = escapeXml(message);

        const sendMemory = makeCommandMemory(runtime, interaction, {
          idSuffix: "agents-send",
          text: `Send to agent ${agentId}: ${message}`,
          params: `<SEND_TO_CODING_AGENT><sessionId>${safeSendId}</sessionId><message>${safeMessage}</message></SEND_TO_CODING_AGENT>`,
          actions: ["SEND_TO_CODING_AGENT"],
        });

        const messages: string[] = [];
        await sendAction.handler(
          runtime,
          sendMemory,
          undefined,
          {},
          async (content: { text?: string }) => {
            if (content.text) messages.push(content.text);
            return [];
          },
        );

        const reply =
          messages.length > 0
            ? messages.join("\n").slice(0, 2000)
            : `✅ Message sent to agent \`${agentId}\`.`;
        await interaction.editReply(reply);
        break;
      }

      default:
        await interaction.editReply(`Unknown subcommand: ${subcommand}`);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await interaction.editReply(`❌ Error: ${errMsg}`);
  }
}
