import { type IAgentRuntime, logger, type Plugin } from "@elizaos/core";
import {
  blockWebsitesAction,
  getWebsiteBlockStatusAction,
  requestWebsiteBlockingPermissionAction,
  selfControlBlockWebsitesAction,
  selfControlGetStatusAction,
  selfControlRequestPermissionAction,
  selfControlUnblockWebsitesAction,
  unblockWebsitesAction,
} from "./action.js";
import { selfControlProvider, websiteBlockerProvider } from "./provider.js";
import {
  getSelfControlPermissionState,
  getSelfControlStatus,
  openSelfControlPermissionLocation,
  requestSelfControlPermission,
  type SelfControlPluginConfig,
  setSelfControlPluginConfig,
} from "./selfcontrol.js";
import {
  clearWebsiteBlockerExpiryTasks,
  executeWebsiteBlockerExpiryTask,
  registerWebsiteBlockerTaskWorker,
  SelfControlBlockerService,
  syncWebsiteBlockerExpiryTask,
  WEBSITE_BLOCKER_UNBLOCK_TASK_NAME,
  WEBSITE_BLOCKER_UNBLOCK_TASK_TAGS,
  WebsiteBlockerService,
} from "./service.js";

const selfControlPlugin: Plugin = {
  name: "@miladyai/plugin-selfcontrol",
  description:
    "Cross-platform website blocking through the local system hosts file, with timed expiry and manual unblock support.",
  providers: [websiteBlockerProvider],
  actions: [
    blockWebsitesAction,
    getWebsiteBlockStatusAction,
    requestWebsiteBlockingPermissionAction,
    unblockWebsitesAction,
  ],
  services: [WebsiteBlockerService],
  init: async (
    pluginConfig: Record<string, unknown>,
    _runtime: IAgentRuntime,
  ) => {
    setSelfControlPluginConfig(pluginConfig as SelfControlPluginConfig);
    const status = await getSelfControlStatus();

    if (status.available) {
      logger.info(
        `[selfcontrol] Hosts-file blocker ready${status.active && status.endsAt ? ` until ${status.endsAt}` : status.active ? " until manually unblocked" : ""}`,
      );
      return;
    }

    logger.warn(
      `[selfcontrol] Plugin loaded, but local website blocking is unavailable: ${status.reason ?? "unknown reason"}`,
    );
  },
};

export type {
  SelfControlBlockRequest,
  SelfControlElevationMethod,
  SelfControlPermissionState,
  SelfControlPluginConfig,
  SelfControlStatus,
} from "./selfcontrol.js";
export {
  blockWebsitesAction,
  clearWebsiteBlockerExpiryTasks,
  executeWebsiteBlockerExpiryTask,
  getSelfControlPermissionState,
  getWebsiteBlockStatusAction,
  openSelfControlPermissionLocation,
  registerWebsiteBlockerTaskWorker,
  requestSelfControlPermission,
  requestWebsiteBlockingPermissionAction,
  SelfControlBlockerService,
  selfControlBlockWebsitesAction,
  selfControlGetStatusAction,
  selfControlProvider,
  selfControlRequestPermissionAction,
  selfControlUnblockWebsitesAction,
  syncWebsiteBlockerExpiryTask,
  unblockWebsitesAction,
  WEBSITE_BLOCKER_UNBLOCK_TASK_NAME,
  WEBSITE_BLOCKER_UNBLOCK_TASK_TAGS,
  WebsiteBlockerService,
  websiteBlockerProvider,
};

export default selfControlPlugin;
