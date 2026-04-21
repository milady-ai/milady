import { describe, expect, it } from "vitest";
import {
  normalizeBrowserWorkspaceTxRequest,
  resolveBrowserWorkspaceMessageOrigin,
} from "./BrowserWorkspaceView";

describe("resolveBrowserWorkspaceMessageOrigin", () => {
  it("returns the origin when it matches the tab URL", () => {
    expect(
      resolveBrowserWorkspaceMessageOrigin(
        "https://example.com",
        "https://example.com/page",
      ),
    ).toBe("https://example.com");
  });

  it("returns the origin when no tab URL is provided", () => {
    expect(resolveBrowserWorkspaceMessageOrigin("https://example.com")).toBe(
      "https://example.com",
    );
  });

  it("returns null for empty-string origin", () => {
    expect(resolveBrowserWorkspaceMessageOrigin("")).toBeNull();
  });

  it('returns null for the literal string "null" (sandboxed iframe)', () => {
    expect(resolveBrowserWorkspaceMessageOrigin("null")).toBeNull();
  });

  it("rejects origin that doesn't match the tab URL (sandbox escape)", () => {
    // A malicious page using allow-same-origin could present the parent
    // origin. The tab URL check catches this mismatch.
    expect(
      resolveBrowserWorkspaceMessageOrigin(
        "https://evil.com",
        "https://legitimate-dapp.com/swap",
      ),
    ).toBeNull();
  });

  it("rejects when tab URL is malformed", () => {
    expect(
      resolveBrowserWorkspaceMessageOrigin("https://example.com", "not-a-url"),
    ).toBeNull();
  });

  it("allows matching origin with different path", () => {
    expect(
      resolveBrowserWorkspaceMessageOrigin(
        "https://app.uniswap.org",
        "https://app.uniswap.org/#/swap?chain=ethereum",
      ),
    ).toBe("https://app.uniswap.org");
  });

  it("never returns wildcard for null-origin frames", () => {
    expect(resolveBrowserWorkspaceMessageOrigin("")).not.toBe("*");
    expect(resolveBrowserWorkspaceMessageOrigin("null")).not.toBe("*");
  });
});

describe("normalizeBrowserWorkspaceTxRequest", () => {
  it("parses a standard eth_sendTransaction request", () => {
    const result = normalizeBrowserWorkspaceTxRequest(
      [{ to: "0xabc", value: "0x1", chainId: "0x1" }],
      1,
    );
    expect(result).toEqual({
      broadcast: true,
      chainId: 1,
      to: "0xabc",
      value: "0x1",
    });
  });

  it("defaults value to 0x0 when omitted (ERC-20 contract calls)", () => {
    const result = normalizeBrowserWorkspaceTxRequest(
      [{ to: "0xabc", data: "0x1234" }],
      1,
    );
    expect(result).not.toBeNull();
    expect(result!.value).toBe("0x0");
    expect(result!.data).toBe("0x1234");
  });

  it("returns null when 'to' is missing", () => {
    expect(
      normalizeBrowserWorkspaceTxRequest([{ value: "0x1" }], 1),
    ).toBeNull();
  });

  it("returns null for non-object params", () => {
    expect(normalizeBrowserWorkspaceTxRequest(null, 1)).toBeNull();
    expect(normalizeBrowserWorkspaceTxRequest("bad", 1)).toBeNull();
  });

  it("uses fallback chainId when not specified", () => {
    const result = normalizeBrowserWorkspaceTxRequest(
      [{ to: "0xabc", value: "1" }],
      42,
    );
    expect(result!.chainId).toBe(42);
  });
});
