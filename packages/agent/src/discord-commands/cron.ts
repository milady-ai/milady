/**
 * /cron slash command — Manage cron jobs.
 *
 * Subcommands:
 *   /cron list                               — List all cron jobs
 *   /cron create schedule:<expr> task:<desc>  — Create a cron job
 *   /cron delete id:<string>                  — Delete a cron job
 *   /cron run id:<string>                     — Manually trigger a cron job
 *
 * ADMIN+ only. Uses plugin-cron's CronService directly.
 */

import { logger, type IAgentRuntime } from "@elizaos/core";
import type { ChatInputCommandInteraction } from "discord.js";
import { requireAdmin } from "./validators";
import { ApplicationCommandOptionType, type DiscordSlashCommand } from "./types";

const DISCORD_MAX_CHARS = 2000;

/**
 * Validate a cron expression (5 or 6 fields separated by whitespace).
 * Each field may contain digits, commas, hyphens, slashes, and wildcards.
 */
function isValidCronExpression(expr: string): boolean {
  // Allow 5-field (standard) or 6-field (with seconds) cron expressions
  return /^(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)(\s+(\*|[0-9,\-*/]+))?$/.test(
    expr.trim(),
  );
}

export const cronCommand: DiscordSlashCommand = {
  name: "cron",
  description: "Manage cron jobs (admin+)",
  guildOnly: true,
  validator: requireAdmin,
  options: [
    {
      name: "list",
      type: ApplicationCommandOptionType.Subcommand,
      description: "List all cron jobs",
    },
    {
      name: "create",
      type: ApplicationCommandOptionType.Subcommand,
      description: "Create a new cron job",
      options: [
        {
          name: "schedule",
          type: ApplicationCommandOptionType.String,
          description: "Cron expression (e.g. '0 9 * * 1-5' for 9am weekdays)",
          required: true,
        },
        {
          name: "task",
          type: ApplicationCommandOptionType.String,
          description: "Task description (used as prompt payload)",
          required: true,
        },
      ],
    },
    {
      name: "delete",
      type: ApplicationCommandOptionType.Subcommand,
      description: "Delete a cron job",
      options: [
        {
          name: "id",
          type: ApplicationCommandOptionType.String,
          description: "Job ID to delete",
          required: true,
        },
      ],
    },
    {
      name: "run",
      type: ApplicationCommandOptionType.Subcommand,
      description: "Manually trigger a cron job",
      options: [
        {
          name: "id",
          type: ApplicationCommandOptionType.String,
          description: "Job ID to run",
          required: true,
        },
      ],
    },
  ],
};

/** Minimal CronService interface to avoid hard import dependency. */
interface CronServiceLike {
  listJobs: (filter?: { includeDisabled?: boolean }) => Promise<Array<{
    id: string;
    name: string;
    enabled: boolean;
    schedule: { kind: string; expr?: string; everyMs?: number; at?: string };
    state?: { lastRunAtMs?: number; lastStatus?: string; runCount?: number; nextRunAtMs?: number };
  }>>;
  createJob: (input: {
    name: string;
    description?: string;
    enabled: boolean;
    schedule: { kind: "cron"; expr: string };
    payload: { kind: "prompt"; text: string };
  }) => Promise<{ id: string; name: string }>;
  deleteJob: (id: string) => Promise<boolean>;
  runJob: (id: string, mode?: "force" | "due") => Promise<{ ran: boolean; output?: string; error?: string }>;
}

/**
 * Handle the /cron slash command interaction.
 */
