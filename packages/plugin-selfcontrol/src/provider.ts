import type { Provider } from "@elizaos/core";
import { getCachedSelfControlStatus } from "./selfcontrol";

export const selfControlProvider: Provider = {
  name: "selfControl",
  description: "Describes the local SelfControl website blocker integration",
  get: async () => {
    const status = await getCachedSelfControlStatus();
    if (!status.available) {
      return {
        text: "SelfControl website blocking is unavailable on this machine.",
        values: {
          selfControlAvailable: false,
          selfControlCanUnblockEarly: false,
        },
      };
    }

    const statusLine = status.active
      ? status.endsAt
        ? `A SelfControl block is active until ${status.endsAt}.`
        : "A SelfControl block is active."
      : "No SelfControl block is active right now.";

    return {
      text: [
        "SelfControl website blocking is available on this macOS host.",
        statusLine,
        "Important: once a SelfControl block starts, it cannot be ended early by the app, restart, or this agent.",
      ].join(" "),
      values: {
        selfControlAvailable: true,
        selfControlActive: status.active,
        selfControlEndsAt: status.endsAt,
        selfControlCanUnblockEarly: false,
      },
    };
  },
};
