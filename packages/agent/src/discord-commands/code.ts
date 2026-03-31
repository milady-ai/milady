/**
 * /code slash command — Spawn a coding agent.
 *
 * Usage: /code agent:<claude|codex|gemini|aider> task:<description>
 *
 * Maps to the START_CODING_TASK action from plugin-agent-orchestrator.
 */

import type { IAgentRuntime, Memory } from "@elizaos/core";
import type { ChatInputCommandInteraction } from "discord.js";
import { ApplicationCommandOptionType } from "discord.js";
import { requireAdmin } from "./validators";
import type { DiscordSlashCommand } from "./types";

export const codeCommand: DiscordSlashCommand = {
  name: "code",
  description: "Spawn a coding agent to work on a task",
  guildOnly: true,
  validator: requireAdmin,
  options: [
    {
      name: "agent",
      type: ApplicationCommandOptionType.String,
      description: "Which coding agent to use",
      required: true,
    },
    {
      name: "task",
      type: ApplicationCommandOptionType.String,
      description: "Description of the coding task",
      required: true,
    },
    {
      name: "repo",
      type: ApplicationCommandOptionType.String,
      description: "Repository URL or path (optional)",
      required: false,
    },
  ],
};

/**
 * Handle the /code slash command interaction.
 */
export async function handleCodeCommand(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const agent = interaction.options.getString("agent", true);
  const task = interaction.options.getString("task", true);
  const repo = interaction.options.getString("repo");

  const validAgents = ["claude", "codex", "gemini", "aider", "pi"];
  if (!validAgents.includes(agent.toLowerCase())) {
    await interaction.reply({
      content: `❌ Unknown agent \`${agent}\`. Valid options: ${validAgents.join(", ")}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    // Build the agents spec string for START_CODING_TASK
    const agentSpec = `${agent.toLowerCase()}:${task}`;
    const params: Record<string, string> = { agents: agentSpec };
    if (repo) params.repo = repo;

    // Find and invoke the START_CODING_TASK action
    const actions = runtime.getAllActions();
    const startAction = actions.find(
      (a) =>
        a.name === "START_CODING_TASK" || a.name === "SPAWN_CODING_AGENT",
    );

    if (!startAction?.handler) {
      await interaction.editReply(
        "❌ Coding agent actions not available. Is `plugin-agent-orchestrator` loaded?",
      );
      return;
    }

    // Create a minimal Memory for the action handler
    const { createUniqueUuid, stringToUuid } = await import("@elizaos/core");
    const entityId = createUniqueUuid(runtime, interaction.user.id);
    const roomId = createUniqueUuid(runtime, interaction.channelId);
    const memory = {
      id: stringToUuid(`slash-code-${Date.now()}`),
      entityId,
      roomId,
      content: {
        text: `Start coding task: ${task}`,
        source: "discord",
        params: `<START_CODING_TASK><agents>${agentSpec}</agents>${repo ? `<repo>${repo}</repo>` : ""}</START_CODING_TASK>`,
        actions: ["START_CODING_TASK"],
      },
    };

    const callbackMessages: string[] = [];
    const callback = async (content: { text?: string }) => {
      if (content.text) callbackMessages.push(content.text);
      return [];
    };

    await startAction.handler(runtime, memory as unknown as Memory, undefined, {}, callback);

    const replyText =
      callbackMessages.length > 0
        ? callbackMessages.join("\n").slice(0, 2000)
        : `✅ Spawning \`${agent}\` agent for task:\n> ${task}`;

    await interaction.editReply(replyText);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await interaction.editReply(`❌ Failed to spawn coding agent: ${errMsg}`);
  }
}
