import { WechatChannel } from "./channel";
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
      onMessage: (accountId: string, msg: WechatMessageContext) => {
        console.log(
          `[wechat] Message from ${msg.sender} (account: ${accountId}): ${msg.content.slice(0, 100)}`,
        );
        // TODO: Route to elizaOS runtime message handler
        // This will be wired up when integrating with the actual @elizaos/core types
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
export { wechatPlugin };
export type { WechatConfig, WechatMessageContext } from "./types";
export { WechatChannel } from "./channel";
export { ProxyClient } from "./proxy-client";
export { Bot } from "./bot";
export { ReplyDispatcher } from "./reply-dispatcher";
