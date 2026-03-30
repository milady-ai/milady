// Override CONNECTOR_IDS to include Milady-local connectors.
// The wildcard re-export above is shadowed by this explicit named export.
import { CONNECTOR_IDS as _upstreamConnectorIds } from "@miladyai/agent/config";

export { buildConfigSchema } from "@miladyai/agent/config";

/** Milady-local connectors not present in upstream @miladyai/agent. */
export const MILADY_LOCAL_CONNECTOR_IDS = ["wechat"] as const;

export const CONNECTOR_IDS = [
  ..._upstreamConnectorIds,
  ...MILADY_LOCAL_CONNECTOR_IDS,
] as const;
