import { describe, expect, it } from "vitest";

/**
 * Source-level regression guards for misc-routes.ts.
 *
 * The LTCG (Lunchtable Card Game) autonomy plugin was removed as part of the
 * retake.tv / Lunchtable decoupling. These tests assert that the handler block
 * stays gone so that a future refactor, merge conflict, or autonomous agent
 * cannot silently reintroduce the dead routes or the plugin dependency.
 *
 * The assertions are deliberately string-level (read misc-routes.ts as text and
 * grep for LTCG markers) rather than runtime-level. Runtime tests would require
 * mocking the full MiscRouteContext (req/res/state/etc.) for handler behavior
 * that no longer exists, which is more machinery than the regression guard
 * needs.
 */
describe("misc-routes LTCG removal regression guard", () => {
  it("does not contain any references to the removed LTCG plugin", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.resolve(testDir, "misc-routes.ts"),
      "utf-8",
    );

    // The plugin package name must not appear anywhere in the handler source.
    expect(source).not.toContain("@lunchtable/plugin-ltcg");

    // The autonomy route prefix must not appear — these 5 endpoints were
    // deleted (GET status, POST start/pause/resume/stop).
    expect(source).not.toContain("/api/ltcg/autonomy");

    // Case-insensitive catch for any straggler references in comments, logs,
    // import paths, or identifiers.
    expect(source.toLowerCase()).not.toContain("ltcg");
    expect(source.toLowerCase()).not.toContain("lunchtable");
  });
});
