/* eslint-disable */
/**
 * Shared types and utilities for iOS and Android local runtime boot modules.
 */

import { ElizaBunRuntime } from "@elizaos/capacitor-bun-runtime";

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

function isBunRuntimePluginBase(value: unknown): value is BunRuntimePluginBase {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<keyof BunRuntimePluginBase, unknown>;
  return (
    typeof candidate.start === "function" &&
    typeof candidate.sendMessage === "function" &&
    typeof candidate.getStatus === "function" &&
    typeof candidate.stop === "function"
  );
}

export async function loadBunRuntimePlugin<T extends BunRuntimePluginBase>(
  logPrefix: string,
): Promise<T | null> {
  const plugin = ElizaBunRuntime;
  if (isBunRuntimePluginBase(plugin)) return plugin as T;

  if (plugin) {
    console.warn(
      `${logPrefix} Capacitor ElizaBunRuntime plugin has an unexpected shape`,
    );
  } else {
    console.warn(`${logPrefix} Capacitor ElizaBunRuntime plugin not available`);
  }
  return null;
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
