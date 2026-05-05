declare module "@elizaos/plugin-coding-agent" {
  export class EmulatorBridgeServer {
    readonly isConnected: boolean;
    attachClient(send: (data: string) => void): void;
    detachClient(): void;
    onMessage(raw: string): void;
    sendCommand(command: unknown, timeoutMs?: number): Promise<unknown>;
  }
}
declare module "@elizaos/plugin-agent-orchestrator";
declare module "@elizaos/plugin-agent-skills";
declare module "@elizaos/plugin-elizacloud";
declare module "@elizaos/plugin-pi-ai";
declare module "@elizaos/plugin-commands";
declare module "@elizaos/plugin-local-embedding";
declare module "@elizaos/plugin-plugin-manager";
declare module "@elizaos/plugin-secrets-manager";
declare module "@elizaos/signal-native";
declare module "qrcode";

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
