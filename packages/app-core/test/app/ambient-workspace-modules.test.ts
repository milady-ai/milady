import type { WebviewTagElement } from "electrobun/view";
import { describe, expect, it } from "vitest";

type CodingAgentModule = typeof import("@elizaos/plugin-coding-agent");
type QrCodeModule = typeof import("qrcode");
type SignalNativeModule = typeof import("@elizaos/signal-native");

describe("ambient workspace module declarations", () => {
  it("keeps strict desktop app builds aware of workspace-only module types", () => {
    const webview = {
      loadURL: () => undefined,
    } as unknown as WebviewTagElement;
    const modules: [
      CodingAgentModule | null,
      QrCodeModule | null,
      SignalNativeModule | null,
    ] = [null, null, null];

    expect(typeof webview.loadURL).toBe("function");
    expect(modules).toHaveLength(3);
  });
});
