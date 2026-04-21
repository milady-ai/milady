import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("patch-deps runtime hotfixes", () => {
  it("keeps first-party eliza/plugin source fixes out of the root patcher", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    for (const marker of [
      "patchPluginSqlParticipantInsertConflict",
      "patchLocalEmbeddingLinuxGpuProbe",
      "patchPluginDiscordIgnoreOtherMentions",
      "patchPluginSolanaActionSpecNames",
      "patchPluginEvmActionSpecNames",
      "patchPluginPdfBrokenDefault",
      "patchPluginElizaCloudResponsesCompat",
      "patchBrowserServerIndexExtension",
      "patchAutonomousResetAllowedSegments",
      "patchAgentSkillsLocalFallback",
      "patchAgentSkillsDirectorySlugAsName",
      'patchBunExports(root, "@elizaos/plugin-coding-agent")',
    ]) {
      expect(source).not.toContain(marker);
    }
  });

  it("retains installed-package discovery for published dependency hotfixes", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("collectInstalledPackageDirs");
    expect(source).toContain("includeGlobalBunCache: true");
  });

  it("contains bigint-buffer native fallback log patch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchBigintBufferNativeFallbackNoise");
    expect(source).toContain("MILADY_DEBUG_BIGINT_BINDINGS");
    expect(source).toContain(
      "bigint: Failed to load bindings, pure JS will be used",
    );
  });

  it("contains Baileys sharp dedupe patch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchBaileysNestedSharpCopies");
    expect(source).toContain("@whiskeysockets+baileys@");
    expect(source).toContain("node_modules/sharp");
  });

  it("contains stale sharp store alias normalization", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchLegacySharpStoreAliases");
    expect(source).toContain("sharp@0.33.5");
    expect(source).toContain("@img+sharp-libvips-darwin-arm64@1.0.4");
  });

  it("contains jsdom canvas opt-in patch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchJsdomCanvasAutoload");
    expect(source).toContain("MILADY_ENABLE_JSDOM_CANVAS");
    expect(source).toContain('exports.Canvas = require("canvas")');
  });

  it("contains cssstyle CommonJS compat patch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchCssstyleColorCompat");
    expect(source).toContain("@miladyai/css-color-cjs");
    expect(source).toContain('require("@asamuzakjp/css-color")');
  });

  it("contains groq sdk version normalization", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchGroqSdkVersion");
    expect(source).toContain("@elizaos+plugin-groq@");
    expect(source).toContain("@ai-sdk/groq");
  });
});
