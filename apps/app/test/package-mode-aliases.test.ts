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

  it("imports packaged app-core component and state exports instead of private ui source paths", () => {
    const mainText = fs.readFileSync(
      path.join(appRoot, "src/main.tsx"),
      "utf8",
    );
    const stubText = fs.readFileSync(
      path.join(appRoot, "src/optional-eliza-app-stub.tsx"),
      "utf8",
    );

    expect(mainText).toContain(
      "@elizaos/app-core/components/character/CharacterEditor",
    );
    expect(stubText).toContain("@elizaos/app-core/state/types");
    expect(stubText).toContain(
      "@elizaos/app-core/components/chat/widgets/types",
    );
    expect(mainText).not.toContain("@elizaos/ui/components/");
    expect(stubText).not.toContain("@elizaos/ui/state/");
    expect(stubText).not.toContain("@elizaos/ui/components/");
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

  it("keeps generated native module proxy stubs compatible with WebKit invariants", () => {
    const viteConfigText = fs.readFileSync(
      path.join(appRoot, "vite.config.ts"),
      "utf8",
    );

    expect(viteConfigText).toContain(
      "ownKeys(t) { return Reflect.ownKeys(t); }",
    );
    expect(viteConfigText).toContain(
      "getOwnPropertyDescriptor(t, p) { return Reflect.getOwnPropertyDescriptor(t, p)",
    );
    expect(viteConfigText).toContain(
      "p === 'prototype' || p === 'name' || p === 'length'",
    );
    expect(viteConfigText).not.toContain("ownKeys() { return []; }");
    expect(viteConfigText).not.toContain("p === 'prototype') return {}");
  });

  it("prefers local source aliases before stale package dist fallbacks", () => {
    const viteConfigText = fs.readFileSync(
      path.join(appRoot, "vite.config.ts"),
      "utf8",
    );

    expect(viteConfigText).toContain(
      "const runtimeTarget = resolveRuntimeTarget(pkgDir, exportTarget)",
    );
    expect(viteConfigText).toContain("fs.existsSync(runtimeTarget)");
    expect(viteConfigText).toContain("replacement: runtimeTarget");
    expect(viteConfigText).toContain("@elizaos\\/ui\\/platform");
    expect(viteConfigText).toContain("@elizaos\\/ui\\/(.+)");
    expect(viteConfigText).toContain("fs.statSync(candidate).isFile()");
    expect(viteConfigText).not.toContain("fs.existsSync(resolvedTarget)");
  });

  it("aliases React entrypoints to one resolved package copy", () => {
    const viteConfigText = fs.readFileSync(
      path.join(appRoot, "vite.config.ts"),
      "utf8",
    );

    expect(viteConfigText).toContain('requireResolve("react")');
    expect(viteConfigText).toContain('requireResolve("react/jsx-runtime")');
    expect(viteConfigText).toContain("find: /^react-dom\\/client$/");
    expect(viteConfigText).toContain("replacement: reactDomClientEntry");
  });

  it("keeps the local app-core browser surface aligned with app imports", () => {
    const appCoreBrowserPath = path.resolve(
      appRoot,
      "../..",
      "eliza/packages/app-core/src/browser.ts",
    );
    if (!fs.existsSync(appCoreBrowserPath)) {
      return;
    }

    const appCoreBrowserText = fs.readFileSync(appCoreBrowserPath, "utf8");
    expect(appCoreBrowserText).toContain("resolveIosRuntimeConfig");
    expect(appCoreBrowserText).toContain("type IosRuntimeConfig");
  });
});
