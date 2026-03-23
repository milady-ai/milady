import { describe, expect, it } from "vitest";
import { resolveMiladyDevCorsAllowOrigin } from "./milady-dev-cors-origin.js";

describe("resolveMiladyDevCorsAllowOrigin", () => {
  it("accepts loopback Origin without Referer", () => {
    expect(
      resolveMiladyDevCorsAllowOrigin("http://127.0.0.1:2138", undefined),
    ).toBe("http://127.0.0.1:2138");
    expect(
      resolveMiladyDevCorsAllowOrigin("http://localhost:31337", undefined),
    ).toBe("http://localhost:31337");
    expect(
      resolveMiladyDevCorsAllowOrigin("https://[::1]:8080", undefined),
    ).toBe("https://[::1]:8080");
  });

  it("when Origin is empty, accepts loopback Referer", () => {
    expect(
      resolveMiladyDevCorsAllowOrigin("", "http://127.0.0.1:2138/chat"),
    ).toBe("http://127.0.0.1:2138");
    expect(resolveMiladyDevCorsAllowOrigin("", "http://localhost:3000/")).toBe(
      "http://localhost:3000",
    );
    expect(resolveMiladyDevCorsAllowOrigin("", "http://[::1]:1/path")).toBe(
      "http://[::1]:1",
    );
  });

  it("when Origin is empty, rejects non-loopback Referer", () => {
    expect(
      resolveMiladyDevCorsAllowOrigin("", "http://192.168.1.1/"),
    ).toBeNull();
    expect(
      resolveMiladyDevCorsAllowOrigin("", "https://evil.example/"),
    ).toBeNull();
    expect(resolveMiladyDevCorsAllowOrigin("", undefined)).toBeNull();
    expect(resolveMiladyDevCorsAllowOrigin("", "")).toBeNull();
  });

  it("rejects non-loopback Origin even when Referer is loopback", () => {
    expect(
      resolveMiladyDevCorsAllowOrigin(
        "https://evil.example",
        "http://127.0.0.1:2138/",
      ),
    ).toBeNull();
    expect(
      resolveMiladyDevCorsAllowOrigin(
        "http://10.0.0.1:1",
        "http://localhost:1/",
      ),
    ).toBeNull();
  });

  it("uses first Referer when header is duplicated", () => {
    expect(
      resolveMiladyDevCorsAllowOrigin("", [
        "http://127.0.0.1:9/a",
        "http://evil/",
      ]),
    ).toBe("http://127.0.0.1:9");
  });

  it("rejects non-http(s) Referer", () => {
    expect(resolveMiladyDevCorsAllowOrigin("", "file:///tmp/x")).toBeNull();
  });
});
