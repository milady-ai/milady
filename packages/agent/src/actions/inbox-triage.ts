import type {
  Action,
  ActionResult,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { logger } from "@elizaos/core";
import { hasAdminAccess } from "../security/access.js";
import { InboxTriageRepository } from "../inbox/repository.js";
import { fetchAllMessages } from "../inbox/message-fetcher.js";
import {
  applyTriageRules,
  classifyMessages,
} from "../inbox/triage-classifier.js";
import { reflectOnAutoReply } from "../inbox/reflection.js";
import type {
  InboundMessage,
  InboxTriageConfig,
  TriageResult,
} from "../inbox/types.js";
import { loadInboxTriageConfig } from "../inbox/config.js";

// ---------------------------------------------------------------------------
// INBOX_TRIAGE action
// ---------------------------------------------------------------------------

export const inboxTriageAction: Action = {
  name: "INBOX_TRIAGE",
  similes: ["TRIAGE_INBOX", "CHECK_INBOX", "SCAN_MESSAGES", "CHECK_MESSAGES"],
  description:
    "Scan all connected channels (Discord, Telegram, Signal, iMessage, Gmail, etc.) " +
    "for new messages, classify them by urgency and importance, and escalate " +
    "urgent items. Admin/owner only.",

  validate: async (runtime, message) => hasAdminAccess(runtime, message),

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: HandlerOptions | undefined,
  ): Promise<ActionResult> => {
    if (!(await hasAdminAccess(runtime, message))) {
      return {
        text: "Permission denied: only the owner or admin may run inbox triage.",
        success: false,
        values: { success: false, error: "PERMISSION_DENIED" },
        data: { actionName: "INBOX_TRIAGE" },
      };
    }

    const config = loadInboxTriageConfig();
    const repo = new InboxTriageRepository(runtime);

    // 1. Determine "since" window — check the most recent triage entry
    const recentEntries = await repo.getUnresolved({ limit: 1 });
    const lastTriageAt = recentEntries.length > 0
      ? recentEntries[0].createdAt
      : new Date(Date.now() - 60 * 60 * 1000).toISOString(); // default: last hour

    // 2. Fetch messages from all channels
    const allMessages = await fetchAllMessages(runtime, {
      sources: config.channels,
      sinceIso: lastTriageAt,
      limit: 200,
    });

    if (allMessages.length === 0) {
      return {
        text: "No new messages to triage.",
        success: true,
        values: { success: true, triaged: 0 },
        data: { actionName: "INBOX_TRIAGE" },
      };
    }

    // 3. Deduplicate against already-triaged messages
    const newMessages: InboundMessage[] = [];
    for (const msg of allMessages) {
      const existing = await repo.getBySourceMessageId(msg.id);
      if (!existing) {
        newMessages.push(msg);
      }
    }

    if (newMessages.length === 0) {
      return {
        text: "All recent messages have already been triaged.",
        success: true,
        values: { success: true, triaged: 0, skippedDuplicates: allMessages.length },
        data: { actionName: "INBOX_TRIAGE" },
      };
    }

    // 4. Apply rule-based pre-classification
    const needsLlm: InboundMessage[] = [];
    const ruleResults = new Map<string, TriageResult>();

    for (const msg of newMessages) {
      const ruleClassification = applyTriageRules(
        msg,
        config.triageRules,
        config,
      );
      if (ruleClassification) {
        ruleResults.set(msg.id, {
          classification: ruleClassification,
          urgency:
            ruleClassification === "urgent"
              ? "high"
              : ruleClassification === "ignore"
                ? "low"
                : "medium",
          confidence: 0.95,
          reasoning: `Rule-based classification: ${ruleClassification}`,
        });
      } else {
        needsLlm.push(msg);
      }
    }

    // 5. LLM classification for remaining messages
    const examples = await repo.getExamples(5);
    const llmResults = await classifyMessages(runtime, needsLlm, {
      config,
      examples,
    });

    // 6. Merge results and store
    let countUrgent = 0;
    let countNeedsReply = 0;
    let countAutoReplied = 0;
    let countIgnored = 0;
    let countStored = 0;

    for (const msg of newMessages) {
      const result =
        ruleResults.get(msg.id) ??
        llmResults[needsLlm.indexOf(msg)] ??
        null;
      if (!result) continue;

      if (result.classification === "ignore") {
        countIgnored++;
        continue;
      }

      // Store the triage entry
      const entry = await repo.storeTriage({
        source: msg.source,
        sourceRoomId: msg.roomId,
        sourceEntityId: msg.entityId,
        sourceMessageId: msg.id,
        channelName: msg.channelName,
        channelType: msg.channelType,
        deepLink: msg.deepLink,
        classification: result.classification,
        urgency: result.urgency,
        confidence: result.confidence,
        snippet: msg.snippet,
        senderName: msg.senderName,
        threadContext: msg.threadMessages,
        triageReasoning: result.reasoning,
        suggestedResponse: result.suggestedResponse,
      });
      countStored++;

      // Track counts
      if (result.classification === "urgent") countUrgent++;
      if (result.classification === "needs_reply") countNeedsReply++;

      // 7. Escalate urgent items
      if (result.classification === "urgent") {
        try {
          const { EscalationService } = await import(
            "../services/escalation.js"
          );
          const linkText = msg.deepLink ? `\n${msg.deepLink}` : "";
          await EscalationService.startEscalation(
            runtime,
            `Urgent message from ${msg.senderName} on ${msg.source}`,
            `[URGENT] ${msg.channelName}: "${msg.snippet}"${linkText}`,
          );
        } catch (err) {
          logger.warn("[INBOX_TRIAGE] Escalation failed:", String(err));
        }
      }

      // 8. Auto-reply check
      if (
        result.classification === "needs_reply" &&
        result.suggestedResponse &&
        config.autoReply?.enabled
      ) {
        const autoReplyResult = await tryAutoReply(
          runtime,
          msg,
          result,
          entry.id,
          config,
          repo,
        );
        if (autoReplyResult) countAutoReplied++;
      }
    }

    // 9. Cleanup old resolved entries
    if (config.retentionDays) {
      const cutoff = new Date(
        Date.now() - config.retentionDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      const cleaned = await repo.cleanupOlderThan(cutoff);
      if (cleaned > 0) {
        logger.info(`[INBOX_TRIAGE] Cleaned up ${cleaned} old triage entries`);
      }
    }

    const summary = [
      `Triaged ${newMessages.length} new messages:`,
      countUrgent > 0 ? `${countUrgent} urgent (escalated)` : null,
      countNeedsReply > 0 ? `${countNeedsReply} need reply` : null,
      countAutoReplied > 0 ? `${countAutoReplied} auto-replied` : null,
      countIgnored > 0 ? `${countIgnored} ignored` : null,
      `${countStored} stored for review`,
    ]
      .filter(Boolean)
      .join(", ");

    return {
      text: summary,
      success: true,
      values: {
        success: true,
        triaged: newMessages.length,
        urgent: countUrgent,
        needsReply: countNeedsReply,
        autoReplied: countAutoReplied,
        ignored: countIgnored,
      },
      data: { actionName: "INBOX_TRIAGE" },
    };
  },
};

// ---------------------------------------------------------------------------
// Auto-reply helper
// ---------------------------------------------------------------------------

async function tryAutoReply(
  runtime: IAgentRuntime,
  msg: InboundMessage,
  result: TriageResult,
  entryId: string,
  config: InboxTriageConfig,
  repo: InboxTriageRepository,
): Promise<boolean> {
  const autoConfig = config.autoReply;
  if (!autoConfig?.enabled) return false;

  const threshold = autoConfig.confidenceThreshold ?? 0.85;
  if (result.confidence < threshold) return false;

  // Sender whitelist check
  if (autoConfig.senderWhitelist?.length) {
    const senderId = msg.entityId ?? msg.senderName;
    if (
      !autoConfig.senderWhitelist.some(
        (s) => s.toLowerCase() === senderId.toLowerCase(),
      )
    ) {
      return false;
    }
  }

  // Channel whitelist check
  if (autoConfig.channelWhitelist?.length) {
    if (!autoConfig.channelWhitelist.includes(msg.source)) {
      return false;
    }
  }

  // Rate limit check
  const maxPerHour = autoConfig.maxAutoRepliesPerHour ?? 5;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentAutoCount = await repo.countAutoRepliesSince(oneHourAgo);
  if (recentAutoCount >= maxPerHour) {
    logger.info("[INBOX_TRIAGE] Auto-reply rate limit reached");
    return false;
  }

  // Reflection safety check
  const reflection = await reflectOnAutoReply(runtime, {
    inboundText: msg.text,
    replyText: result.suggestedResponse!,
    source: msg.source,
    senderName: msg.senderName,
  });

  if (!reflection.approved) {
    logger.info(
      `[INBOX_TRIAGE] Auto-reply rejected by reflection: ${reflection.reasoning}`,
    );
    return false;
  }

  // Send the auto-reply
  try {
    if (msg.source === "gmail" && msg.gmailMessageId) {
      // Gmail: use lifeops service
      const { LifeOpsService } = await import("../lifeops/service.js");
      const service = new LifeOpsService(runtime);
      await service.sendGmailReply(new URL("http://127.0.0.1/"), {
        messageId: msg.gmailMessageId,
        bodyText: result.suggestedResponse!,
      });
    } else if (msg.roomId) {
      // Chat channels: use runtime send handler
      await runtime.sendMessageToTarget(
        {
          source: msg.source,
          roomId: msg.roomId as Parameters<typeof runtime.sendMessageToTarget>[0]["roomId"],
        } as Parameters<typeof runtime.sendMessageToTarget>[0],
        { text: result.suggestedResponse!, source: msg.source },
      );
    } else {
      return false;
    }

    await repo.markResolved(entryId, {
      draftResponse: result.suggestedResponse!,
      autoReplied: true,
    });
    logger.info(
      `[INBOX_TRIAGE] Auto-replied to ${msg.senderName} on ${msg.source}`,
    );
    return true;
  } catch (err) {
    logger.warn("[INBOX_TRIAGE] Auto-reply send failed:", String(err));
    return false;
  }
}
