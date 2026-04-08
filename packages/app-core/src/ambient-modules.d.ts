declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "electrobun/view" {
  type WebviewEventHandler = (...args: unknown[]) => void;

  export interface WebviewTagElement extends HTMLElement {
    src: string;
    partition: string;
    loadURL(url: string): void;
    on(event: string, handler: WebviewEventHandler): void;
    off(event: string, handler: WebviewEventHandler): void;
    goBack(): void;
    goForward(): void;
    reload(): void;
    canGoBack(): boolean | Promise<boolean>;
    canGoForward(): boolean | Promise<boolean>;
  }
}

declare module "@elizaos/plugin-groq" {
  const groqPlugin: unknown;
  export default groqPlugin;
}

declare module "@elizaos/plugin-openai" {
  const openAiPlugin: unknown;
  export default openAiPlugin;
}

declare module "@elizaos/plugin-plugin-manager" {
  export const PluginManagerService: unknown;
  const pluginManagerPlugin: unknown;
  export default pluginManagerPlugin;
}

declare module "@elizaos/plugin-trust" {
  const trustPlugin: unknown;
  export default trustPlugin;
}

declare module "@elizaos/plugin-edge-tts" {
  const edgeTtsPlugin: unknown;
  export default edgeTtsPlugin;
}

declare module "@elizaos/plugin-edge-tts/node" {
  const edgeTtsNodePlugin: unknown;
  export default edgeTtsNodePlugin;
}
