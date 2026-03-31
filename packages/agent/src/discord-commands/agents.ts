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

import type { IAgentRuntime } from "@elizaos/core";
import type { ChatInputCommandInteraction } from "discord.js";
import { ApplicationCommandOptionType } from "discord.js";
import { requireAdmin } from "./validators";
import type { DiscordSlashCommand } from "./types";

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

        const { createUniqueUuid, stringToUuid } = await import(
          "@elizaos/core"
        );
        const memory = {
          id: stringToUuid(`slash-agents-list-${Date.now()}`),
          entityId: createUniqueUuid(runtime, interaction.user.id),
          roomId: createUniqueUuid(runtime, interaction.channelId),
          content: {
            text: "List coding agents",
            source: "discord",
            actions: ["LIST_CODING_AGENTS"],
          },
        };

        const messages: string[] = [];
        await listAction.handler(
          runtime,
          memory as any,
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
        // Use LIST_CODING_AGENTS and filter — no dedicated status action
        const listAction = actions.find(
          (a) => a.name === "LIST_CODING_AGENTS",
        );
        if (!listAction?.handler) {
          await interaction.editReply(
            "❌ LIST_CODING_AGENTS action not available.",
          );
          return;
        }

        const { createUniqueUuid, stringToUuid } = await import(
          "@elizaos/core"
        );
        const memory = {
          id: stringToUuid(`slash-agents-status-${Date.now()}`),
          entityId: createUniqueUuid(runtime, interaction.user.id),
          roomId: createUniqueUuid(runtime, interaction.channelId),
          content: {
            text: `Show status of coding agent ${agentId}`,
            source: "discord",
            actions: ["LIST_CODING_AGENTS"],
          },
        };

        const messages: string[] = [];
        await listAction.handler(
          runtime,
          memory as any,
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
            : `No information for agent \`${agentId}\`.`;
        await interaction.editReply(reply);
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

        const { createUniqueUuid, stringToUuid } = await import(
          "@elizaos/core"
        );
        const memory = {
          id: stringToUuid(`slash-agents-stop-${Date.now()}`),
          entityId: createUniqueUuid(runtime, interaction.user.id),
          roomId: createUniqueUuid(runtime, interaction.channelId),
          content: {
            text: `Stop coding agent ${agentId}`,
            source: "discord",
            params: `<STOP_CODING_AGENT><sessionId>${agentId}</sessionId></STOP_CODING_AGENT>`,
            actions: ["STOP_CODING_AGENT"],
          },
        };

        const messages: string[] = [];
        await stopAction.handler(
          runtime,
          memory as any,
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

        const { createUniqueUuid, stringToUuid } = await import(
          "@elizaos/core"
        );
        const memory = {
          id: stringToUuid(`slash-agents-send-${Date.now()}`),
          entityId: createUniqueUuid(runtime, interaction.user.id),
          roomId: createUniqueUuid(runtime, interaction.channelId),
          content: {
            text: `Send to agent ${agentId}: ${message}`,
            source: "discord",
            params: `<SEND_TO_CODING_AGENT><sessionId>${agentId}</sessionId><message>${message}</message></SEND_TO_CODING_AGENT>`,
            actions: ["SEND_TO_CODING_AGENT"],
          },
        };

        const messages: string[] = [];
        await sendAction.handler(
          runtime,
          memory as any,
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
