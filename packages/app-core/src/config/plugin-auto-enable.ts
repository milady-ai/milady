// Re-export everything from upstream
export * from "@elizaos/agent/config/plugin-auto-enable";

// Override applyPluginAutoEnable to inject WeChat auto-enable before upstream.
import {
  applyPluginAutoEnable as _upstreamApplyPluginAutoEnable,
  CONNECTOR_PLUGINS as _upstreamConnectorPlugins,
  type ApplyPluginAutoEnableParams,
  type ApplyPluginAutoEnableResult,
} from "@elizaos/agent/config/plugin-auto-enable";

// Extend upstream CONNECTOR_PLUGINS with Milady-local connectors.
export const CONNECTOR_PLUGINS: Record<string, string> = {
  ..._upstreamConnectorPlugins,
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
    const plugins = (config.plugins ??= {}) as Record<string, unknown>;
    const allow = (plugins.allow ??= []) as string[];
    if (!allow.includes("wechat")) {
      allow.push("wechat");
    }
  }

  // Delegate to upstream for all other connectors
  return _upstreamApplyPluginAutoEnable(params);
}
