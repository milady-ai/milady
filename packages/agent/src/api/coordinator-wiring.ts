import type { AgentRuntime } from "@elizaos/core";

/**
 * Minimal subset of ServerState needed for coordinator bridge wiring.
 * Avoids importing the full ServerState interface (which is private to server.ts).
 */
export interface WirableState {
  runtime: AgentRuntime | null;
  broadcastWs?: ((data: Record<string, unknown>) => void) | null;
}

export interface WireCoordinatorOpts<S extends WirableState = WirableState> {
  /** Wire the chat bridge. Returns true on success. */
  wireChatBridge: (state: S) => boolean | Promise<boolean>;
  /** Wire the WebSocket bridge. Returns true on success. */
  wireWsBridge: (state: S) => boolean | Promise<boolean>;
  /** Wire the event-routing bridge. Returns true on success. */
  wireEventRouting: (state: S) => boolean | Promise<boolean>;
  /** Wire the swarm-complete synthesis callback. Returns true on success. */
  wireSwarmSynthesis?: (state: S) => boolean | Promise<boolean>;
  /** Label for log messages (e.g. "boot", "restart"). */
  context: string;
  /** Logger with warn/debug methods. */
  logger: { warn: (msg: string) => void; debug?: (msg: string) => void };
}

export interface WireResult {
  chat: boolean;
  ws: boolean;
  eventRouting: boolean;
  swarmSynthesis: boolean;
}

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 90_000;
const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 5;

/**
 * Wire coordinator bridges using polling-based service discovery.
 *
 * 1. Attempts immediate wiring (coordinator may already be available).
 * 2. If any bridge fails, polls for the SWARM_COORDINATOR service via
 *    `runtime.getService()` (the orchestrator plugin registers it via
 *    direct map insertion, so `getServiceLoadPromise` never resolves).
 * 3. Once the service appears, retries failed bridges up to MAX_RETRIES.
 * 4. On timeout or exhaustion, broadcasts a system-warning WS event.
 *
 * Safe for fire-and-forget (`void wireCoordinatorBridgesWhenReady(...)`).
 */
export async function wireCoordinatorBridgesWhenReady<S extends WirableState>(
  state: S,
  opts: WireCoordinatorOpts<S>,
): Promise<WireResult> {
  const {
    wireChatBridge,
    wireWsBridge,
    wireEventRouting,
    wireSwarmSynthesis,
    context,
    logger,
  } = opts;
  const result: WireResult = {
    chat: false,
    ws: false,
    eventRouting: false,
    swarmSynthesis: false,
  };

  result.chat = await wireChatBridge(state);
  result.ws = await wireWsBridge(state);
  result.eventRouting = await wireEventRouting(state);
  result.swarmSynthesis = wireSwarmSynthesis
    ? await wireSwarmSynthesis(state)
    : false;

  if (result.chat && result.ws && result.eventRouting) {
    logger.debug?.(
      `[eliza-api] Coordinator bridges wired immediately (${context})`,
    );
  } else {
    broadcastWarning(
      state,
      result,
      context,
      "bridges failed to wire immediately",
      !!wireSwarmSynthesis,
    );
  }

  return result;
}

function broadcastWarning(
  state: WirableState,
  result: WireResult,
  context: string,
  reason: string,
  hasSwarmSynthesis?: boolean,
): void {
  const missing = [
    !result.chat && "chat",
    !result.ws && "ws",
    !result.eventRouting && "event-routing",
    hasSwarmSynthesis && !result.swarmSynthesis && "swarm-synthesis",
  ]
    .filter(Boolean)
    .join(", ");

  state.broadcastWs?.({
    type: "system-warning",
    message: `Coordinator wiring incomplete (${context}): ${reason}. Missing bridges: ${missing}`,
    ts: Date.now(),
  });
}
