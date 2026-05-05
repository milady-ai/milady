import type {
  Action,
  ActionResult,
  HandlerOptions,
  Memory,
} from "@elizaos/core";
import * as browserWorkspace from "../services/browser-workspace.js";

type XBrowserPostParams = {
  text?: string;
  publish?: boolean;
};

const MAX_TWEET_CHARS = 280;
const X_COMPOSE_URL = "https://x.com/compose/post";

function getMessageText(message: Memory): string {
  return typeof message.content?.text === "string" ? message.content.text : "";
}

function isExplicitXPostIntent(text: string): boolean {
  return (
    /\b(tweet|post|share)\b/i.test(text) && /\b(x|twitter|tweet)\b/i.test(text)
  );
}

function shouldPublish(text: string, params?: XBrowserPostParams): boolean {
  if (typeof params?.publish === "boolean") return params.publish;
  return isExplicitXPostIntent(text);
}

function extractPostTextFromMessage(message: Memory): string | undefined {
  const rawText = getMessageText(message).trim();
  if (!rawText) return undefined;

  const direct = rawText.match(
    /^(?:please\s+)?(?:post|tweet|share)\s+(?:this\s+)?(?:to|on)?\s*(?:x|twitter)?\s*[:\-]?\s*(.+)$/i,
  );
  if (direct?.[1]?.trim()) return direct[1].trim();

  const quoted = rawText.match(/["“](.+?)["”]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  return undefined;
}

function getPostText(
  message: Memory,
  options?: HandlerOptions,
): string | undefined {
  const params = options?.parameters as XBrowserPostParams | undefined;
  const explicit = params?.text?.trim();
  if (explicit) return explicit;

  return extractPostTextFromMessage(message);
}

function failure(text: string, error: string): ActionResult {
  return {
    text,
    success: false,
    values: { success: false, error },
    data: { actionName: "POST_TO_X_BROWSER" },
  };
}

function createComposeScript(text: string): string {
  return `
(() => {
  const text = ${JSON.stringify(text)};
  const editor =
    document.querySelector('[data-testid="tweetTextarea_0"]') ||
    document.querySelector('[role="textbox"][contenteditable="true"]');
  if (!editor) {
    return {
      ok: false,
      reason: "X composer text box was not found.",
      title: document.title,
      url: location.href,
    };
  }

  editor.focus();
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, text);
  } catch {
    inserted = false;
  }

  if (!inserted) {
    editor.textContent = text;
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: text,
        inputType: "insertText",
      }),
    );
  }

  return {
    ok: true,
    title: document.title,
    textLength: text.length,
    url: location.href,
  };
})()
`.trim();
}

function createClickPostScript(): string {
  return `
(() => {
  const isVisible = (element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  };
  const buttons = Array.from(
    document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'),
  );
  const button = buttons.find((candidate) => {
    const ariaDisabled = candidate.getAttribute("aria-disabled");
    return isVisible(candidate) && ariaDisabled !== "true" && !candidate.disabled;
  });
  if (!button) {
    return {
      clicked: false,
      reason: "Enabled X Post button was not found.",
      title: document.title,
      url: location.href,
    };
  }
  button.click();
  return {
    clicked: true,
    title: document.title,
    url: location.href,
  };
})()
`.trim();
}

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

export const postToXBrowserAction: Action = {
  name: "POST_TO_X_BROWSER",

  similes: [
    "TWEET_WITH_BROWSER",
    "POST_TWEET_BROWSER",
    "POST_ON_X_BROWSER",
    "POST_ON_TWITTER_BROWSER",
    "SHARE_ON_X_BROWSER",
  ],

  description:
    "Post one explicit short text update to the logged-in X/Twitter account " +
    "by controlling the Milady desktop browser workspace. Use this when the " +
    "user asks to post/tweet/share specific text on X and API credentials are " +
    "not configured or browser posting is preferred. Requires the desktop " +
    "browser workspace bridge to be configured and logged into X.",

  validate: async (_runtime, message) => {
    return isExplicitXPostIntent(getMessageText(message));
  },

  handler: async (_runtime, message, _state, options) => {
    const params = (options as HandlerOptions | undefined)?.parameters as
      | XBrowserPostParams
      | undefined;
    const messageText = getMessageText(message);
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

    if (!browserWorkspace.isBrowserWorkspaceBridgeConfigured(process.env)) {
      return failure(
        "Blocked: Milady browser workspace bridge is not configured. Open the desktop browser workspace or set MILADY_BROWSER_WORKSPACE_URL, then try again.",
        "BROWSER_BRIDGE_UNAVAILABLE",
      );
    }

    const publish =
      shouldPublish(messageText, params) &&
      !isTruthyEnv(process.env.X_BROWSER_DRY_RUN);

    try {
      const openResult = await browserWorkspace.executeBrowserWorkspaceCommand({
        subaction: "open",
        url: X_COMPOSE_URL,
        show: true,
        title: "X Compose",
      });
      const tabId = openResult.tab?.id;

      await browserWorkspace.executeBrowserWorkspaceCommand({
        subaction: "wait",
        id: tabId,
        selector:
          '[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"]',
        state: "visible",
        timeoutMs: 20_000,
      });

      const composeResult =
        await browserWorkspace.executeBrowserWorkspaceCommand({
          subaction: "eval",
          id: tabId,
          script: createComposeScript(text),
        });

      const composeValue = composeResult.value as
        | { ok?: boolean; reason?: string }
        | undefined;
      if (!composeValue?.ok) {
        return failure(
          `Blocked: ${composeValue?.reason ?? "X composer could not be filled."}`,
          "COMPOSE_FAILED",
        );
      }

      if (!publish) {
        return {
          text:
            "Prepared an X draft in the browser. Say to publish/post it when ready.",
          success: true,
          values: { success: true, prepared: true, published: false },
          data: { actionName: "POST_TO_X_BROWSER", text, tabId },
        };
      }

      const clickResult = await browserWorkspace.executeBrowserWorkspaceCommand({
        subaction: "eval",
        id: tabId,
        script: createClickPostScript(),
      });
      const clickValue = clickResult.value as
        | { clicked?: boolean; reason?: string }
        | undefined;
      if (!clickValue?.clicked) {
        return failure(
          `Blocked: ${clickValue?.reason ?? "X Post button could not be clicked."}`,
          "POST_BUTTON_FAILED",
        );
      }

      return {
        text: "Posted to X from the browser.",
        success: true,
        values: { success: true, published: true },
        data: { actionName: "POST_TO_X_BROWSER", text, tabId },
      };
    } catch (error) {
      return failure(
        `Blocked: browser X post failed: ${error instanceof Error ? error.message : String(error)}`,
        "BROWSER_POST_FAILED",
      );
    }
  },

  parameters: [
    {
      name: "text",
      description: "Exact text to publish to X/Twitter, 280 characters max.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "publish",
      description:
        "Set false to prepare a browser draft without clicking Post. Explicit post/tweet requests publish unless X_BROWSER_DRY_RUN is true.",
      required: false,
      schema: { type: "boolean" as const },
    },
  ],
};
