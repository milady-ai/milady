import { type IAgentRuntime, logger, type Plugin } from "@elizaos/core";
import {
  selfControlBlockWebsitesAction,
  selfControlGetStatusAction,
  selfControlUnblockWebsitesAction,
} from "./action";
import { selfControlProvider } from "./provider";
import {
  getSelfControlStatus,
  type SelfControlPluginConfig,
  setSelfControlPluginConfig,
} from "./selfcontrol";

const selfControlPlugin: Plugin = {
  name: "@miladyai/plugin-selfcontrol",
  description:
    "Website blocking through the local SelfControl macOS app, with block status and explicit early-unblock refusal.",
  providers: [selfControlProvider],
  actions: [
    selfControlBlockWebsitesAction,
    selfControlGetStatusAction,
    selfControlUnblockWebsitesAction,
  ],
  init: async (
    pluginConfig: Record<string, unknown>,
    _runtime: IAgentRuntime,
  ) => {
    setSelfControlPluginConfig(pluginConfig as SelfControlPluginConfig);
    const status = await getSelfControlStatus();

    if (status.available) {
      logger.info(
        `[selfcontrol] SelfControl CLI available${status.active && status.endsAt ? ` until ${status.endsAt}` : ""}`,
      );
      return;
    }

    logger.warn(
      `[selfcontrol] Plugin loaded, but SelfControl is unavailable: ${status.reason ?? "unknown reason"}`,
    );
  },
};

export type {
  SelfControlBlockRequest,
  SelfControlPluginConfig,
  SelfControlStatus,
} from "./selfcontrol";
export {
  selfControlBlockWebsitesAction,
  selfControlGetStatusAction,
  selfControlProvider,
  selfControlUnblockWebsitesAction,
};

export default selfControlPlugin;
