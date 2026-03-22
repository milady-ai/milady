// Re-export everything from upstream
export * from "@elizaos/agent/config/schema";

// Override CONNECTOR_IDS to include Milady-local connectors.
// The wildcard re-export above is shadowed by this explicit named export.
import { CONNECTOR_IDS as _upstreamConnectorIds } from "@elizaos/agent/config/schema";

/** Milady-local connectors not present in upstream @elizaos/agent. */
export const MILADY_LOCAL_CONNECTOR_IDS = ["wechat"] as const;

export const CONNECTOR_IDS = [
  ..._upstreamConnectorIds,
  ...MILADY_LOCAL_CONNECTOR_IDS,
] as const;
