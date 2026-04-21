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
import {
  looksLikeInboxConfirmation,
  reflectOnSendConfirmation,
} from "../inbox/reflection.js";
import type { DeferredInboxDraft, TriageEntry } from "../inbox/types.js";

// ---------------------------------------------------------------------------
// Params extracted from LLM
// ---------------------------------------------------------------------------

type InboxRespondParams = {
  /** Triage entry ID (if the user references a specific entry). */
  entryId?: string;
  /** Target name/channel the user wants to respond to. */
  target?: string;
  /** Pre-composed message text the user wants to send. */
  messageText?: string;
  /** If true, user is confirming a previous draft. */
  confirmed?: boolean;
};

// ---------------------------------------------------------------------------
// INBOX_RESPOND action
// ---------------------------------------------------------------------------

export const inboxRespondAction: Action = {
  name: "INBOX_RESPOND",
  similes: [
    "REPLY_INBOX",
    "RESPOND_TO_MESSAGE",
    "REPLY_TO",
    "SEND_INBOX_REPLY",
  ],
  description:
    "Draft and send a response to a triaged inbox message. " +
    "The agent drafts a reply, presents it for confirmation, then sends " +
    "through the original channel after explicit owner approval. " +
    "Admin/owner only.",

  validate: async (runtime, message) => hasAdminAccess(runtime, message),

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: HandlerOptions | undefined,
  ): Promise<ActionResult> => {
    if (!(await hasAdminAccess(runtime, message))) {
      return {
        text: "Permission denied: only the owner or admin may respond to inbox items.",
        success: false,
        values: { success: false, error: "PERMISSION_DENIED" },
        data: { actionName: "INBOX_RESPOND" },
      };
    }

    const params = ((options as HandlerOptions | undefined)?.parameters ??
      {}) as InboxRespondParams;
    const repo = new InboxTriageRepository(runtime);
    const userText = extractText(message);

    // ── Check for pending draft confirmation ──────────────────────────
    const pendingDraft = latestPendingDraft(state);
    if (pendingDraft && (params.confirmed || looksLikeInboxConfirmation(userText))) {
      return handleConfirmation(runtime, message, pendingDraft, userText, repo);
    }

    // ── Find the triage entry to respond to ──────────────────────────
    let entry: TriageEntry | null = null;

    if (params.entryId) {
      entry = await repo.getById(params.entryId);
    }

    if (!entry && params.target) {
      // Search by target name/channel
      const unresolved = await repo.getUnresolved({ limit: 50 });
      entry = findBestMatch(unresolved, params.target);
    }

    if (!entry) {
      // If no specific target, grab the most urgent unresolved item
      const unresolved = await repo.getUnresolved({ limit: 5 });
      const needsReply = unresolved.filter(
        (e) =>
          e.classification === "needs_reply" ||
          e.classification === "urgent",
      );
      if (needsReply.length === 0) {
        return {
          text: "No pending inbox items need a reply right now. Use INBOX_TRIAGE to scan for new messages.",
          success: true,
          values: { success: true },
          data: { actionName: "INBOX_RESPOND" },
        };
      }
      if (needsReply.length === 1) {
        entry = needsReply[0];
      } else {
        // Multiple items — ask user to be specific
        const itemList = needsReply
          .map(
            (e) =>
              `- **${e.channelName}** (${e.source}): "${e.snippet.slice(0, 60)}"`,
          )
          .join("\n");
        return {
          text: `Multiple items need a reply. Which one?\n\n${itemList}\n\nSay "respond to [name/channel]" to pick one.`,
          success: true,
          values: { success: true, pendingCount: needsReply.length },
          data: { actionName: "INBOX_RESPOND" },
        };
      }
    }

    if (!entry) {
      return {
        text: "Could not find the inbox item you want to respond to.",
        success: false,
        values: { success: false, error: "NOT_FOUND" },
        data: { actionName: "INBOX_RESPOND" },
      };
    }

    // ── Draft a response ─────────────────────────────────────────────
    const draftText = params.messageText
      ? params.messageText
      : await draftResponse(runtime, entry, userText);

    const draft: DeferredInboxDraft = {
      triageEntryId: entry.id,
      source: entry.source,
      targetRoomId: entry.sourceRoomId
        ? (entry.sourceRoomId as UUID)
        : undefined,
      targetEntityId: entry.sourceEntityId
        ? (entry.sourceEntityId as UUID)
        : undefined,
      gmailMessageId: entry.source === "gmail" ? entry.sourceMessageId ?? undefined : undefined,
      draftText,
      deepLink: entry.deepLink,
      channelName: entry.channelName,
      senderName: entry.senderName ?? "Unknown",
    };

    return {
      text:
        `I'll send this to **${draft.senderName}** on **${draft.channelName}** (${draft.source}):\n\n` +
        `> ${draftText}\n\n` +
        `Say **"send it"** to confirm, or tell me what to change.`,
      success: true,
      values: { success: true, awaitingConfirmation: true },
      data: {
        actionName: "INBOX_RESPOND",
        inboxDraft: draft,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Draft generation
// ---------------------------------------------------------------------------

async function draftResponse(
  runtime: IAgentRuntime,
  entry: TriageEntry,
  userHint: string,
): Promise<string> {
  // If we already have a suggested response from triage, use as seed
  const seed = entry.suggestedResponse ?? "";

  const contextLines = entry.threadContext
    ? entry.threadContext.join("\n")
    : "";

  const prompt = [
    "Draft a brief, natural response to the following message.",
    "Match the tone and formality of the conversation.",
    "",
    `From: ${entry.senderName ?? "Unknown"}`,
    `Channel: ${entry.channelName} (${entry.source})`,
    `Their message: "${entry.snippet}"`,
    contextLines ? `Recent context:\n${contextLines}` : "",
    seed ? `Suggested starting point: "${seed}"` : "",
    userHint ? `Owner's guidance: "${userHint}"` : "",
    "",
    "Write ONLY the response text. Do not include any explanation or metadata.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await runtime.useModel(ModelType.TEXT_SMALL, { prompt });
    const text = typeof result === "string" ? result.trim() : "";
    return text || seed || "Thanks for reaching out. I'll get back to you soon.";
  } catch {
    return seed || "Thanks for reaching out. I'll get back to you soon.";
  }
}

// ---------------------------------------------------------------------------
// Confirmation handling
// ---------------------------------------------------------------------------

async function handleConfirmation(
  runtime: IAgentRuntime,
  message: Memory,
  draft: DeferredInboxDraft,
  userText: string,
  repo: InboxTriageRepository,
): Promise<ActionResult> {
  // Reflection safety check
  const reflection = await reflectOnSendConfirmation(runtime, {
    userMessage: userText,
    draftText: draft.draftText,
    channelName: draft.channelName,
    recipientName: draft.senderName,
  });

  if (!reflection.confirmed) {
    return {
      text: `I wasn't sure you confirmed — ${reflection.reasoning}. Please say **"yes, send it"** to confirm.`,
      success: true,
      values: { success: true, awaitingConfirmation: true },
      data: { actionName: "INBOX_RESPOND", inboxDraft: draft },
    };
  }

  // Send the message through the original channel
  try {
    if (draft.source === "gmail" && draft.gmailMessageId) {
      const { LifeOpsService } = await import("../lifeops/service.js");
      const service = new LifeOpsService(runtime);
      await service.sendGmailReply(new URL("http://127.0.0.1/"), {
        messageId: draft.gmailMessageId,
        bodyText: draft.draftText,
      });
    } else if (draft.targetRoomId) {
      await runtime.sendMessageToTarget(
        {
          source: draft.source,
          roomId: draft.targetRoomId,
        } as Parameters<typeof runtime.sendMessageToTarget>[0],
        { text: draft.draftText, source: draft.source },
      );
    } else {
      return {
        text: "Cannot send: no target room or message ID available for this channel.",
        success: false,
        values: { success: false, error: "NO_TARGET" },
        data: { actionName: "INBOX_RESPOND" },
      };
    }
  } catch (err) {
    return {
      text: `Failed to send message: ${String(err)}`,
      success: false,
      values: { success: false, error: "SEND_FAILED" },
      data: { actionName: "INBOX_RESPOND" },
    };
  }

  // Mark resolved and store as example
  await repo.markResolved(draft.triageEntryId, {
    draftResponse: draft.draftText,
  });

  // Store as few-shot example for future learning
  const entry = await repo.getById(draft.triageEntryId);
  if (entry) {
    await repo.storeExample({
      source: entry.source,
      snippet: entry.snippet,
      classification: entry.classification,
      ownerAction: "confirmed",
      contextJson: {
        senderName: entry.senderName,
        channelName: entry.channelName,
        draftResponse: draft.draftText,
      },
    });
  }

  return {
    text: `Message sent to **${draft.senderName}** on **${draft.channelName}**.`,
    success: true,
    values: { success: true, sent: true },
    data: { actionName: "INBOX_RESPOND", sent: true },
  };
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function latestPendingDraft(
  state: State | undefined,
): DeferredInboxDraft | null {
  if (!state || typeof state !== "object") return null;

  const stateRecord = state as Record<string, unknown>;
  const data =
    stateRecord.data && typeof stateRecord.data === "object"
      ? (stateRecord.data as Record<string, unknown>)
      : undefined;
  const actionResults = Array.isArray(data?.actionResults)
    ? (data.actionResults as Array<{ data?: Record<string, unknown> }>)
    : [];

  // Check action results (newest first)
  for (let i = actionResults.length - 1; i >= 0; i--) {
    const draft = actionResults[i]?.data?.inboxDraft as
      | DeferredInboxDraft
      | undefined;
    if (draft?.triageEntryId && draft?.draftText) {
      return draft;
    }
  }

  // Check recent messages
  const recentMessagesData =
    stateRecord.recentMessagesData ?? stateRecord.recentMessages;
  if (Array.isArray(recentMessagesData)) {
    for (let i = recentMessagesData.length - 1; i >= 0; i--) {
      const item = recentMessagesData[i] as Record<string, unknown> | null;
      if (!item) continue;
      const content = item.content as Record<string, unknown> | undefined;
      if (!content) continue;

      const draft =
        (content.inboxDraft as DeferredInboxDraft | undefined) ??
        ((content.data as Record<string, unknown> | undefined)
          ?.inboxDraft as DeferredInboxDraft | undefined);
      if (draft?.triageEntryId && draft?.draftText) {
        return draft;
      }
    }
  }

  return null;
}

function findBestMatch(
  entries: TriageEntry[],
  target: string,
): TriageEntry | null {
  const lower = target.toLowerCase();
  // Exact channel name match
  const exact = entries.find(
    (e) => e.channelName.toLowerCase() === lower,
  );
  if (exact) return exact;

  // Sender name match
  const senderMatch = entries.find(
    (e) => e.senderName?.toLowerCase().includes(lower),
  );
  if (senderMatch) return senderMatch;

  // Partial channel name match
  const partial = entries.find(
    (e) => e.channelName.toLowerCase().includes(lower),
  );
  if (partial) return partial;

  // Source match
  const sourceMatch = entries.find(
    (e) => e.source.toLowerCase() === lower,
  );
  if (sourceMatch) return sourceMatch;

  return null;
}

function extractText(message: Memory): string {
  const content = message.content as { text?: unknown } | undefined;
  return typeof content?.text === "string" ? content.text : "";
}
