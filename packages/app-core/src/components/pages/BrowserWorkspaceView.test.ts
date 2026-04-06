import { describe, expect, it } from "vitest";
import { resolveBrowserWorkspaceMessageOrigin } from "./BrowserWorkspaceView";

describe("resolveBrowserWorkspaceMessageOrigin", () => {
  it("returns the origin when it is a valid non-null string", () => {
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

  it("never returns wildcard for null-origin frames", () => {
    // The two null-origin inputs that browsers actually produce must never
    // result in "*" targetOrigin — wallet addresses would leak.
    expect(resolveBrowserWorkspaceMessageOrigin("")).not.toBe("*");
    expect(resolveBrowserWorkspaceMessageOrigin("null")).not.toBe("*");
  });
});
