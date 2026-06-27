import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

describe("package mode aliases", () => {
  it("stubs unpublished optional app packages", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(appRoot, "tsconfig.json"), "utf8"),
    );

    expect(tsconfig.compilerOptions.paths["@elizaos/app-lifeops/*"]).toEqual([
      "./apps/app/src/optional-eliza-app-stub.tsx",
    ]);
  });

  it("keeps the wallet UI plugin real because it is enabled by default", () => {
    const viteConfigText = fs.readFileSync(
      path.join(appRoot, "vite.config.ts"),
      "utf8",
    );
    const mainText = fs.readFileSync(
      path.join(appRoot, "src/main.tsx"),
      "utf8",
    );
    const walletShimText = fs.readFileSync(
      path.join(appRoot, "src/types/elizaos-plugin-wallet-ui-register.d.ts"),
      "utf8",
    );

    expect(mainText).toContain('import "@elizaos/plugin-wallet-ui/register"');
    expect(viteConfigText).toContain("pluginUiPackagesUsedByMiladyShell");
    expect(viteConfigText).toContain('"plugin-wallet-ui"');
    expect(walletShimText).toContain(
      'declare module "@elizaos/plugin-wallet-ui/register"',
    );
  });

  it("stubs unpublished native plugin packages", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(appRoot, "tsconfig.json"), "utf8"),
    );

    expect(tsconfig.compilerOptions.paths["@elizaos/capacitor-agent"]).toEqual([
      "./apps/app/src/native-plugin-stubs.ts",
    ]);
  });

  it("imports the consolidated @elizaos/ui stylesheet, not app-core style subpaths", () => {
    const mainText = fs.readFileSync(
      path.join(appRoot, "src/main.tsx"),
      "utf8",
    );

    // Upstream's app-shell refactor moved the stylesheet (base + brand-gold)
    // into @elizaos/ui; app-core no longer ships a styles subpath.
    expect(mainText).toContain('import "@elizaos/ui/styles"');
    expect(mainText).not.toContain("@elizaos/app-core/styles/");
    expect(mainText).not.toContain("@elizaos/ui/dist/styles/");
  });

  it("marks macOS Electrobun shells for traffic-light-safe layout", () => {
    const mainText = fs.readFileSync(
      path.join(appRoot, "src/main.tsx"),
      "utf8",
    );
    const contentLayoutText = fs.readFileSync(
      path.resolve(
        appRoot,
        "../../eliza/packages/ui/src/layouts/content-layout/content-layout.tsx",
      ),
      "utf8",
    );
    const macWindowCssText = fs.readFileSync(
      path.resolve(
        appRoot,
        "../../eliza/packages/ui/src/styles/electrobun-mac-window-drag.css",
      ),
      "utf8",
    );

    expect(mainText).toContain("eliza-electrobun-macos-titlebar");
    expect(contentLayoutText).toContain("eliza-content-layout");
    expect(macWindowCssText).toContain(
      "html.eliza-electrobun-macos-titlebar .eliza-content-layout",
    );
    expect(macWindowCssText).toContain(
      'html.eliza-electrobun-macos-titlebar [data-testid="ui-shell-toggle"]',
    );
    expect(macWindowCssText).toContain("--eliza-macos-frame-left-inset");
  });

  it("imports app-shell component + state/api types from @elizaos/ui and @elizaos/shared", () => {
    const mainText = fs.readFileSync(
      path.join(appRoot, "src/main.tsx"),
      "utf8",
    );
    const stubText = fs.readFileSync(
      path.join(appRoot, "src/optional-eliza-app-stub.tsx"),
      "utf8",
    );

    // CharacterEditor + state/widget/api types moved out of @elizaos/app-core
    // into @elizaos/ui (and the drop contracts into @elizaos/shared).
    expect(mainText).toContain(
      "@elizaos/ui/components/character/CharacterEditor",
    );
    expect(stubText).toContain('from "@elizaos/ui/api"');
    expect(stubText).toContain('from "@elizaos/shared"');
    expect(mainText).not.toContain("@elizaos/app-core/components/");
    expect(stubText).not.toContain("@elizaos/app-core/state/");
    expect(stubText).not.toContain("@elizaos/app-core/api");
  });

  it("patches all Bun-installed app-core stylesheet copies", () => {
    const patchScript = fs.readFileSync(
      path.resolve(
        appRoot,
        "../..",
        "scripts/patch-elizaos-package-styles.mjs",
      ),
      "utf8",
    );

    expect(patchScript).toContain("collectAppCorePackageDirs");
    expect(patchScript).toContain('node_modules", ".bun"');
    expect(patchScript).toContain("@elizaos+app-core@");
    expect(patchScript).toContain(
      '@import "../../../ui/src/styles/electrobun-mac-window-drag.css";',
    );
    expect(patchScript).toContain(
      '@import "./electrobun-mac-window-drag.css";',
    );
  });

  it("patches agent action parameter extraction away from package-mode core prompts", () => {
    const patchScript = fs.readFileSync(
      path.resolve(appRoot, "../..", "scripts/apply-eliza-ci-patches.mjs"),
      "utf8",
    );

    expect(patchScript).toContain("patchAgentConfigPaths");
    expect(patchScript).toContain("getElizaNamespace");
    expect(patchScript).toContain("resolveOAuthDir");
    expect(patchScript).toContain("patchAgentExtractParamsPrompt");
    expect(patchScript).toContain("EXTRACT_ACTION_PARAMS_TEMPLATE");
    expect(patchScript).toContain("extractActionParamsTemplate");
  });
});
