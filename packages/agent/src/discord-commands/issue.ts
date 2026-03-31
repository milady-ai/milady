/**
 * /issue slash command — Create and list GitHub issues.
 *
 * Subcommands:
 *   /issue create repo:<url> title:<text> body:<text>  — Create a GitHub issue
 *   /issue list repo:<url> [state:<open|closed|all>]   — List issues for a repo
 *
 * Maps to the MANAGE_ISSUES action from plugin-agent-orchestrator.
 * ADMIN+ gated.
 */

import { logger, type IAgentRuntime } from "@elizaos/core";
import type { ChatInputCommandInteraction } from "discord.js";
import { requireAdmin } from "./validators";
import { escapeXml, ApplicationCommandOptionType, type DiscordSlashCommand } from "./types";
import { makeCommandMemory } from "./utils";

const LOG_PREFIX = "[discord-issue]";
const DISCORD_MAX_CHARS = 2000;

export const issueCommand: DiscordSlashCommand = {
  name: "issue",
  description: "Manage GitHub issues (admin+)",
  guildOnly: true,
  validator: requireAdmin,
  options: [
    {
      name: "create",
      type: ApplicationCommandOptionType.Subcommand,
      description: "Create a new GitHub issue",
      options: [
        {
          name: "repo",
          type: ApplicationCommandOptionType.String,
          description: "Repository URL (https://github.com/...)",
          required: true,
        },
        {
          name: "title",
          type: ApplicationCommandOptionType.String,
          description: "Issue title",
          required: true,
        },
        {
          name: "body",
          type: ApplicationCommandOptionType.String,
          description: "Issue body / description",
          required: true,
        },
      ],
    },
    {
      name: "list",
      type: ApplicationCommandOptionType.Subcommand,
      description: "List issues for a repository",
      options: [
        {
          name: "repo",
          type: ApplicationCommandOptionType.String,
          description: "Repository URL (https://github.com/...)",
          required: true,
        },
        {
          name: "state",
          type: ApplicationCommandOptionType.String,
          description: "Filter by state: open, closed, or all (default: open)",
          required: false,
        },
      ],
    },
  ],
};

/**
 * Handle the /issue slash command interaction.
 */
export async function handleIssueCommand(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "create":
      return handleIssueCreate(interaction, runtime);
    case "list":
      return handleIssueList(interaction, runtime);
    default:
      await interaction.reply({
        content: `❌ Unknown subcommand \`${sub}\`.`,
        ephemeral: true,
      });
  }
}

// ── Subcommand handlers ──────────────────────────────────────────────────

async function handleIssueCreate(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const repo = interaction.options.getString("repo", true);
  const title = interaction.options.getString("title", true);
  const body = interaction.options.getString("body", true);
  const userId = interaction.user?.id ?? "unknown";
  const userName = interaction.user?.username ?? "unknown";

  // Validate URL scheme
  if (!repo.startsWith("https://")) {
    await interaction.reply({
      content: "❌ Only `https://` repository URLs are accepted.",
      ephemeral: true,
    });
    return;
  }

  // SEC-2: Audit log
  logger.warn(`${LOG_PREFIX} ADMIN ${userId} (${userName}) creating issue: ${title} @ ${repo}`);

  await interaction.deferReply({ ephemeral: true });

  try {
    const actions = runtime.getAllActions();
    const manageAction = actions.find((a) => a.name === "MANAGE_ISSUES");

    if (!manageAction?.handler) {
      await interaction.editReply(
        "❌ MANAGE_ISSUES action not available. Is `plugin-agent-orchestrator` loaded?",
      );
      return;
    }

    // SEC-3: Escape user input for XML params only
    const safeRepo = escapeXml(repo);
    const safeTitle = escapeXml(title);
    const safeBody = escapeXml(body);

    const memory = makeCommandMemory(runtime, interaction, {
      idSuffix: "issue-create",
      text: `Create GitHub issue: ${title}`,
      params: `<MANAGE_ISSUES><action>create</action><repo>${safeRepo}</repo><title>${safeTitle}</title><body>${safeBody}</body></MANAGE_ISSUES>`,
      actions: ["MANAGE_ISSUES"],
    });

    const results: string[] = [];
    await manageAction.handler(
      runtime,
      memory,
      undefined,
      {},
      async (content: { text?: string }) => {
        if (content.text) results.push(content.text);
        return [];
      },
    );

    const output =
      results.length > 0
        ? results.join("\n")
        : `✅ Issue created in \`${repo}\`.`;

    await interaction.editReply(output.slice(0, DISCORD_MAX_CHARS));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`${LOG_PREFIX} create error: ${errMsg}`);
    await interaction.editReply(
      `❌ Failed to create issue: ${errMsg}`.slice(0, DISCORD_MAX_CHARS),
    );
  }
}

async function handleIssueList(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const repo = interaction.options.getString("repo", true);
  const state = interaction.options.getString("state") ?? "open";

  // Validate URL scheme
  if (!repo.startsWith("https://")) {
    await interaction.reply({
      content: "❌ Only `https://` repository URLs are accepted.",
      ephemeral: true,
    });
    return;
  }

  // Validate state option
  const validStates = ["open", "closed", "all"];
  if (!validStates.includes(state)) {
    await interaction.reply({
      content: `❌ Invalid state \`${state}\`. Valid options: ${validStates.join(", ")}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const actions = runtime.getAllActions();
    const manageAction = actions.find((a) => a.name === "MANAGE_ISSUES");

    if (!manageAction?.handler) {
      await interaction.editReply(
        "❌ MANAGE_ISSUES action not available. Is `plugin-agent-orchestrator` loaded?",
      );
      return;
    }

    // SEC-3: Escape user input for XML params only
    const safeRepo = escapeXml(repo);
    const safeState = escapeXml(state);

    const memory = makeCommandMemory(runtime, interaction, {
      idSuffix: "issue-list",
      text: `List GitHub issues for ${repo} (state: ${state})`,
      params: `<MANAGE_ISSUES><action>list</action><repo>${safeRepo}</repo><state>${safeState}</state></MANAGE_ISSUES>`,
      actions: ["MANAGE_ISSUES"],
    });

    const results: string[] = [];
    await manageAction.handler(
      runtime,
      memory,
      undefined,
      {},
      async (content: { text?: string }) => {
        if (content.text) results.push(content.text);
        return [];
      },
    );

    const output =
      results.length > 0
        ? results.join("\n")
        : `📋 No ${state} issues found in \`${repo}\`.`;

    await interaction.editReply(output.slice(0, DISCORD_MAX_CHARS));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`${LOG_PREFIX} list error: ${errMsg}`);
    await interaction.editReply(
      `❌ Failed to list issues: ${errMsg}`.slice(0, DISCORD_MAX_CHARS),
    );
  }
}
