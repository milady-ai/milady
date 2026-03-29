import { CONNECTOR_IDS as _upstreamConnectorIds } from "@miladyai/agent/config";

export { buildConfigSchema } from "@miladyai/agent/config";

export const CONNECTOR_IDS = [
  ..._upstreamConnectorIds,
] as const;
