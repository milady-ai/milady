import type { Action, ActionExample } from "@elizaos/core";
import {
  formatWebsiteList,
  getSelfControlStatus,
  parseSelfControlBlockRequest,
  startSelfControlBlock,
} from "./selfcontrol";

function formatStatusText(
  status: Awaited<ReturnType<typeof getSelfControlStatus>>,
): string {
  if (!status.available) {
    return (
      status.reason ??
      "SelfControl is unavailable on this machine, so website blocking cannot run."
    );
  }

  if (!status.active) {
    return "No SelfControl block is active right now.";
  }

  const websites =
    status.websites.length > 0
      ? formatWebsiteList(status.websites)
      : "an unknown website set";
  return status.endsAt
    ? `A SelfControl block is active for ${websites} until ${status.endsAt}.`
    : `A SelfControl block is active for ${websites}.`;
}

export const selfControlBlockWebsitesAction: Action = {
  name: "SELFCONTROL_BLOCK_WEBSITES",
  similes: [
    "BLOCK_WEBSITES",
    "START_FOCUS_BLOCK",
    "BLOCK_SITE",
    "BLOCK_DISTRACTING_SITES",
  ],
  description:
    "Start a local website block with the installed SelfControl macOS app. " +
    "Use this to block public websites like x.com for a fixed duration. " +
    "Important: SelfControl cannot end an active block early.",
  validate: async () => true,
  handler: async (_runtime, message, _state, options) => {
    const parsed = parseSelfControlBlockRequest(options, message);
    if (!parsed.request) {
      return {
        success: false,
        text: parsed.error ?? "Could not parse the SelfControl block request.",
      };
    }

    const result = await startSelfControlBlock(parsed.request);
    if (!result.success) {
      return {
        success: false,
        text: result.error,
        data: result.status
          ? {
              active: result.status.active,
              endsAt: result.status.endsAt,
              websites: result.status.websites,
            }
          : undefined,
      };
    }

    return {
      success: true,
      text: `Started a SelfControl block for ${formatWebsiteList(parsed.request.websites)} until ${result.endsAt}.`,
      data: {
        websites: parsed.request.websites,
        durationMinutes: parsed.request.durationMinutes,
        endsAt: result.endsAt,
      },
    };
  },
  parameters: [
    {
      name: "websites",
      description:
        "Website hostnames or URLs to block, for example ['x.com', 'twitter.com'].",
      required: true,
      schema: {
        type: "array" as const,
        items: { type: "string" as const },
      },
    },
    {
      name: "durationMinutes",
      description: "How long to block those websites, in minutes.",
      required: false,
      schema: { type: "number" as const, default: 60 },
    },
  ],
  examples: [
    [
      {
        name: "{{name1}}",
        content: { text: "Block x.com and twitter.com for 2 hours." },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Started a SelfControl block for x.com, twitter.com until 2026-04-04T13:44:54.000Z.",
          action: "SELFCONTROL_BLOCK_WEBSITES",
        },
      },
    ],
  ] as ActionExample[][],
};

export const selfControlGetStatusAction: Action = {
  name: "SELFCONTROL_GET_BLOCK_STATUS",
  similes: [
    "CHECK_WEBSITE_BLOCK_STATUS",
    "CHECK_SELFCONTROL",
    "IS_BLOCK_RUNNING",
  ],
  description:
    "Check whether a SelfControl website block is currently active and when it ends.",
  validate: async () => true,
  handler: async () => {
    const status = await getSelfControlStatus();
    return {
      success: status.available,
      text: formatStatusText(status),
      data: {
        available: status.available,
        active: status.active,
        endsAt: status.endsAt,
        websites: status.websites,
      },
    };
  },
  parameters: [],
  examples: [
    [
      {
        name: "{{name1}}",
        content: { text: "Is there a website block running right now?" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "A SelfControl block is active for x.com, twitter.com until 2026-04-04T13:44:54.000Z.",
          action: "SELFCONTROL_GET_BLOCK_STATUS",
        },
      },
    ],
  ] as ActionExample[][],
};

export const selfControlUnblockWebsitesAction: Action = {
  name: "SELFCONTROL_UNBLOCK_WEBSITES",
  similes: ["UNBLOCK_WEBSITES", "REMOVE_WEBSITE_BLOCK", "STOP_BLOCKING_SITES"],
  description:
    "Attempt to stop a website block. For SelfControl, this action can only report status and explain that active blocks cannot be ended early.",
  validate: async () => true,
  handler: async () => {
    const status = await getSelfControlStatus();
    if (!status.available) {
      return {
        success: false,
        text:
          status.reason ??
          "SelfControl is unavailable on this machine, so there is nothing to unblock.",
      };
    }

    if (!status.active) {
      return {
        success: true,
        text: "No SelfControl block is active right now.",
        data: {
          active: false,
          canUnblockEarly: false,
        },
      };
    }

    return {
      success: false,
      text:
        status.endsAt === null
          ? "SelfControl cannot end an active block early. You have to wait for the timer to expire."
          : `SelfControl cannot end an active block early. The current block ends at ${status.endsAt}.`,
      data: {
        active: true,
        canUnblockEarly: false,
        endsAt: status.endsAt,
        websites: status.websites,
      },
    };
  },
  parameters: [],
  examples: [
    [
      {
        name: "{{name1}}",
        content: { text: "Unblock x.com right now." },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "SelfControl cannot end an active block early. The current block ends at 2026-04-04T13:44:54.000Z.",
          action: "SELFCONTROL_UNBLOCK_WEBSITES",
        },
      },
    ],
  ] as ActionExample[][],
};
