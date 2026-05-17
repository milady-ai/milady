/**
 * android-local-runtime-boot.ts
 *
 * Android local-agent startup handoff.
 *
 * Detects the Android local runtime mode when:
 *   - Capacitor platform === "android" AND
 *   - The mobile runtime mode resolves to "local".
 *
 * On Android the agent runs as a foreground service (`ElizaAgentService`)
 * that executes the Bun binary with `agent-bundle.js android-bridge`.
 * MainActivity and RuntimeGate start that service through the Java
 * service / Agent bridge path. This renderer boot module must not call
 * `ElizaBunRuntime`: the stock Android APK does not implement that
 * Capacitor plugin, and invoking it logs
 * "ElizaBunRuntime plugin is not implemented on android".
 *
 * The exported shape stays intentionally narrow for existing imports:
 * Android chat/status traffic uses the app-core client and
 * `@elizaos/capacitor-agent` transport, not this iOS-style BunRuntime
 * adapter.
 */

import { Capacitor } from "@capacitor/core";
import { APP_LOG_PREFIX } from "./app-config";

const LOG_PREFIX = `${APP_LOG_PREFIX} [android-local-runtime]`;

export const ANDROID_LOCAL_AGENT_LOG_EVENT = "android-local-agent-log";
export const ANDROID_LOCAL_AGENT_ERROR_EVENT = "android-local-agent-error";
export const ANDROID_LOCAL_AGENT_REPLY_EVENT = "android-local-agent-reply";

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

type RuntimeState =
  | { kind: "idle" }
  | { kind: "delegated"; owner: "ElizaAgentService" };

let runtimeState: RuntimeState = { kind: "idle" };

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

/**
 * Boot the Android local agent if `Capacitor.getPlatform() === "android"` and
 * the resolved runtime mode is "local".
 *
 * Android startup is owned by native Java code:
 *   - `MainActivity` calls `ElizaAgentService.start()` on launch when
 *     `ElizaAgentService.shouldAutoStart()` resolves true.
 *   - `RuntimeGate` calls the registered `Agent.start()` bridge when a
 *     stock Android user chooses Local mode.
 *
 * This function is therefore an idempotent no-op handoff. Returning false
 * means "this renderer adapter did not start a BunRuntime plugin", not
 * "Android local mode is unavailable".
 */
export function bootAndroidLocalRuntimeIfApplicable(): Promise<boolean> {
  if (!isApplicable()) return Promise.resolve(false);

  if (runtimeState.kind === "idle") {
    runtimeState = { kind: "delegated", owner: "ElizaAgentService" };
    console.info(
      `${LOG_PREFIX} startup delegated to ElizaAgentService; skipping BunRuntime plugin`,
    );
  }

  return Promise.resolve(false);
}

/**
 * Whether this renderer-owned adapter is ready to accept messages.
 * Android local chat/status traffic does not use this adapter.
 */
export function isAndroidLocalRuntimeReady(): boolean {
  return false;
}

/**
 * Android local messages are sent through the app-core client /
 * `@elizaos/capacitor-agent` transport, not this iOS-style adapter.
 */
export async function sendLocalAgentMessage(
  text: string,
  conversationId?: string,
): Promise<LocalAgentReply> {
  void text;
  void conversationId;
  throw new Error(
    `Android local runtime adapter not available (state: ${runtimeState.kind}); use Agent transport`,
  );
}

/**
 * Android local status is read through the app-core client /
 * `@elizaos/capacitor-agent` transport. Never throws.
 */
export async function getLocalAgentStatus(): Promise<LocalAgentStatus> {
  return { ready: false };
}

/** Reset for tests. */
export function __resetAndroidLocalRuntimeForTests(): void {
  runtimeState = { kind: "idle" };
}