export async function handleCronCommand(
  interaction: ChatInputCommandInteraction,
  runtime: IAgentRuntime,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand(true);

  await interaction.deferReply({ ephemeral: true });

  try {
    const cronService = runtime.getService("CRON") as unknown as CronServiceLike | undefined;

    if (!cronService) {
      await interaction.editReply(
        "❌ Cron service not available. Is `plugin-cron` loaded?",
      );
      return;
    }

    switch (subcommand) {
      case "list":
        await handleList(interaction, cronService);
        break;
      case "create":
        await handleCreate(interaction, cronService);
        break;
      case "delete":
        await handleDelete(interaction, cronService);
        break;
      case "run":
        await handleRun(interaction, cronService);
        break;
      default:
        await interaction.editReply(`❌ Unknown subcommand: \`${subcommand}\``);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[discord-commands] /cron ${subcommand} error: ${errMsg}`);
    await interaction.editReply(`❌ Cron error: ${errMsg}`.slice(0, DISCORD_MAX_CHARS));
  }
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  cronService: CronServiceLike,
): Promise<void> {
  const jobs = await cronService.listJobs({ includeDisabled: true });

  if (jobs.length === 0) {
    await interaction.editReply("📋 No cron jobs configured.");
    return;
  }

  const lines = jobs.map((job) => {
    const status = job.enabled ? "✅" : "⏸️";
    const schedule = formatSchedule(job.schedule);
    const lastRun = job.state?.lastRunAtMs
      ? `last: ${new Date(job.state.lastRunAtMs).toISOString().slice(0, 19)}Z`
      : "never run";
    return `${status} **${job.name}** (\`${job.id.slice(0, 8)}\`)\n  ${schedule} | ${lastRun} | runs: ${job.state?.runCount ?? 0}`;
  });

  const header = `📋 **Cron Jobs** (${jobs.length})\n\n`;
  let reply = header + lines.join("\n\n");

  if (reply.length > DISCORD_MAX_CHARS) {
    reply = reply.slice(0, DISCORD_MAX_CHARS - 20) + "\n… (truncated)";
  }

  await interaction.editReply(reply);
}

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  cronService: CronServiceLike,
): Promise<void> {
  const schedule = interaction.options.getString("schedule", true);
  const task = interaction.options.getString("task", true);

  // 1f: Validate cron expression format before passing to createJob
  if (!isValidCronExpression(schedule)) {
    await interaction.editReply(
      "❌ Invalid cron expression. Expected 5 fields (min hour dom mon dow), e.g. `0 9 * * 1-5`.",
    );
    return;
  }

  // Generate a short name from the task
  const name = task.length > 50 ? task.slice(0, 47) + "..." : task;

  const userId = interaction.user?.id ?? "unknown";
  logger.warn(`[discord-cron] ADMIN ${userId} created cron: ${schedule} — ${task}`);

  const job = await cronService.createJob({
    name,
    description: task,
    enabled: true,
    schedule: { kind: "cron", expr: schedule },
    payload: { kind: "prompt", text: task },
  });

  await interaction.editReply(
    `✅ Created cron job **${job.name}**\nID: \`${job.id}\`\nSchedule: \`${schedule}\``,
  );
}

async function handleDelete(
  interaction: ChatInputCommandInteraction,
  cronService: CronServiceLike,
): Promise<void> {
  const id = interaction.options.getString("id", true);

  const userId = interaction.user?.id ?? "unknown";
  logger.warn(`[discord-cron] ADMIN ${userId} deleted cron: ${id}`);

  const deleted = await cronService.deleteJob(id);

  if (deleted) {
    await interaction.editReply(`🗑️ Deleted cron job \`${id}\``);
  } else {
    await interaction.editReply(`❌ Job \`${id}\` not found.`);
  }
}

async function handleRun(
  interaction: ChatInputCommandInteraction,
  cronService: CronServiceLike,
): Promise<void> {
  const id = interaction.options.getString("id", true);

  const result = await cronService.runJob(id, "force");

  if (result.ran) {
    const output = result.output ? `\n\`\`\`\n${result.output.slice(0, 1500)}\n\`\`\`` : "";
    await interaction.editReply(`▶️ Ran job \`${id}\`${output}`.slice(0, DISCORD_MAX_CHARS));
  } else {
    const errorMsg = result.error ? `: ${result.error}` : "";
    await interaction.editReply(`❌ Could not run job \`${id}\`${errorMsg}`);
  }
}

function formatSchedule(schedule: { kind: string; expr?: string; everyMs?: number; at?: string }): string {
  switch (schedule.kind) {
    case "cron":
      return `cron: \`${schedule.expr}\``;
    case "every":
      return `every ${Math.round((schedule.everyMs ?? 0) / 1000)}s`;
    case "at":
      return `at: ${schedule.at}`;
    default:
      return schedule.kind;
  }
}
