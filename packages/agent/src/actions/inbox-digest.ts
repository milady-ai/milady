import type {
  Action,
  ActionResult,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
  UUID,
} from "@elizaos/core";
import { ModelType, logger } from "@elizaos/core";
import { hasAdminAccess } from "../security/access.js";
import { InboxTriageRepository } from "../inbox/repository.js";
import { loadInboxTriageConfig } from "../inbox/config.js";
import type { TriageEntry } from "../inbox/types.js";

// ---------------------------------------------------------------------------
// INBOX_DIGEST action
// ---------------------------------------------------------------------------

export const inboxDigestAction: Action = {
  name: "INBOX_DIGEST",
  similes: [
    "DAILY_DIGEST",
    "INBOX_SUMMARY",
    "MESSAGE_SUMMARY",
    "DAILY_BRIEFING",
  ],
  description:
    "Generate and send a daily summary of triaged inbox items across all channels. " +
    "Groups messages by urgency and channel. Admin/owner only.",

  validate: async (runtime, message) => hasAdminAccess(runtime, message),

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: HandlerOptions | undefined,
  ): Promise<ActionResult> => {
    if (!(await hasAdminAccess(runtime, message))) {
      return {
        text: "Permission denied: only the owner or admin may generate inbox digests.",
        success: false,
        values: { success: false, error: "PERMISSION_DENIED" },
        data: { actionName: "INBOX_DIGEST" },
      };
    }

    const config = loadInboxTriageConfig();
    const repo = new InboxTriageRepository(runtime);

    // 1. Get entries from the last 24 hours
    const sinceIso = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const entries = await repo.getRecentForDigest(sinceIso);

    if (entries.length === 0) {
      return {
        text: "No inbox activity in the last 24 hours. All clear.",
        success: true,
        values: { success: true, entryCount: 0 },
        data: { actionName: "INBOX_DIGEST" },
      };
    }

    // 2. Group by classification
    const urgent = entries.filter((e) => e.classification === "urgent");
    const needsReply = entries.filter(
      (e) => e.classification === "needs_reply" && !e.resolved,
    );
    const notify = entries.filter((e) => e.classification === "notify");
    const info = entries.filter((e) => e.classification === "info");
    const autoReplied = entries.filter((e) => e.autoReplied);
    const resolved = entries.filter((e) => e.resolved && !e.autoReplied);

    // 3. Build digest
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const lines: string[] = [`# Daily Inbox Summary — ${today}`];
    lines.push(
      `\n${entries.length} messages triaged across ${countSources(entries)} channels.`,
    );

    if (urgent.length > 0) {
      lines.push(`\n## Urgent (${urgent.length})`);
      for (const e of urgent) {
        lines.push(formatEntryLine(e));
      }
    }

    if (needsReply.length > 0) {
      lines.push(`\n## Needs Reply (${needsReply.length})`);
      for (const e of needsReply) {
        lines.push(formatEntryLine(e));
      }
    }

    if (notify.length > 0) {
      lines.push(`\n## Notifications (${notify.length})`);
      for (const e of notify.slice(0, 10)) {
        lines.push(formatEntryLine(e));
      }
      if (notify.length > 10) {
        lines.push(`  ...and ${notify.length - 10} more`);
      }
    }

    if (autoReplied.length > 0) {
      lines.push(`\n## Auto-Replied (${autoReplied.length})`);
      for (const e of autoReplied) {
        const draft = e.draftResponse
          ? ` — replied: "${e.draftResponse.slice(0, 60)}..."`
          : "";
        lines.push(
          `- **${e.channelName}** (${e.source}): "${e.snippet.slice(0, 80)}"${draft}`,
        );
      }
    }

    if (resolved.length > 0) {
      lines.push(`\n## Resolved (${resolved.length})`);
      lines.push(
        `  ${resolved.length} items were addressed during the day.`,
      );
    }

    if (info.length > 0) {
      lines.push(`\n## Informational (${info.length})`);
      lines.push(
        `  ${info.length} informational messages were logged.`,
      );
    }

    const digestText = lines.join("\n");

    // 4. Send digest to owner
    const deliveryChannel = config.digestDeliveryChannel ?? "client_chat";
    try {
      const { resolveAdminEntityId } = await import("./send-message.js");
      const adminEntityId = await resolveAdminEntityId(runtime, message);

      await runtime.sendMessageToTarget(
        {
          source: deliveryChannel,
          entityId: adminEntityId,
        } as Parameters<typeof runtime.sendMessageToTarget>[0],
        {
          text: digestText,
          source: deliveryChannel,
          metadata: { digestType: "inbox_daily" },
        },
      );
    } catch (err) {
      logger.warn(
        "[INBOX_DIGEST] Failed to deliver digest:",
        String(err),
      );
    }

    return {
      text: digestText,
      success: true,
      values: {
        success: true,
        entryCount: entries.length,
        urgent: urgent.length,
        needsReply: needsReply.length,
        autoReplied: autoReplied.length,
      },
      data: { actionName: "INBOX_DIGEST" },
    };
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEntryLine(entry: TriageEntry): string {
  const resolvedTag = entry.resolved ? " [resolved]" : "";
  const link = entry.deepLink ? `\n  ${entry.deepLink}` : "";
  return (
    `- **${entry.channelName}** (${entry.source}): "${entry.snippet.slice(0, 100)}"${resolvedTag}` +
    link
  );
}

function countSources(entries: TriageEntry[]): number {
  return new Set(entries.map((e) => e.source)).size;
}
