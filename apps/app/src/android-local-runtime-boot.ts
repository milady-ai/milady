/**
 * android-local-runtime-boot.ts
 *
 * Activates the on-device Bun agent backend via
 * `@elizaos/capacitor-bun-runtime` when:
 *   - Capacitor platform === "android" AND
 *   - The mobile runtime mode resolves to "local".
 *
 * On Android the agent runs as a foreground service (`ElizaAgentService`)
 * that executes the Bun binary with `agent-bundle.js android-bridge`.
 * The `ElizaBunRuntimePlugin` Kotlin implementation delegates lifecycle
 * calls to that service via reflection and routes all RPC calls over
 * the loopback HTTP surface at `127.0.0.1:31337`.
 *
 * This module mirrors the shape of `ios-local-runtime-boot.ts` so the
 * chat UI can call the same `sendLocalAgentMessage` / `getLocalAgentStatus`
 * API regardless of platform.
 *
 * Bridge-not-available (Capacitor web fallback, module missing, native
 * `start()` rejects) is logged and silently falls through so cloud paths
 * keep working.
 */

import { Capacitor } from "@capacitor/core";
import { AGENT_READY_EVENT, dispatchAppEvent } from "@elizaos/app-core";
import { APP_LOG_PREFIX } from "./app-config";

const LOG_PREFIX = `${APP_LOG_PREFIX} [android-local-runtime]`;

export const ANDROID_LOCAL_AGENT_LOG_EVENT = "android-local-agent-log";
export const ANDROID_LOCAL_AGENT_ERROR_EVENT = "android-local-agent-error";
export const ANDROID_LOCAL_AGENT_REPLY_EVENT = "android-local-agent-reply";

function dispatchLocalAgentEvent(name: string, detail: unknown): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

export interface LocalAgentStatus {
  ready: boolean;
  model?: string;
  tokensPerSecond?: number;
  bridgeVersion?: string;
}

export interface LocalAgentReply {
  reply: string;
  conversationId?: string;
}

interface BunRuntimePlugin {
  start(
    opts: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string }>;
  sendMessage(opts: {
    message: string;
    conversationId?: string;
  }): Promise<{ reply: string }>;
  getStatus(): Promise<LocalAgentStatus>;
  stop(): Promise<void>;
}

type RuntimeState =
  | { kind: "idle" }
  | { kind: "starting"; promise: Promise<boolean> }
  | { kind: "ready"; plugin: BunRuntimePlugin }
  | { kind: "unavailable"; reason: string };

let runtimeState: RuntimeState = { kind: "idle" };
const ElizaBunRuntime =
  Capacitor.registerPlugin<BunRuntimePlugin>("ElizaBunRuntime");

function isApplicable(): boolean {
  if (Capacitor.getPlatform() !== "android") return false;
  // Read the same localStorage key that the mobile onboarding picker writes.
  // Mirrors the key in eliza/packages/app-core/src/onboarding/mobile-runtime-mode.ts
  // (MOBILE_RUNTIME_MODE_STORAGE_KEY = "eliza:mobile-runtime-mode").
  try {
    const mode = localStorage.getItem("eliza:mobile-runtime-mode");
    return mode === "local";
  } catch {
    return false;
  }
}

async function loadPlugin(): Promise<BunRuntimePlugin | null> {
  const plugin = ElizaBunRuntime as unknown as BunRuntimePlugin | undefined;
  if (!plugin) {
    console.warn(
      `${LOG_PREFIX} plugin module loaded but ElizaBunRuntime export missing`,
    );
    return null;
  }
  return plugin;
}

async function startRuntime(): Promise<boolean> {
  const plugin = await loadPlugin();
  if (!plugin) {
    runtimeState = { kind: "unavailable", reason: "plugin-not-loaded" };
    return false;
  }

  try {
    const result = await plugin.start({ engine: "bun" });
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

  runtimeState = { kind: "ready", plugin };
  dispatchAppEvent(AGENT_READY_EVENT, { platform: "android", engine: "bun" });
  console.log(`${LOG_PREFIX} runtime started`);
  return true;
}

/**
 * Boot the Android local agent if `Capacitor.getPlatform() === "android"` and
 * the resolved runtime mode is "local". Idempotent: subsequent calls return
 * the same in-flight promise (when starting) or no-op (when already
 * started/unavailable).
 */
export function bootAndroidLocalRuntimeIfApplicable(): Promise<boolean> {
  if (!isApplicable()) return Promise.resolve(false);

  if (runtimeState.kind === "ready") return Promise.resolve(true);
  if (runtimeState.kind === "unavailable") return Promise.resolve(false);
  if (runtimeState.kind === "starting") return runtimeState.promise;

  const promise = startRuntime();
  runtimeState = { kind: "starting", promise };
  return promise;
}

/**
 * Whether the Android local runtime is fully started and ready to accept
 * messages.
 */
export function isAndroidLocalRuntimeReady(): boolean {
  return runtimeState.kind === "ready";
}

/**
 * Send a single message to the on-device agent. Throws if the runtime
 * isn't ready.
 */
export async function sendLocalAgentMessage(
  text: string,
  conversationId?: string,
): Promise<LocalAgentReply> {
  if (runtimeState.kind !== "ready") {
    throw new Error(
      `Android local runtime not ready (state: ${runtimeState.kind})`,
    );
  }
  const payload = conversationId
    ? { message: text, conversationId }
    : { message: text };
  const result = await runtimeState.plugin.sendMessage(payload);
  const reply: LocalAgentReply = conversationId
    ? { reply: result.reply, conversationId }
    : { reply: result.reply };
  dispatchLocalAgentEvent(ANDROID_LOCAL_AGENT_REPLY_EVENT, reply);
  return reply;
}

/**
 * Read the on-device agent status. Never throws.
 */
export async function getLocalAgentStatus(): Promise<LocalAgentStatus> {
  if (runtimeState.kind !== "ready") return { ready: false };
  try {
    return await runtimeState.plugin.getStatus();
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} getStatus() failed:`,
      error instanceof Error ? error.message : error,
    );
    return { ready: false };
  }
}

/** Reset for tests. */
export function __resetAndroidLocalRuntimeForTests(): void {
  runtimeState = { kind: "idle" };
}
