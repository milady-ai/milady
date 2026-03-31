/**
 * /skill slash command — Search, install, list, and run skills.
 *
 * Subcommands:
 *   /skill search query:<string>  — Search skill marketplace (EVERYONE)
 *   /skill install name:<string>  — Install a skill from marketplace (ADMIN+)
 *   /skill list                   — List installed skills (EVERYONE)
 *   /skill run name:<string> [args:<string>] — Run a skill script (ADMIN+)
 *
 * Maps to functions from skill-marketplace service and RUN_SKILL_SCRIPT action
 * from plugin-agent-skills.
 */

import {
  logger,
  type IAgentRuntime,
} from "@elizaos/core";
import type { ChatInputCommandInteraction } from "discord.js";
import { requireAdmin, allowAll } from "./validators";
import { escapeXml, type DiscordSlashCommand, ApplicationCommandOptionType } from "./types";
import { makeCommandMemory } from "./utils";
import {
  searchSkillsMarketplace,
  installMarketplaceSkill,
  listInstalledMarketplaceSkills,
} from "../services/skill-marketplace";

const LOG_PREFIX = "[discord-skill]";
const DISCORD_MAX_CHARS = 2000;

/**
 * Permission validator that routes to the correct validator per subcommand.
 * search/list = everyone, install/run = admin+.
 */
async function skillValidator(
  interaction: import("discord.js").Interaction,
  runtime: IAgentRuntime,
): Promise<boolean> {
  if (!interaction.isChatInputCommand()) return false;
  const sub = interaction.options.getSubcommand(false);
  if (sub === "search" || sub === "list") {
    return allowAll(interaction, runtime);
  }
  // install, run → admin+
  return requireAdmin(interaction, runtime);
}

export const skillCommand: DiscordSlashCommand = {
  name: "skill",
  description: "Manage agent skills — search, install, list, run",
  guildOnly: true,
  validator: skillValidator,
  options: [
    {
      name: "search",
      type: ApplicationCommandOptionType.Subcommand,
      description: "Search the skill marketplace",
      options: [
        {
          name: "query",
          type: ApplicationCommandOptionType.String,
          description: "Search query",
          required: true,
        },
      ],
    },
    {
      name: "install",
      type: ApplicationCommandOptionType.Subcommand,
      description: "Install a skill from the marketplace (admin+)",
      options: [
        {
          name: "name",
          type: ApplicationCommandOptionType.String,
          description: "Skill name or GitHub URL to install",
          required: true,
        },
      ],
    },
    {
      name: "list",
      type: ApplicationCommandOptionType.Subcommand,
      description: "List installed skills",
    },
    {
      name: "run",
      type: ApplicationCommandOptionType.Subcommand,
      description: "Run a skill script (admin+)",
      options: [
        {
          name: "name",
          type: ApplicationCommandOptionType.String,
          description: "Skill name to run",
          required: true,
        },
        {
          name: "args",
          type: ApplicationCommandOptionType.String,
          description: "Arguments to pass to the skill script",
          required: false,
        },
      ],
    },
  ],
};

/**
 * Resolve the workspace directory used by the skill marketplace.
 */
function resolveWorkspaceDir(): string {
  return process.env.ELIZA_WORKSPACE_DIR?.trim() || process.cwd();
}

/**
 * Handle the /skill slash command interaction.
 */
export async function handleSkillCommand(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "search":
      return handleSkillSearch(interaction);
    case "install":
      return handleSkillInstall(interaction, runtime);
    case "list":
      return handleSkillList(interaction);
    case "run":
      return handleSkillRun(interaction, runtime);
    default:
      await interaction.reply({
        content: `❌ Unknown subcommand \`${sub}\`.`,
        ephemeral: true,
      });
  }
}

// ── Subcommand handlers ──────────────────────────────────────────────────

async function handleSkillSearch(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const query = interaction.options.getString("query", true);

  await interaction.deferReply();

  try {
    const results = await searchSkillsMarketplace(query, { limit: 10 });

    if (results.length === 0) {
      await interaction.editReply(`🔍 No skills found for **${query}**.`);
      return;
    }

    const lines = results.map((r, i) => {
      const name = r.name || r.slug || r.id;
      const desc =
        r.description?.length > 80
          ? `${r.description.slice(0, 77)}...`
          : r.description || "No description";
      const tags = r.tags?.length ? ` \`${r.tags.slice(0, 3).join("` `")}\`` : "";
      return `**${i + 1}.** \`${name}\` — ${desc}${tags}`;
    });

    const header = `🔍 **Skill search: "${query}"** (${results.length} result${results.length !== 1 ? "s" : ""})\n`;
    const body = lines.join("\n");
    const reply = `${header}${body}`.slice(0, DISCORD_MAX_CHARS);

    await interaction.editReply(reply);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`${LOG_PREFIX} search error: ${errMsg}`);
    await interaction.editReply(`❌ Search failed: ${errMsg}`.slice(0, DISCORD_MAX_CHARS));
  }
}

