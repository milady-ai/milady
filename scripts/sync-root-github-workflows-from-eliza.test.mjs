import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

describe("Milady Windows release smoke contract", () => {
  test("passes the installed launcher path through to the packaged UI check", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/release-electrobun.yml", import.meta.url),
      "utf8",
    );
    const helper = readFileSync(
      new URL(
        "../apps/app/test/electrobun-packaged/packaged-app-helpers.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const windowsEnv = readFileSync(
      new URL(
        "../apps/app/test/electrobun-packaged/windows-test-env.ts",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(
      workflow,
      /Add-Content -Path \$env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_LAUNCHER_PATH=\$launcherPath"/,
    );
    assert.match(helper, /process\.env\.ELIZA_TEST_WINDOWS_LAUNCHER_PATH/);
    assert.match(windowsEnv, /"ELIZA_TEST_WINDOWS_LAUNCHER_PATH"/);
  });

  test("collects Windows smoke diagnostics from the smoke appdata roots", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/release-electrobun.yml", import.meta.url),
      "utf8",
    );

    assert.match(workflow, /\$env:MILADY_TEST_WINDOWS_APPDATA_PATH/);
    assert.match(workflow, /\$env:ELIZA_TEST_WINDOWS_APPDATA_PATH/);
    assert.match(workflow, /\$env:MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH/);
    assert.match(workflow, /\$env:ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH/);
    assert.match(
      workflow,
      /Join-Path \$localAppDataRoot "com\.miladyai\.milady"/,
    );
    assert.match(workflow, /Join-Path \$localAppDataRoot "ai\.elizaos\.Eliza"/);
  });
});
