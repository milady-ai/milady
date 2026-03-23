import { describe, expect, it } from "vitest";
import { parseAllowedLoopbackHttpUrl } from "./dev-loopback-url.js";

describe("parseAllowedLoopbackHttpUrl", () => {
  it("accepts 127.0.0.1 and localhost with optional port and path", () => {
    expect(parseAllowedLoopbackHttpUrl("http://127.0.0.1:31339")?.origin).toBe(
      "http://127.0.0.1:31339",
    );
    expect(
      parseAllowedLoopbackHttpUrl("http://localhost:31339/foo")?.href,
    ).toBe("http://localhost:31339/foo");
    expect(parseAllowedLoopbackHttpUrl("https://127.0.0.1:1")?.protocol).toBe(
      "https:",
    );
  });

  it("accepts IPv6 loopback", () => {
    const h = parseAllowedLoopbackHttpUrl("http://[::1]:31339")?.hostname;
    expect(h === "::1" || h === "[::1]").toBe(true);
  });

  it("rejects non-loopback hosts (SSRF)", () => {
    expect(parseAllowedLoopbackHttpUrl("http://192.168.1.1:31339")).toBeNull();
    expect(parseAllowedLoopbackHttpUrl("http://example.com")).toBeNull();
    expect(parseAllowedLoopbackHttpUrl("http://127.0.0.1.evil.com")).toBeNull();
  });

  it("rejects non-http(s) and userinfo", () => {
    expect(parseAllowedLoopbackHttpUrl("file:///etc/passwd")).toBeNull();
    expect(parseAllowedLoopbackHttpUrl("ftp://127.0.0.1:21")).toBeNull();
    expect(
      parseAllowedLoopbackHttpUrl("http://user:pass@127.0.0.1:31339"),
    ).toBeNull();
  });

  it("rejects empty and invalid", () => {
    expect(parseAllowedLoopbackHttpUrl("")).toBeNull();
    expect(parseAllowedLoopbackHttpUrl("   ")).toBeNull();
    expect(parseAllowedLoopbackHttpUrl("not-a-url")).toBeNull();
  });
});
