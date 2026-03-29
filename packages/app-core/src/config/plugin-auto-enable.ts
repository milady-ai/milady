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

export const CONNECTOR_PLUGINS: Record<string, string> = {
  ..._upstreamConnectorPlugins,
};

export function applyPluginAutoEnable(
  params: ApplyPluginAutoEnableParams,
): ApplyPluginAutoEnableResult {
  const config = params.config as Record<string, unknown>;

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

  // Delegate to upstream for all connectors
  return _upstreamApplyPluginAutoEnable(params);
}
