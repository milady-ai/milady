/**
 * Shared types and utilities for iOS and Android local runtime boot modules.
 */

export const LOCAL_RUNTIME_CAPACITOR_PACKAGE = "@elizaos/capacitor-bun-runtime";

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
    // Deliberately variable and optional: mobile shells provide this Capacitor
    // package, while web/desktop builds may not. Keep @vite-ignore unless this
    // becomes a static dependency in every renderer target.
    const mod = await import(/* @vite-ignore */ LOCAL_RUNTIME_CAPACITOR_PACKAGE);
    const plugin = (mod as unknown as { ElizaBunRuntime?: T }).ElizaBunRuntime;
    if (!plugin) {
      console.warn(
        `${logPrefix} plugin module loaded but ElizaBunRuntime export missing`,
      );
      return null;
    }
    return plugin;
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
