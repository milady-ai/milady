import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyMiladyWorkflowTransform } from "./sync-root-github-workflows-from-eliza.mjs";

describe("applyMiladyWorkflowTransform", () => {
  test("does not turn packages/app-core into apps/app-core", () => {
    const input = "node packages/app-core/scripts/x.mjs\npackages/app/dist\n";
    const out = applyMiladyWorkflowTransform("release-electrobun.yml", input);
    assert.match(out, /eliza\/packages\/app-core\/scripts\/x\.mjs/);
    assert.match(out, /apps\/app\/dist/);
    assert.ok(!out.includes("apps/app-core"));
  });

  test("rewrites APT dispatch and GitHub release URLs for Milady", () => {
    const input =
      'DEB_URL="https://github.com/elizaOS/eliza/releases/download/$TAG/x"\ngh api repos/elizaOS/apt/dispatches';
    const out = applyMiladyWorkflowTransform("publish-packages.yml", input);
    assert.ok(out.includes("github.com/milady-ai/milady/releases"));
    assert.ok(out.includes("repos/milady-ai/apt"));
  });

  test("rewrites homebrew tap only for update-homebrew.yml", () => {
    const snippet = "repository: elizaOS/homebrew-tap";
    const other = applyMiladyWorkflowTransform(
      "release-electrobun.yml",
      snippet,
    );
    assert.ok(other.includes("elizaOS/homebrew-tap"));

    const brew = applyMiladyWorkflowTransform("update-homebrew.yml", snippet);
    assert.ok(brew.includes("milady-ai/homebrew-tap"));
  });
});
