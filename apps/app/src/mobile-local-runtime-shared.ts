/**
 * Shared types and utilities for iOS and Android local runtime boot modules.
 */

import { registerPlugin } from "@capacitor/core";

/**
 * JS-facing Capacitor plugin name for the on-device Bun runtime. Matches the
 * native `jsName` (`ElizaBunRuntimePlugin` declares `jsName = "ElizaBunRuntime"`).
 */
export const ELIZA_BUN_RUNTIME_PLUGIN_NAME = "ElizaBunRuntime";

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

export interface BunRuntimePluginBase {
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

export function dispatchLocalAgentEvent(name: string, detail: unknown): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

export async function loadBunRuntimePlugin<T extends BunRuntimePluginBase>(
  logPrefix: string,
): Promise<T | null> {
  try {
    // Resolve the native bridge via Capacitor's `registerPlugin` instead of a
    // dynamic `import("@elizaos/capacitor-bun-runtime")`. The package's
    // `ElizaBunRuntime` export is itself just `registerPlugin("ElizaBunRuntime",
    // …)`; importing it dynamically is fragile in the WebView build — a bare
    // specifier is unresolvable at runtime, and even when bundled the named
    // binding is only reached through the dynamic namespace, so Rollup
    // tree-shakes it out (the symptom: "plugin module loaded but ElizaBunRuntime
    // export missing"). `registerPlugin` returns the same native-bound proxy and
    // is bundling-safe. The native plugin declares `jsName = "ElizaBunRuntime"`.
    return registerPlugin<T>(ELIZA_BUN_RUNTIME_PLUGIN_NAME);
  } catch (error) {
    console.warn(
      `${logPrefix} plugin not available:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function getLocalAgentStatusFromPlugin(
  plugin: BunRuntimePluginBase,
  logPrefix: string,
): Promise<LocalAgentStatus> {
  try {
    return await plugin.getStatus();
  } catch (error) {
    console.warn(
      `${logPrefix} getStatus() failed:`,
      error instanceof Error ? error.message : error,
    );
    return { ready: false };
  }
}

export function buildSendMessagePayload(
  text: string,
  conversationId?: string,
): { message: string; conversationId?: string } {
  return conversationId ? { message: text, conversationId } : { message: text };
}

export function buildLocalAgentReply(
  replyText: string,
  conversationId?: string,
): LocalAgentReply {
  return conversationId
    ? { reply: replyText, conversationId }
    : { reply: replyText };
}
