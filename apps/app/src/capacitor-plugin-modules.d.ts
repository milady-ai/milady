declare module "@elizaos/capacitor-agent" {
  export { Agent } from "../../../eliza/packages/native-plugins/agent/src/index";
  export type * from "../../../eliza/packages/native-plugins/agent/src/index";
}

declare module "@elizaos/capacitor-appblocker" {
  export * from "../../../eliza/packages/native-plugins/appblocker/src/index";
}

declare module "@elizaos/capacitor-camera" {
  export * from "../../../eliza/packages/native-plugins/camera/src/index";
}

declare module "@elizaos/capacitor-canvas" {
  export * from "../../../eliza/packages/native-plugins/canvas/src/index";
}

declare module "@elizaos/capacitor-desktop" {
  export { Desktop } from "../../../eliza/packages/native-plugins/desktop/src/index";
  export type * from "../../../eliza/packages/native-plugins/desktop/src/index";
}

declare module "@elizaos/capacitor-gateway" {
  export * from "../../../eliza/packages/native-plugins/gateway/src/index";
}

declare module "@elizaos/capacitor-location" {
  export * from "../../../eliza/packages/native-plugins/location/src/index";
}

declare module "@elizaos/capacitor-mobile-signals" {
  export * from "../../../eliza/packages/native-plugins/mobile-signals/src/index";
}

declare module "@elizaos/capacitor-screencapture" {
  export * from "../../../eliza/packages/native-plugins/screencapture/src/index";
}

declare module "@elizaos/capacitor-swabble" {
  export * from "../../../eliza/packages/native-plugins/swabble/src/index";
}

declare module "@elizaos/capacitor-talkmode" {
  export * from "../../../eliza/packages/native-plugins/talkmode/src/index";
}

declare module "@elizaos/capacitor-websiteblocker" {
  export * from "../../../eliza/packages/native-plugins/websiteblocker/src/index";
}

declare module "@elizaos/signal-native";
declare module "qrcode";

declare module "three/examples/jsm/libs/meshopt_decoder.module.js" {
  export const MeshoptDecoder: {
    supported: boolean;
    ready: Promise<void>;
    decode(
      target: Uint8Array,
      count: number,
      size: number,
      source: Uint8Array,
      mode?: number,
    ): void;
    decodeGltfBuffer(
      target: Uint8Array,
      count: number,
      size: number,
      source: Uint8Array,
      mode: string,
      filter?: string,
    ): void;
    useWorkers?(count: number): void;
  };
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
