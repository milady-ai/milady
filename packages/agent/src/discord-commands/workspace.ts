/**
 * /workspace slash command — Provision and finalize git workspaces.
 *
 * Subcommands:
 *   /workspace provision repo:<url> [branch:<string>] — Provision a git workspace (ADMIN+)
 *   /workspace finalize id:<string> [pr-title:<string>] — Finalize workspace & create PR (ADMIN+)
 *
 * Maps to PROVISION_WORKSPACE and FINALIZE_WORKSPACE actions from
 * plugin-agent-orchestrator.
 */

import {
  logger,
  type IAgentRuntime,
} from "@elizaos/core";
import type { ChatInputCommandInteraction } from "discord.js";
import { requireAdmin } from "./validators";
import { escapeXml, ApplicationCommandOptionType, type DiscordSlashCommand } from "./types";
import { makeCommandMemory } from "./utils";

const LOG_PREFIX = "[discord-workspace]";
const DISCORD_MAX_CHARS = 2000;

export const workspaceCommand: DiscordSlashCommand = {
  name: "workspace",
  description: "Manage git workspaces — provision and finalize",
  guildOnly: true,
  validator: requireAdmin,
  options: [
    {
      name: "provision",
      type: ApplicationCommandOptionType.Subcommand,
      description: "Provision a git workspace for coding tasks (admin+)",
      options: [
        {
          name: "repo",
          type: ApplicationCommandOptionType.String,
          description: "Repository URL to clone (https:// only)",
          required: true,
        },
        {
          name: "branch",
          type: ApplicationCommandOptionType.String,
          description: "Branch name (optional, defaults to main)",
          required: false,
        },
      ],
    },
    {
      name: "finalize",
      type: ApplicationCommandOptionType.Subcommand,
      description: "Finalize workspace, commit & create PR (admin+)",
      options: [
        {
          name: "id",
          type: ApplicationCommandOptionType.String,
          description: "Workspace or session ID to finalize",
          required: true,
        },
        {
          name: "pr-title",
          type: ApplicationCommandOptionType.String,
          description: "Pull request title (optional)",
          required: false,
        },
      ],
    },
  ],
};

/**
 * Handle the /workspace slash command interaction.
 */
export async function handleWorkspaceCommand(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "provision":
      return handleProvision(interaction, runtime);
    case "finalize":
      return handleFinalize(interaction, runtime);
    default:
      await interaction.reply({
        content: `❌ Unknown subcommand \`${sub}\`.`,
        ephemeral: true,
      });
  }
}

// ── Subcommand handlers ──────────────────────────────────────────────────

