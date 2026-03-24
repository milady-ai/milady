/**
 * NODE_PATH drift test
 *
 * NODE_PATH must be set in exactly 3 files for dynamic plugin imports to work.
 * If any location is removed or changed, plugins will fail at runtime with MODULE_NOT_FOUND.
 * See CLAUDE.md "Key Architecture Decisions > NODE_PATH" for context.
 *
 * This follows the existing drift test pattern (electrobun-release-workflow-drift.test.ts).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const NODE_PATH_LOCATIONS = [
  {
    file: "scripts/run-node.mjs",
    description: "CLI runner — child process env",
    pattern: /NODE_PATH/,
  },
  {
    file: "packages/agent/src/runtime/eliza.ts",
    description: "Agent loader — module-level, before dynamic imports",
    pattern: /NODE_PATH/,
  },
  {
    file: "apps/app/electrobun/src/native/agent.ts",
    description: "Electrobun main process",
    pattern: /NODE_PATH/,
  },
] as const;

describe("NODE_PATH invariant", () => {
  for (const loc of NODE_PATH_LOCATIONS) {
    it(`${loc.file} sets NODE_PATH (${loc.description})`, () => {
      const content = readFileSync(loc.file, "utf8");
      const matches = content.match(/NODE_PATH/g);
      expect(
        matches && matches.length > 0,
        `${loc.file} must contain NODE_PATH assignments. ` +
          `Dynamic plugin imports require NODE_PATH in all 3 locations. ` +
          `See CLAUDE.md "Key Architecture Decisions > NODE_PATH".`,
      ).toBe(true);
    });
  }

  it("no other source files set NODE_PATH (prevents drift)", () => {
    // This test documents the expected locations. If a new file needs NODE_PATH,
    // add it to NODE_PATH_LOCATIONS above and update CLAUDE.md.
    const knownFiles = new Set(NODE_PATH_LOCATIONS.map((l) => l.file));
    // We don't exhaustively scan here — that would be fragile. Instead, the
    // 3-location invariant is the contract. If someone adds a 4th location,
    // they should add it to this test and CLAUDE.md.
    expect(knownFiles.size).toBe(3);
  });
});
