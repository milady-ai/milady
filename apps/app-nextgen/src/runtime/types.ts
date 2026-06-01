/**
 * Minimum runtime-contract types for Phase 0.
 *
 * These mirror the canonical contracts in `@elizaos/shared`
 * (eliza/packages/shared/src/contracts/*). Kept local + minimal so the nextgen
 * renderer has ZERO build-time dependency on the eliza source graph. As the
 * surface grows (Phase 1+) we replace these with `import type { … } from
 * "@elizaos/shared"` to track the contract exactly.
 */

export interface AuthStatus {
  required: boolean;
  pairingEnabled?: boolean;
  authenticated?: boolean;
  localAccess?: boolean;
}

export interface AgentStatus {
  state: string;
  agentName?: string;
  model?: string;
  startedAt?: number;
  uptime?: number;
  /** Live boot progress — what the agent is doing while it starts up. */
  startup?: { phase?: string; attempt?: number };
  cloud?: { connectionStatus?: string };
}

export interface HealthStatus {
  ready: boolean;
  agentName?: string;
  uptime?: number;
  plugins?: { loaded?: number; failed?: number };
}