async function handleProvision(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const repo = interaction.options.getString("repo", true);
  const branch = interaction.options.getString("branch");
  const userId = interaction.user?.id ?? "unknown";
  const userName = interaction.user?.username ?? "unknown";

  // 1f: URL scheme validation — only allow https://
  if (!repo.startsWith("https://")) {
    await interaction.reply({
      content: "❌ Only `https://` repository URLs are accepted.",
      ephemeral: true,
    });
    return;
  }

  // SEC-2: Audit log
  logger.warn(
    `${LOG_PREFIX} ADMIN ${userId} (${userName}) provisioning workspace: repo=${repo} branch=${branch ?? "default"}`,
  );

  await interaction.deferReply({ ephemeral: true });

  try {
    // Find PROVISION_WORKSPACE action
    const actions = runtime.getAllActions();
    const provisionAction = actions.find(
      (a) => a.name === "PROVISION_WORKSPACE",
    );

    if (!provisionAction?.handler) {
      await interaction.editReply(
        "❌ PROVISION_WORKSPACE action not available. Is `plugin-agent-orchestrator` loaded?",
      );
      return;
    }

    // SEC-3: Escape user input for XML params only
    const safeRepo = escapeXml(repo);
    const safeBranch = branch ? escapeXml(branch) : null;

    const memory = makeCommandMemory(runtime, interaction, {
      idSuffix: "workspace-provision",
      text: `Provision workspace for ${repo}${branch ? ` on branch ${branch}` : ""}`,
      params: `<PROVISION_WORKSPACE><repo>${safeRepo}</repo>${safeBranch ? `<branch>${safeBranch}</branch>` : ""}</PROVISION_WORKSPACE>`,
      actions: ["PROVISION_WORKSPACE"],
    });

    const callbackMessages: string[] = [];
    const callback = async (content: { text?: string }) => {
      if (content.text) callbackMessages.push(content.text);
      return [];
    };

    await provisionAction.handler(runtime, memory, undefined, {}, callback);

    const output =
      callbackMessages.length > 0
        ? callbackMessages.join("\n")
        : "✅ Workspace provisioned successfully.";

    logger.warn(
      `${LOG_PREFIX} Workspace provisioned: repo=${repo} by ${userId} (${userName})`,
    );

    await interaction.editReply(
      `📁 **Workspace provisioned**\nRepo: \`${repo}\`${branch ? `\nBranch: \`${branch}\`` : ""}\n\n${output}`.slice(
        0,
        DISCORD_MAX_CHARS,
      ),
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`${LOG_PREFIX} provision error: ${errMsg}`);
    await interaction.editReply(
      `❌ Workspace provisioning failed: ${errMsg}`.slice(0, DISCORD_MAX_CHARS),
    );
  }
}

async function handleFinalize(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const id = interaction.options.getString("id", true);
  const prTitle = interaction.options.getString("pr-title");
  const userId = interaction.user?.id ?? "unknown";
  const userName = interaction.user?.username ?? "unknown";

  // SEC-2: Audit log
  logger.warn(
    `${LOG_PREFIX} ADMIN ${userId} (${userName}) finalizing workspace: id=${id} pr-title=${prTitle ?? "(auto)"}`,
  );

  await interaction.deferReply({ ephemeral: true });

  try {
    // Find FINALIZE_WORKSPACE action
    const actions = runtime.getAllActions();
    const finalizeAction = actions.find(
      (a) => a.name === "FINALIZE_WORKSPACE",
    );

    if (!finalizeAction?.handler) {
      await interaction.editReply(
        "❌ FINALIZE_WORKSPACE action not available. Is `plugin-agent-orchestrator` loaded?",
      );
      return;
    }

    // SEC-3: Escape user input for XML params only
    const safeId = escapeXml(id);
    const safePrTitle = prTitle ? escapeXml(prTitle) : null;

    const memory = makeCommandMemory(runtime, interaction, {
      idSuffix: "workspace-finalize",
      text: `Finalize workspace ${id}${prTitle ? ` with PR title: ${prTitle}` : ""}`,
      params: `<FINALIZE_WORKSPACE><workspaceId>${safeId}</workspaceId>${safePrTitle ? `<prTitle>${safePrTitle}</prTitle>` : ""}</FINALIZE_WORKSPACE>`,
      actions: ["FINALIZE_WORKSPACE"],
    });

    const callbackMessages: string[] = [];
    const callback = async (content: { text?: string }) => {
      if (content.text) callbackMessages.push(content.text);
      return [];
    };

    await finalizeAction.handler(runtime, memory, undefined, {}, callback);

    const output =
      callbackMessages.length > 0
        ? callbackMessages.join("\n")
        : "✅ Workspace finalized successfully.";

    logger.warn(
      `${LOG_PREFIX} Workspace finalized: id=${id} by ${userId} (${userName})`,
    );

    await interaction.editReply(
      `🏁 **Workspace finalized**\nID: \`${id}\`${prTitle ? `\nPR: ${prTitle}` : ""}\n\n${output}`.slice(
        0,
        DISCORD_MAX_CHARS,
      ),
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`${LOG_PREFIX} finalize error: ${errMsg}`);
    await interaction.editReply(
      `❌ Workspace finalization failed: ${errMsg}`.slice(0, DISCORD_MAX_CHARS),
    );
  }
}
