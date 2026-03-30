import { WechatChannel } from "./channel";
import { deliverIncomingWechatMessage } from "./runtime-bridge";
import type { WechatConfig, WechatMessageContext } from "./types";

export interface Plugin {
  name: string;
  description: string;
  init?: (
    config: Record<string, unknown>,
    runtime: unknown,
  ) => Promise<void | (() => Promise<void>)>;
}

let channel: WechatChannel | null = null;

const wechatPlugin: Plugin = {
  name: "wechat",
  description: "WeChat messaging via proxy API",

  async init(config: Record<string, unknown>, runtime: unknown) {
    const wechatConfig = (config as { connectors?: { wechat?: WechatConfig } })
      ?.connectors?.wechat;

    if (!wechatConfig) {
      console.warn("[wechat] No wechat config found in connectors — skipping");
      return;
    }

    if (wechatConfig.enabled === false) {
      console.log("[wechat] Plugin disabled via config");
      return;
    }

    channel = new WechatChannel({
      config: wechatConfig,
      onMessage: async (accountId: string, msg: WechatMessageContext) => {
        await deliverIncomingWechatMessage({
          runtime,
          accountId,
          message: msg,
          sendText: async (replyAccountId, to, text) => {
            if (!channel) {
              throw new Error("[wechat] Channel is not available for replies");
            }
            await channel.sendText(replyAccountId, to, text);
          },
        });
      },
    });

    await channel.start();
    console.log("[wechat] Plugin initialized");

    // Return cleanup function
    return async () => {
      if (channel) {
        await channel.stop();
        channel = null;
        console.log("[wechat] Plugin stopped");
      }
    };
  },
};

export default wechatPlugin;
export { Bot } from "./bot";
export { WechatChannel } from "./channel";
export { ProxyClient } from "./proxy-client";
export { ReplyDispatcher } from "./reply-dispatcher";
export { deliverIncomingWechatMessage } from "./runtime-bridge";
export type { WechatConfig, WechatMessageContext } from "./types";
export { wechatPlugin };
