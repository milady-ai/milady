import { describe, expect, it } from "vitest";
import { ProxyClient } from "./proxy-client";

describe("ProxyClient", () => {
  it("rejects insecure proxy URLs", () => {
    expect(
      () =>
        new ProxyClient({
          id: "main",
          apiKey: "main-key",
          proxyUrl: "http://127.0.0.1:8787",
          deviceType: "ipad",
          webhookPort: 18790,
        }),
    ).toThrow("proxyUrl must use https://");
  });
});
