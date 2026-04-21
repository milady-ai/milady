// Override applyPluginAutoEnable to inject WeChat auto-enable before upstream.
import {
  applyPluginAutoEnable as _upstreamApplyPluginAutoEnable,
  CONNECTOR_PLUGINS as _upstreamConnectorPlugins,
  type ApplyPluginAutoEnableParams,
  type ApplyPluginAutoEnableResult,
  AUTH_PROVIDER_PLUGINS,
  isConnectorConfigured,
  isStreamingDestinationConfigured,
  STREAMING_PLUGINS,
} from "@miladyai/agent/config/plugin-auto-enable";

export {
  AUTH_PROVIDER_PLUGINS,
  isConnectorConfigured,
  isStreamingDestinationConfigured,
  STREAMING_PLUGINS,
};

const TELEGRAM_ACCOUNT_CLIENT_PLUGIN =
  "@elizaos-plugins/client-telegram-account";

// Extend upstream CONNECTOR_PLUGINS with Milady-local connectors.
export const CONNECTOR_PLUGINS: Record<string, string> = {
  ..._upstreamConnectorPlugins,
  telegramAccount:
    _upstreamConnectorPlugins.telegramAccount ?? TELEGRAM_ACCOUNT_CLIENT_PLUGIN,
  wechat: "@miladyai/plugin-wechat",
};

import { isWechatConfigured } from "./wechat-config";

export function applyPluginAutoEnable(
  params: ApplyPluginAutoEnableParams,
): ApplyPluginAutoEnableResult {
  const config = params.config as Record<string, unknown>;

  // Inject WeChat before upstream runs (upstream doesn't know about wechat)
  const connectors = config?.connectors as Record<string, unknown> | undefined;
  const wechatBlock = connectors?.wechat as Record<string, unknown> | undefined;

  if (wechatBlock && isWechatConfigured(wechatBlock)) {
    if (config.plugins == null) config.plugins = {};
    const plugins = config.plugins as Record<string, unknown>;
    if (plugins.allow == null) plugins.allow = [];
    const allow = plugins.allow as string[];
    if (
      !allow.includes("@miladyai/plugin-wechat") &&
      !allow.includes("wechat")
    ) {
      allow.push("@miladyai/plugin-wechat");
    }
  }

  // Auto-enable Steward wallet plugin when STEWARD_API_URL is configured
  const env = params.env ?? process.env;
  if ((env as Record<string, string | undefined>).STEWARD_API_URL?.trim()) {
    if (config.plugins == null) config.plugins = {};
    const plugins = config.plugins as Record<string, unknown>;
    if (plugins.allow == null) plugins.allow = [];
    const allow = plugins.allow as string[];
    if (!allow.includes("@stwd/eliza-plugin")) {
      allow.push("@stwd/eliza-plugin");
    }
  }

  // Delegate to upstream for all other connectors
  return _upstreamApplyPluginAutoEnable(params);
}
