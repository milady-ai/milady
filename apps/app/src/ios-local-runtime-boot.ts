/**
 * iOS local runtime boot.
 *
 * Activates the on-device Bun-shape JS runtime hosted by
 * `@elizaos/capacitor-bun-runtime` when:
 *   - Capacitor platform === "ios" AND
 *   - The renderer's IOS_RUNTIME_MODE resolves to "local".
 *
 * On detect: resolves the Capacitor plugin, calls `start({})` once, wires
 * `agent-ready` / `agent-error` / `agent-log` events onto the existing
 * window event bus (`dispatchAppEvent`) and exposes a thin `sendMessage` +
 * `getStatus` API the chat UI can call without taking a direct dep on the
 * Capacitor plugin.
 *
 * Bridge-not-available (Capacitor web fallback, module missing, native
 * `start()` rejects) is logged and silently falls through so cloud paths
 * keep working.
 */

import { Capacitor } from "@capacitor/core";
import {
  AGENT_READY_EVENT,
  dispatchAppEvent,
  resolveIosRuntimeConfig,
} from "@elizaos/ui";
import { APP_LOG_PREFIX } from "./app-config";
import {
  type BunRuntimePluginBase,
  buildLocalAgentReply,
  buildSendMessagePayload,
  dispatchLocalAgentEvent,
  getLocalAgentStatusFromPlugin,
  type LocalAgentReply,
  type LocalAgentStatus,
  loadBunRuntimePlugin,
} from "./mobile-local-runtime-shared";

export type { LocalAgentReply, LocalAgentStatus };

const LOG_PREFIX = `${APP_LOG_PREFIX} [ios-local-runtime]`;

// Custom event names dispatched on `document` for chat UI consumers. We
// use `document.dispatchEvent` directly (not the typed `dispatchAppEvent`
// helper) because the typed helper accepts only the existing
// `ElizaDocumentEventName` union and we don't want to push iOS-runtime
// event names upstream into the shared events package.
export const IOS_LOCAL_AGENT_LOG_EVENT = "ios-local-agent-log";
export const IOS_LOCAL_AGENT_ERROR_EVENT = "ios-local-agent-error";
export const IOS_LOCAL_AGENT_REPLY_EVENT = "ios-local-agent-reply";

interface BunRuntimeListenerHandle {
  remove(): Promise<void> | void;
}

interface BunRuntimePlugin extends BunRuntimePluginBase {
  start(opts: {
    bundlePath?: string;
  }): Promise<{ ok: boolean; error?: string }>;
  addListener(
    eventName: string,
    listenerFunc: (e: unknown) => void,
  ): Promise<BunRuntimeListenerHandle>;
}

type RuntimeState =
  | { kind: "idle" }
  | { kind: "starting"; promise: Promise<boolean> }
  | { kind: "ready"; plugin: BunRuntimePlugin }
  | { kind: "unavailable"; reason: string };

let runtimeState: RuntimeState = { kind: "idle" };

function isApplicable(): boolean {
  if (Capacitor.getPlatform() !== "ios") return false;
  const config = resolveIosRuntimeConfig(import.meta.env);
  return config.mode === "local";
}

async function subscribePluginEvents(plugin: BunRuntimePlugin): Promise<void> {
  // Best-effort: native plugin may not have emitted these events yet, but
  // addListener registration itself should not fail. Each listener is
  // independent — a missing handler for one event doesn't block others.
  const wire = async (
    eventName: string,
    handler: (payload: unknown) => void,
  ): Promise<void> => {
    try {
      await plugin.addListener(eventName, handler);
    } catch (error) {
      console.warn(
        `${LOG_PREFIX} addListener(${eventName}) failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  };

  await wire("agent-ready", (payload) => {
    dispatchAppEvent(AGENT_READY_EVENT, payload);
  });
  await wire("agent-error", (payload) => {
    dispatchLocalAgentEvent(IOS_LOCAL_AGENT_ERROR_EVENT, payload);
  });
  await wire("agent-log", (payload) => {
    dispatchLocalAgentEvent(IOS_LOCAL_AGENT_LOG_EVENT, payload);
  });
}

async function startRuntime(): Promise<boolean> {
  const plugin = await loadBunRuntimePlugin<BunRuntimePlugin>(LOG_PREFIX);
  if (!plugin) {
    runtimeState = { kind: "unavailable", reason: "plugin-not-loaded" };
    return false;
  }

  try {
    const result = await plugin.start({});
    if (!result.ok) {
      const reason = result.error ?? "start-returned-not-ok";
      console.warn(`${LOG_PREFIX} start() rejected: ${reason}`);
      runtimeState = { kind: "unavailable", reason };
      return false;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`${LOG_PREFIX} start() threw:`, reason);
    runtimeState = { kind: "unavailable", reason };
    return false;
  }

  await subscribePluginEvents(plugin);
  runtimeState = { kind: "ready", plugin };
  console.log(`${LOG_PREFIX} runtime started`);
  return true;
}

/**
 * Boot the iOS local agent if `Capacitor.getPlatform() === "ios"` and the
 * resolved IOS_RUNTIME_MODE is "local". Idempotent: subsequent calls
 * return the same in-flight promise (when starting) or no-op (when
 * already started/unavailable).
 */
export function bootIosLocalRuntimeIfApplicable(): Promise<boolean> {
  if (!isApplicable()) return Promise.resolve(false);

  if (runtimeState.kind === "ready") return Promise.resolve(true);
  if (runtimeState.kind === "unavailable") return Promise.resolve(false);
  if (runtimeState.kind === "starting") return runtimeState.promise;

  const promise = startRuntime();
  runtimeState = { kind: "starting", promise };
  return promise;
}

/**
 * Whether the iOS local runtime is fully started and ready to accept
 * messages. Returns `false` when applicable-but-still-starting,
 * non-applicable, or unavailable.
 */
export function isIosLocalRuntimeReady(): boolean {
  return runtimeState.kind === "ready";
}

/**
 * Send a single message to the on-device agent. Throws if the runtime
 * isn't ready — callers should gate on `isIosLocalRuntimeReady()` (or
 * the `useLocalAgent()` hook) before invoking.
 */
export async function sendLocalAgentMessage(
  text: string,
  conversationId?: string,
): Promise<LocalAgentReply> {
  if (runtimeState.kind !== "ready") {
    throw new Error(
      `iOS local runtime not ready (state: ${runtimeState.kind})`,
    );
  }
  const payload = buildSendMessagePayload(text, conversationId);
  const result = await runtimeState.plugin.sendMessage(payload);
  const reply = buildLocalAgentReply(result.reply, conversationId);
  dispatchLocalAgentEvent(IOS_LOCAL_AGENT_REPLY_EVENT, reply);
  return reply;
}

/**
 * Read the on-device agent status. Resolves to `{ ready: false }` when
 * the runtime isn't applicable, hasn't booted yet, or is unavailable.
 * Never throws — failures degrade to `{ ready: false }`.
 */
export async function getLocalAgentStatus(): Promise<LocalAgentStatus> {
  if (runtimeState.kind !== "ready") return { ready: false };
  return getLocalAgentStatusFromPlugin(runtimeState.plugin, LOG_PREFIX);
}

/**
 * Test/debug helper. Resets the module-local state machine so a fresh
 * `bootIosLocalRuntimeIfApplicable()` re-runs from scratch. Not for
 * production use.
 */
export function __resetIosLocalRuntimeForTests(): void {
  runtimeState = { kind: "idle" };
}
