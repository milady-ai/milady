/**
 * /code slash command — Spawn a coding agent.
 *
 * Usage: /code agent:<claude|codex|gemini|aider> task:<description>
 *
 * Maps to the START_CODING_TASK action from plugin-agent-orchestrator.
 */

import { type IAgentRuntime } from "@elizaos/core";
import type { ChatInputCommandInteraction } from "discord.js";
import { requireAdmin } from "./validators";
import { escapeXml, ApplicationCommandOptionType, type DiscordSlashCommand } from "./types";
import { makeCommandMemory } from "./utils";

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

    // SEC-3: Escape user input for XML params only
    const safeAgentSpec = escapeXml(agentSpec);
    const safeRepo = repo ? escapeXml(repo) : null;

    const memory = makeCommandMemory(runtime, interaction, {
      idSuffix: "code",
      text: `Start coding task: ${task}`,
      params: `<START_CODING_TASK><agents>${safeAgentSpec}</agents>${safeRepo ? `<repo>${safeRepo}</repo>` : ""}</START_CODING_TASK>`,
      actions: ["START_CODING_TASK"],
    });

    const callbackMessages: string[] = [];
    const callback = async (content: { text?: string }) => {
      if (content.text) callbackMessages.push(content.text);
      return [];
    };

    await startAction.handler(runtime, memory, undefined, {}, callback);

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
