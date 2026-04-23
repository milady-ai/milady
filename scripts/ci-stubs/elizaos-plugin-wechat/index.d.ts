declare const plugin: Record<string, never>;

export declare const WECHAT_PLUGIN_PACKAGE: "@elizaos/plugin-wechat";

export declare function isWechatConnectorConfigured(
  config:
    | {
        enabled?: boolean;
        apiKey?: string;
        accounts?: Record<string, { enabled?: boolean; apiKey?: string }>;
      }
    | Record<string, unknown>
    | null
    | undefined,
): boolean;

export default plugin;
