declare module "@elizaos/plugin-coding-agent";
declare module "@elizaos/plugin-agent-orchestrator";
declare module "@elizaos/plugin-agent-skills";
declare module "@elizaos/plugin-anthropic";
declare module "@elizaos/plugin-elizacloud";
declare module "@elizaos/plugin-cron";
declare module "@elizaos/plugin-edge-tts";
declare module "@elizaos/plugin-edge-tts/node";
declare module "@elizaos/plugin-experience";
declare module "@elizaos/plugin-local-embedding";
declare module "@elizaos/plugin-ollama";
declare module "@elizaos/plugin-openai";
declare module "@elizaos/plugin-pi-ai";
declare module "@elizaos/plugin-personality";
declare module "@elizaos/plugin-plugin-manager";
declare module "@elizaos/plugin-commands";
declare module "@elizaos/plugin-secrets-manager";
declare module "@elizaos/plugin-shell";
declare module "@elizaos/plugin-sql";
declare module "@elizaos/plugin-trust";
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
