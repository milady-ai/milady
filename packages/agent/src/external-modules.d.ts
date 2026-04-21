declare module "@elizaos/plugin-coding-agent";
declare module "@elizaos/plugin-agent-orchestrator";
declare module "@elizaos/plugin-agent-skills";
declare module "@elizaos/plugin-elizacloud";
declare module "@elizaos/plugin-pi-ai";
declare module "@elizaos/plugin-commands";
declare module "@elizaos/plugin-secrets-manager";
declare module "@elizaos/signal-native";
declare module "qrcode";

declare module "@elizaos/plugin-plugin-manager" {
  import type { IAgentRuntime, Plugin } from "@elizaos/core";

  export class CoreManagerService {
    constructor(runtime: IAgentRuntime);
  }

  export class PluginManagerService {
    constructor(runtime: IAgentRuntime);
  }

  export const pluginRegistry: Record<string, unknown>;
  export const types: Record<string, unknown>;
  export const pluginManagerPlugin: Plugin;

  export default pluginManagerPlugin;
}

declare module "@elizaos/plugin-scratchpad" {
  import type { IAgentRuntime, Memory, Plugin } from "@elizaos/core";

  export function maybeStoreTaskScratchpadItem(
    runtime: IAgentRuntime,
    message: Memory,
    item: Record<string, unknown>,
  ): Promise<{
    requested?: boolean;
    stored?: boolean;
    replaced?: boolean;
    reason?: string;
    item?: { id: string; title: string };
    snapshot?: { items: Array<unknown>; maxItems: number };
  }>;

  const plugin: Plugin;
  export default plugin;
}

declare module "@elizaos/plugin-sql" {
  import type { Plugin } from "@elizaos/core";

  export const PGLITE_ERROR_CODES: {
    ACTIVE_LOCK: string;
    CORRUPT_DATA: string;
    MANUAL_RESET_REQUIRED: string;
  };

  export function getPgliteErrorCode(error: unknown): string | null;
  export function createPgliteInitError(
    code: string,
    message: string,
    options?: Record<string, unknown>,
  ): Error;

  const plugin: Plugin;
  export default plugin;
}

declare module "jsdom" {
  export class JSDOM {
    constructor(
      html?: string,
      options?: {
        url?: string;
        pretendToBeVisual?: boolean;
        [key: string]: unknown;
      },
    );
    window: Window & typeof globalThis;
    serialize(): string;
  }
}
