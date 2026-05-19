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

  it("keeps local wallet source real when available because it is enabled by default", () => {
    const viteConfigText = fs.readFileSync(
      path.join(appRoot, "vite.config.ts"),
      "utf8",
    );

    expect(viteConfigText).toContain("shouldResolveRealWalletApp");
    expect(viteConfigText).toContain('elizaAppPackageExists("app-wallet")');
    expect(viteConfigText).toContain('"plugins"');
  });

  it("stubs unpublished native plugin packages", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(appRoot, "tsconfig.json"), "utf8"),
    );

    expect(tsconfig.compilerOptions.paths["@elizaos/capacitor-agent"]).toEqual([
      "./apps/app/src/native-plugin-stubs.ts",
    ]);
  });

  it("imports packaged app-core style exports instead of private ui dist paths", () => {
    const mainText = fs.readFileSync(
      path.join(appRoot, "src/main.tsx"),
      "utf8",
    );

    expect(mainText).toContain("@elizaos/app-core/styles/styles.css");
    expect(mainText).toContain("@elizaos/app-core/styles/brand-gold.css");
    expect(mainText).not.toContain("@elizaos/ui/dist/styles/");
  });

  it("imports public ui package subpaths for ui-owned component and state types", () => {
    const mainText = fs.readFileSync(
      path.join(appRoot, "src/main.tsx"),
      "utf8",
    );
    const viteConfigText = fs.readFileSync(
      path.join(appRoot, "vite.config.ts"),
      "utf8",
    );
    const stubText = fs.readFileSync(
      path.join(appRoot, "src/optional-eliza-app-stub.tsx"),
      "utf8",
    );

    expect(mainText).toContain(
      "@elizaos/ui/components/character/CharacterEditor",
    );
    expect(mainText).toContain("@elizaos/ui/components/voice-pill/index");
    expect(mainText).toContain("@elizaos/ui/voice");
    expect(stubText).toContain("@elizaos/ui/state/types");
    expect(stubText).toContain("@elizaos/ui/components/chat/widgets/types");
    expect(stubText).toContain("@elizaos/ui/components/ui/confirm-dialog");
    expect(viteConfigText).toContain("resolvePackageModeUiSourceAliases");
    expect(viteConfigText).toContain("resolvePackageModeAppCoreBrowserAliases");
    expect(viteConfigText).toContain("resolvePackageModeAppCoreStyleAliases");
    expect(mainText).not.toContain("@elizaos/ui/dist/");
    expect(stubText).not.toContain("@elizaos/ui/dist/");
  });

  it("keeps package-mode build aliases for ui subpaths that alpha packages have not published yet", () => {
    const viteConfigText = fs.readFileSync(
      path.join(appRoot, "vite.config.ts"),
      "utf8",
    );

    expect(viteConfigText).toContain("resolvePackageModeUiCompatAliases");
    expect(viteConfigText).toContain("eliza-ui-voice-capture-fallback.ts");
    expect(viteConfigText).toContain("eliza-ui-voice-pill-fallback.tsx");
    expect(viteConfigText).toContain(
      "@elizaos/app-core/components/character/CharacterEditor",
    );
  });

  it("keeps package-mode voice fallback modules self-contained", () => {
    const voicePillFallbackText = fs.readFileSync(
      path.join(appRoot, "src/eliza-ui-voice-pill-fallback.tsx"),
      "utf8",
    );
    const voiceCaptureFallbackText = fs.readFileSync(
      path.join(appRoot, "src/eliza-ui-voice-capture-fallback.ts"),
      "utf8",
    );

    expect(voicePillFallbackText).not.toContain("lucide-react");
    expect(voicePillFallbackText).toContain("function MicIcon");
    expect(voicePillFallbackText).toContain("function SendIcon");
    expect(voiceCaptureFallbackText).toContain("createVoiceCapture");
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
