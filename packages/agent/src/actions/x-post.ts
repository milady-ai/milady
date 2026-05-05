import type {
  Action,
  ActionResult,
  HandlerOptions,
  Memory,
} from "@elizaos/core";
import {
  postToX,
  readXPosterCredentialsFromEnv,
} from "../lifeops/x-poster.js";

type XPostParams = {
  text?: string;
};

const MAX_TWEET_CHARS = 280;

const REQUIRED_ENV_VARS = [
  "TWITTER_API_KEY",
  "TWITTER_API_SECRET_KEY",
  "TWITTER_ACCESS_TOKEN",
  "TWITTER_ACCESS_TOKEN_SECRET",
] as const;

function getMissingCredentialNames(env: NodeJS.ProcessEnv): string[] {
  return REQUIRED_ENV_VARS.filter((name) => !env[name]?.trim());
}

function isDryRun(env: NodeJS.ProcessEnv): boolean {
  return env.TWITTER_DRY_RUN?.toLowerCase() === "true";
}

function extractPostTextFromMessage(message: Memory): string | undefined {
  const rawText = message.content?.text;
  if (typeof rawText !== "string") return undefined;

  const trimmed = rawText.trim();
  if (!trimmed) return undefined;

  const direct = trimmed.match(
    /^(?:please\s+)?(?:post|tweet|share)\s+(?:this\s+)?(?:to|on)?\s*(?:x|twitter)?\s*[:\-]?\s*(.+)$/i,
  );
  if (direct?.[1]?.trim()) return direct[1].trim();

  const quoted = trimmed.match(/["“](.+?)["”]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  return undefined;
}

function getPostText(
  message: Memory,
  options?: HandlerOptions,
): string | undefined {
  const params = options?.parameters as XPostParams | undefined;
  const explicit = params?.text?.trim();
  if (explicit) return explicit;

  return extractPostTextFromMessage(message);
}

function failure(text: string, error: string): ActionResult {
  return {
    text,
    success: false,
    values: { success: false, error },
    data: { actionName: "POST_TO_X" },
  };
}

export const postToXAction: Action = {
  name: "POST_TO_X",

  similes: [
    "TWEET",
    "POST_TWEET",
    "SEND_TWEET",
    "POST_ON_X",
    "POST_ON_TWITTER",
    "SHARE_ON_X",
    "SHARE_ON_TWITTER",
  ],

  description:
    "Post one explicit short text update to the bot's connected X/Twitter " +
    "account. Use only when the user directly asks to tweet, post, or share " +
    "specific text on X/Twitter. Do not use for ordinary chat replies.",

  validate: async (_runtime, message) => {
    const text = message.content?.text;
    if (typeof text !== "string") return false;
    if (
      !(
        /\b(tweet|post|share)\b/i.test(text) &&
        /\b(x|twitter|tweet)\b/i.test(text)
      )
    ) {
      return false;
    }
    return (
      isDryRun(process.env) ||
      getMissingCredentialNames(process.env).length === 0
    );
  },

  handler: async (_runtime, message, _state, options) => {
    const text = getPostText(
      message,
      options as HandlerOptions | undefined,
    );

    if (!text) {
      return failure(
        "Blocked: tell me the exact text to post to X.",
        "MISSING_TEXT",
      );
    }

    if (text.length > MAX_TWEET_CHARS) {
      return failure(
        `Blocked: X post is ${text.length} characters; keep it at ${MAX_TWEET_CHARS} or less.`,
        "TEXT_TOO_LONG",
      );
    }

    if (isDryRun(process.env)) {
      return {
        text: `X dry run: would post "${text}". Set TWITTER_DRY_RUN=false after the account keys are ready to actually publish.`,
        success: true,
        values: { success: true, dryRun: true },
        data: { actionName: "POST_TO_X", text },
      };
    }

    const missing = getMissingCredentialNames(process.env);
    if (missing.length > 0) {
      return failure(
        `Blocked: X credentials missing (${missing.join(", ")}). Add them to the runtime env and restart botdick.`,
        "MISSING_CREDENTIALS",
      );
    }

    const credentials = readXPosterCredentialsFromEnv(process.env);
    if (!credentials) {
      return failure(
        "Blocked: X credentials are present but invalid or empty. Check the TWITTER_* env vars and restart botdick.",
        "INVALID_CREDENTIALS",
      );
    }

    const result = await postToX({ text, credentials });
    if (!result.ok) {
      const detail = result.error ? `: ${result.error}` : "";
      return failure(
        `Blocked: X post failed (${result.category})${detail}`,
        "POST_FAILED",
      );
    }

    const url = result.postId
      ? `https://x.com/i/web/status/${result.postId}`
      : undefined;

    return {
      text: url ? `Posted to X: ${url}` : "Posted to X.",
      success: true,
      values: { success: true, postId: result.postId, url },
      data: { actionName: "POST_TO_X", text, postId: result.postId, url },
    };
  },

  parameters: [
    {
      name: "text",
      description: "Exact text to publish to X/Twitter, 280 characters max.",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};