async function handleSkillInstall(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const name = interaction.options.getString("name", true);
  const userId = interaction.user?.id ?? "unknown";
  const userName = interaction.user?.username ?? "unknown";

  // 1f: URL scheme validation — only allow https:// GitHub URLs
  if (name.startsWith("http://") || name.startsWith("ftp://")) {
    await interaction.reply({
      content: "❌ Only `https://` URLs are accepted for skill installation.",
      ephemeral: true,
    });
    return;
  }

  // SEC-2: Audit log
  logger.warn(`${LOG_PREFIX} ADMIN ${userId} (${userName}) installing skill: ${name}`);

  await interaction.deferReply({ ephemeral: true });

  try {
    const workspaceDir = resolveWorkspaceDir();

    // Determine if input is a GitHub URL or a name
    const isUrl = name.startsWith("https://") || name.includes("github.com");
    const input = isUrl
      ? { githubUrl: name, source: "manual" as const }
      : { slug: name, name, source: "clawhub" as const };

    const installed = await installMarketplaceSkill(workspaceDir, input);

    logger.warn(
      `${LOG_PREFIX} Skill installed: ${installed.id} by ${userId} (${userName}) — scan: ${installed.scanStatus ?? "unknown"}`,
    );

    const scanNote =
      installed.scanStatus === "warning"
        ? "\n⚠️ Security scan found warnings — review recommended."
        : installed.scanStatus === "clean"
          ? "\n✅ Security scan: clean."
          : "";

    await interaction.editReply(
      `📦 Installed skill **${installed.id}**\n` +
        `Repository: \`${installed.repository}\`\n` +
        `Path: \`${installed.installPath}\`${scanNote}`,
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`${LOG_PREFIX} install error: ${errMsg}`);
    await interaction.editReply(`❌ Install failed: ${errMsg}`.slice(0, DISCORD_MAX_CHARS));
  }
}

async function handleSkillList(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply();

  try {
    const workspaceDir = resolveWorkspaceDir();
    const skills = await listInstalledMarketplaceSkills(workspaceDir);

    if (skills.length === 0) {
      await interaction.editReply("📋 No marketplace skills installed.");
      return;
    }

    const lines = skills.map((s) => {
      const name = s.name || s.id;
      const desc =
        s.description?.length > 60
          ? `${s.description.slice(0, 57)}...`
          : s.description || "";
      const scan = s.scanStatus === "clean" ? "✅" : s.scanStatus === "warning" ? "⚠️" : "❓";
      return `${scan} \`${name}\` — ${desc}`;
    });

    const header = `📋 **Installed skills** (${skills.length})\n`;
    const body = lines.join("\n");
    const reply = `${header}${body}`.slice(0, DISCORD_MAX_CHARS);

    await interaction.editReply(reply);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`${LOG_PREFIX} list error: ${errMsg}`);
    await interaction.editReply(`❌ Failed to list skills: ${errMsg}`.slice(0, DISCORD_MAX_CHARS));
  }
}

async function handleSkillRun(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const name = interaction.options.getString("name", true);
  const args = interaction.options.getString("args") ?? "";
  const userId = interaction.user?.id ?? "unknown";
  const userName = interaction.user?.username ?? "unknown";

  // SEC-2: Audit log
  logger.warn(`${LOG_PREFIX} ADMIN ${userId} (${userName}) running skill: ${name} args: ${args}`);

  // Ephemeral — skill output may contain sensitive data
  await interaction.deferReply({ ephemeral: true });

  try {
    // Find the RUN_SKILL_SCRIPT action
    const actions = runtime.getAllActions();
    const runAction = actions.find((a) => a.name === "RUN_SKILL_SCRIPT");

    if (!runAction?.handler) {
      await interaction.editReply(
        "❌ RUN_SKILL_SCRIPT action not available. Is `plugin-agent-skills` loaded?",
      );
      return;
    }

    // SEC-3: Escape user input to prevent XML injection in params only
    const safeName = escapeXml(name);
    const safeArgs = escapeXml(args);

    const memory = makeCommandMemory(runtime, interaction, {
      idSuffix: "skill-run",
      text: `Run skill script: ${name} ${args}`.trim(),
      params: `<RUN_SKILL_SCRIPT><skill>${safeName}</skill><args>${safeArgs}</args></RUN_SKILL_SCRIPT>`,
      actions: ["RUN_SKILL_SCRIPT"],
    });

    const callbackMessages: string[] = [];
    const callback = async (content: { text?: string }) => {
      if (content.text) callbackMessages.push(content.text);
      return [];
    };

    await runAction.handler(runtime, memory, undefined, {}, callback);

    const output =
      callbackMessages.length > 0
        ? callbackMessages.join("\n")
        : "(no output)";

    // Display name is unescaped — Discord renders Markdown, not XML
    const prefix = `🔧 **Skill run:** \`${name}\`\n`;
    const reply = `${prefix}\`\`\`\n${output}\n\`\`\``.slice(0, DISCORD_MAX_CHARS);

    await interaction.editReply(reply);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`${LOG_PREFIX} run error: ${errMsg}`);
    await interaction.editReply(`❌ Skill run failed: ${errMsg}`.slice(0, DISCORD_MAX_CHARS));
  }
}
