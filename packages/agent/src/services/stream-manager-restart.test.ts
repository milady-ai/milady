import { describe, expect, it } from "vitest";

/**
 * Validates that FFmpeg auto-restart properly resets _running state
 * when start() fails before spawning. This is a contract test —
 * it verifies the fix is present in the source code.
 */
describe("stream-manager autoRestart error recovery", () => {
  it("resets _running in the catch block of autoRestart", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const testDir = path.dirname(new URL(import.meta.url).pathname);
    const source = fs.readFileSync(
      path.resolve(testDir, "stream-manager.ts"),
      "utf-8",
    );

    // Find the autoRestart catch block
    const catchIdx = source.indexOf("} catch (err) {", source.indexOf("autoRestart"));
    expect(catchIdx).toBeGreaterThan(-1);

    // Verify _running = false appears within 100 chars after the catch
    const catchBlock = source.slice(catchIdx, catchIdx + 100);
    expect(catchBlock).toContain("this._running = false");
  });
});
