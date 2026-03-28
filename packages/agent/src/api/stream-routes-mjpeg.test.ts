import { describe, expect, it } from "vitest";

/**
 * Validates that MJPEG subscriber cleanup doesn't modify the Set
 * during iteration — collects failures first, then deletes.
 */
describe("MJPEG subscriber cleanup pattern", () => {
  it("collects failed subscribers before deleting from Set", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.resolve(testDir, "stream-routes.ts"),
      "utf-8",
    );

    // Find pushFrameToSubscribers function
    const fnIdx = source.indexOf("pushFrameToSubscribers");
    expect(fnIdx).toBeGreaterThan(-1);

    // Extract the function body (next ~600 chars)
    const fnBody = source.slice(fnIdx, fnIdx + 600);

    // Verify the pattern: collect in array, then delete after loop
    expect(fnBody).toContain("failed.push(sub)");
    expect(fnBody).toContain("for (const sub of failed)");

    // Verify there's NO delete inside the iteration loop
    const iterStart = fnBody.indexOf("for (const sub of mjpegSubscribers)");
    const iterEnd = fnBody.indexOf("for (const sub of failed)");
    expect(iterStart).toBeGreaterThan(-1);
    expect(iterEnd).toBeGreaterThan(iterStart);
    const iterBody = fnBody.slice(iterStart, iterEnd);
    expect(iterBody).not.toContain("mjpegSubscribers.delete");
  });
});
