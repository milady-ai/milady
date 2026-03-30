import { describe, expect, it } from "vitest";
import { isWechatConfigured } from "./wechat-config";

describe("isWechatConfigured", () => {
  it("returns true when apiKey is present", () => {
    expect(isWechatConfigured({ apiKey: "key" })).toBe(true);
  });

  it("returns false for empty config", () => {
    expect(isWechatConfigured({})).toBe(false);
  });

  it("returns false when explicitly disabled", () => {
    expect(isWechatConfigured({ enabled: false, apiKey: "key" })).toBe(false);
  });

  it("returns true with multi-account containing enabled account with apiKey", () => {
    expect(
      isWechatConfigured({
        accounts: {
          main: { enabled: true, apiKey: "key" },
        },
      }),
    ).toBe(true);
  });

  it("returns false with multi-account where all accounts are disabled", () => {
    expect(
      isWechatConfigured({
        accounts: {
          main: { enabled: false, apiKey: "key" },
        },
      }),
    ).toBe(false);
  });

  it("returns false with empty accounts object", () => {
    expect(isWechatConfigured({ accounts: {} })).toBe(false);
  });

  it("returns true with mixed accounts (one enabled, one disabled)", () => {
    expect(
      isWechatConfigured({
        accounts: {
          main: { enabled: true, apiKey: "key" },
          secondary: { enabled: false, apiKey: "key2" },
        },
      }),
    ).toBe(true);
  });
});
