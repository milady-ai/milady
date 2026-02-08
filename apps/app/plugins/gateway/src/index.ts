import { registerPlugin, Capacitor } from "@capacitor/core";
import type { GatewayPlugin } from "./definitions";

const electronModulePath = "../electron/src/index";

export const Gateway = registerPlugin<GatewayPlugin>("Gateway", {
  web: () => import("./web").then((m) => new m.GatewayWeb()),
  electron: () => {
    if (Capacitor.getPlatform() === "electron") {
      return import(/* @vite-ignore */ electronModulePath).then(
        (m: { Gateway: GatewayPlugin }) => m.Gateway
      );
    }
    return import("./web").then((m) => new m.GatewayWeb());
  },
});

export * from "./definitions";
