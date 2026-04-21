// Override CONNECTOR_IDS to include Milady-local connectors.
// The wildcard re-export above is shadowed by this explicit named export.
import { CONNECTOR_IDS as _upstreamConnectorIds } from "@miladyai/agent/config";

export { buildConfigSchema } from "@miladyai/agent/config";

const MILADY_COMPAT_CONNECTOR_IDS = ["telegramAccount"] as const;
/** Milady-local connectors not present in upstream @miladyai/agent. */
export const MILADY_LOCAL_CONNECTOR_IDS = ["wechat"] as const;

export const CONNECTOR_IDS = Array.from(
  new Set([
    ..._upstreamConnectorIds,
    ...MILADY_COMPAT_CONNECTOR_IDS,
    ...MILADY_LOCAL_CONNECTOR_IDS,
  ]),
) as ReadonlyArray<
  | (typeof _upstreamConnectorIds)[number]
  | (typeof MILADY_COMPAT_CONNECTOR_IDS)[number]
  | (typeof MILADY_LOCAL_CONNECTOR_IDS)[number]
>;
