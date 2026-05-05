import type {
  Action,
  ActionResult,
  HandlerOptions,
  Memory,
  State,
} from "@elizaos/core";
import { createXDraftSuggestions } from "../x-autonomy/runtime.js";

type XDraftParams = {
  count?: number;
};

const DEFAULT_ACTION_DRAFT_COUNT = 2;
const DEFAULT_EVENTS_URL = "https://botdick.com/api/events";

function getMessageText(message: Memory): string {
  const text = message.content?.text;
  return typeof text === "string" ? text.trim() : "";
}

function getRecentMessageTexts(state?: State): string[] {
  if (!state) return [];
  const recent =
    (state as Record<string, unknown>).recentMessages ??
    (state as Record<string, unknown>).recentMessagesData ??
    [];
  if (!Array.isArray(recent)) return [];

  return recent
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const content = (item as Record<string, unknown>).content;
      if (!content || typeof content !== "object") return "";
      const text = (content as Record<string, unknown>).text;
      return typeof text === "string" ? text.trim() : "";
    })
    .filter(Boolean);
}

function extractDraftCount(message: Memory, options?: HandlerOptions): number {
  const params = options?.parameters as XDraftParams | undefined;
  if (Number.isFinite(params?.count) && params?.count) {
    return Number(params.count);
  }

  const text = getMessageText(message);
  const explicit = text.match(/\b([1-4])\s+(?:x\s+)?(?:tweet|tweets|posts|drafts)\b/i);
  if (explicit?.[1]) return Number(explicit[1]);

  return DEFAULT_ACTION_DRAFT_COUNT;
}

export function isXDraftRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  if (
    /^(?:can i hear them|let me hear them|hear them|show them|show me them)\??$/.test(
      normalized,
    )
  ) {
    return true;
  }

  const mentionsX =
    /\b(?:tweet|tweets|twitter|x post|x posts|posts for x|x drafts?)\b/i.test(
      normalized,
    );
  const asksForDrafts =
    /\b(?:write|draft|make|generate|give|show|suggest|cook|hear|ideas?|couple|some)\b/i.test(
      normalized,
    );
  const publishIntent =
    /\b(?:publish|send|share)\b/i.test(normalized) ||
    /^\s*(?:please\s+)?post\b/i.test(normalized);

  return mentionsX && asksForDrafts && !publishIntent;
}

function isXDraftFollowup(text: string, state?: State): boolean {
  const normalized = text.trim().toLowerCase().replace(/[?!.,]+$/g, "");
  if (!normalized) return false;

  const confirmation =
    /^(?:yes|yeah|yep|sure|please|pls|do it|go ahead|run it|more|again|another|another batch|any more|any more or)(?:\s+(?:please|pls|now|do it|go ahead|hello|buddy))*$/.test(
      normalized,
    );
  if (!confirmation) return false;

  const recentText = getRecentMessageTexts(state).slice(-8).join("\n").toLowerCase();
  return (
    /\bx drafts?:\b/.test(recentText) ||
    /\bwant me to generate\b[\s\S]{0,120}\btweet drafts?\b/.test(recentText) ||
    /\bgenerate\b[\s\S]{0,80}\bmore tweet drafts?\b/.test(recentText) ||
    /\btell me what angle to mutate\b/.test(recentText)
  );
}

function formatDraftResponse(items: Array<{ text: string }>): string {
  return [
    "X drafts:",
    ...items.map((item, index) => `${index + 1}. ${item.text}`),
    "",
    "Pick one to post, or give me a direction and I'll mutate them.",
  ].join("\n");
}

function readSetting(runtime: unknown, key: string): string {
  try {
    const value = (runtime as { getSetting?: (name: string) => unknown })?.getSetting?.(key);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

async function mirrorXDraftEvent(runtime: unknown, drafts: Array<{ text: string }>): Promise<void> {
  const eventsUrl =
    readSetting(runtime, "BOTDICK_HOMEPAGE_EVENTS_URL") ||
    process.env.BOTDICK_HOMEPAGE_EVENTS_URL ||
    DEFAULT_EVENTS_URL;
  const token =
    readSetting(runtime, "BOTDICK_INGEST_TOKEN") ||
    process.env.BOTDICK_INGEST_TOKEN ||
    "";

  try {
    await fetch(eventsUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        source: "DRAFT_X_POSTS",
        type: "x_draft",
        station: "social",
        title: "X drafts generated",
        body: drafts.map((item, index) => `${index + 1}. ${item.text}`).join("\n"),
        status: "drafted",
        createdAt: new Date().toISOString(),
        meta: { count: drafts.length },
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Mirroring should never block the actual Discord reply.
  }
}

export const draftXPostsAction: Action = {
  name: "DRAFT_X_POSTS",

  similes: [
    "DRAFT_TWEETS",
    "WRITE_TWEETS",
    "GENERATE_TWEETS",
    "SUGGEST_TWEETS",
    "X_DRAFTS",
    "TWEET_IDEAS",
  ],

  description:
    "Draft a few original X/Twitter post candidates in botdick's voice and " +
    "show them to the user. Use for requests like 'write some tweets', " +
    "'tweet ideas', or 'can I hear them'. This queues drafts but does not " +
    "publish them.",

  validate: async (_runtime, message, state) => {
    const text = getMessageText(message);
    return isXDraftRequest(text) || isXDraftFollowup(text, state);
  },

  handler: async (runtime, message, _state, options): Promise<ActionResult> => {
    const count = extractDraftCount(
      message,
      options as HandlerOptions | undefined,
    );
    const result = await createXDraftSuggestions(runtime, {
      count,
      source: "x-autonomy-discord-action",
      sendSuggestions: false,
    });

    if (result.items.length === 0) {
      return {
        text: "Blocked: I couldn't draft X posts from the current model response.",
        success: false,
        values: { success: false, error: "NO_DRAFTS" },
        data: { actionName: "DRAFT_X_POSTS" },
      };
    }

    void mirrorXDraftEvent(runtime, result.items);

    return {
      text: formatDraftResponse(result.items),
      success: true,
      values: {
        success: true,
        count: result.items.length,
        queued: Boolean(result.taskId),
      },
      data: {
        actionName: "DRAFT_X_POSTS",
        drafts: result.items.map((item) => item.text),
        queuedTaskId: result.taskId,
      },
    };
  },

  parameters: [
    {
      name: "count",
      description: "Number of draft X posts to generate, 1 to 4.",
      required: false,
      schema: { type: "number" as const, minimum: 1, maximum: 4 },
    },
  ],
};
