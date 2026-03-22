//#region src/types.d.ts
type DeviceType = "ipad" | "mac";
type LoginStatus = "waiting" | "need_verify" | "logged_in";
interface WechatAccountConfig {
  enabled?: boolean;
  name?: string;
  apiKey: string;
  proxyUrl: string;
  deviceType?: DeviceType;
  webhookPort?: number;
  webhookUrl?: string;
  wcId?: string;
  nickName?: string;
}
interface WechatConfig {
  enabled?: boolean;
  apiKey?: string;
  proxyUrl?: string;
  webhookPort?: number;
  deviceType?: DeviceType;
  accounts?: Record<string, WechatAccountConfig>;
  features?: {
    images?: boolean;
    groups?: boolean;
  };
}
interface ResolvedWechatAccount {
  id: string;
  apiKey: string;
  proxyUrl: string;
  deviceType: DeviceType;
  webhookPort: number;
  wcId?: string;
  nickName?: string;
}
type WechatMessageType = "text" | "image" | "video" | "file" | "voice" | "unknown";
interface WechatMessageContext {
  id: string;
  type: WechatMessageType;
  sender: string;
  recipient: string;
  content: string;
  timestamp: number;
  threadId?: string;
  group?: {
    subject: string;
  };
  imageUrl?: string;
  raw: unknown;
}
interface AccountStatus {
  valid: boolean;
  wcId?: string;
  loginState: LoginStatus;
  nickName?: string;
  tier?: string;
  quota?: number;
}
//# sourceMappingURL=types.d.ts.map
//#endregion
//#region src/channel.d.ts
interface ChannelOptions {
  config: WechatConfig;
  onMessage: (accountId: string, msg: WechatMessageContext) => void;
}
declare class WechatChannel {
  private readonly config;
  private readonly onMessage;
  private readonly accounts;
  private callbackServer;
  private healthTimer;
  private abortController;
  constructor(options: ChannelOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  sendText(accountId: string, to: string, text: string): Promise<void>;
  sendImage(accountId: string, to: string, imagePath: string, caption?: string): Promise<void>;
  private routeIncoming;
  private ensureLoggedIn;
  private healthCheck;
  private resolveAccounts;
}
//# sourceMappingURL=channel.d.ts.map
//#endregion
//#region src/proxy-client.d.ts
declare class ProxyClient {
  private readonly apiKey;
  private readonly baseUrl;
  private readonly accountId;
  constructor(account: ResolvedWechatAccount);
  private request;
  getStatus(): Promise<AccountStatus>;
  getQRCode(): Promise<string>;
  checkLogin(): Promise<{
    status: "waiting" | "need_verify" | "logged_in";
    verifyUrl?: string;
    wcId?: string;
    nickName?: string;
  }>;
  sendText(to: string, text: string): Promise<void>;
  sendImage(to: string, imagePath: string, text?: string): Promise<void>;
  getContacts(): Promise<{
    friends: Array<{
      wxid: string;
      name: string;
    }>;
    chatrooms: Array<{
      wxid: string;
      name: string;
    }>;
  }>;
  registerWebhook(url: string): Promise<void>;
  get needsLogin(): boolean;
}
//#endregion
//#region src/bot.d.ts
interface BotOptions {
  onMessage: (msg: WechatMessageContext) => void;
  featuresGroups?: boolean;
  featuresImages?: boolean;
}
declare class Bot {
  private readonly seen;
  private readonly onMessage;
  private readonly featuresGroups;
  private readonly featuresImages;
  private cleanupTimer;
  constructor(options: BotOptions);
  handleIncoming(message: WechatMessageContext): void;
  private isDuplicate;
  private cleanup;
  stop(): void;
}
//# sourceMappingURL=bot.d.ts.map
//#endregion
//#region src/reply-dispatcher.d.ts
interface ReplyDispatcherOptions {
  client: ProxyClient;
  chunkSize?: number;
}
declare class ReplyDispatcher {
  private readonly client;
  private readonly chunkSize;
  constructor(options: ReplyDispatcherOptions);
  sendText(to: string, text: string): Promise<void>;
  sendImage(to: string, imagePath: string, caption?: string): Promise<void>;
  private chunk;
}
//# sourceMappingURL=reply-dispatcher.d.ts.map
//#endregion
//#region src/index.d.ts
interface Plugin {
  name: string;
  description: string;
  init?: (config: Record<string, unknown>, runtime: unknown) => Promise<void | (() => Promise<void>)>;
}
declare const wechatPlugin: Plugin;
//#endregion
export { Bot, Plugin, ProxyClient, ReplyDispatcher, WechatChannel, type WechatConfig, type WechatMessageContext, wechatPlugin as default, wechatPlugin };
//# sourceMappingURL=index-CSdO_FIk.d.ts.map