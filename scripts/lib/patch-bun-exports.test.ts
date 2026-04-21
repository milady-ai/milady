import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyAutonomousMiladyOnboardingPresetsPatch,
  applyCodexFolderApprovalPromptCompat,
  applyExtensionlessJsExportAliases,
  applyMissingLifecycleScriptPatch,
  applyNobleHashesCompat,
  applyPatchToPackageJson,
  applyPluginVisionPermissionPatch,
  applyProperLockfileSignalExitCompat,
  applyPtyManagerCursorPositionCompat,
  applyPtyManagerEsmDirnameCompat,
  findPackageFilePaths,
  findPackageJsonPaths,
  patchAutonomousMiladyOnboardingPresets,
  patchBrokenElizaCoreRuntimeDists,
  patchBunExports,
  patchCodexFolderApprovalPromptCompat,
  patchElectrobunWindowsTar,
  patchElizaCoreStreamingRetryPlaceholder,
  patchElizaCoreStreamingTtsHandlerGuard,
  patchExtensionlessJsExports,
  patchMissingLifecycleScript,
  patchNobleHashesCompat,
  patchPluginVisionPermissionHandling,
  patchProperLockfileSignalExitCompat,
  patchPtyManagerCursorPositionCompat,
  patchPtyManagerEsmDirnameCompat,
  pruneNestedElizaPluginCoreCopies,
  repairElizaCoreRuntimeDist,
  warnStaleBunCache,
} from "./patch-bun-exports.mjs";

const _MOCK_MILADY_CATALOG = {
  assets: [
    { id: 1, slug: "milady-1", title: "Chen", sourceName: "Chen" },
    { id: 2, slug: "milady-2", title: "Tanya", sourceName: "Tanya" },
    { id: 3, slug: "milady-3", title: "Ayane", sourceName: "Ayane" },
    { id: 4, slug: "milady-4", title: "Ling", sourceName: "Ling" },
  ],
  injectedCharacters: [
    {
      catchphrase: "I can't wait!",
      name: "Rin",
      avatarAssetId: 1,
      voicePresetId: "alice",
      avatarAsset: {
        id: 1,
        slug: "milady-1",
        title: "Chen",
        sourceName: "Chen",
      },
    },
    {
      catchphrase: "Let's get to work!",
      name: "Ai",
      avatarAssetId: 2,
      voicePresetId: "sarah",
      avatarAsset: {
        id: 2,
        slug: "milady-2",
        title: "Jin",
        sourceName: "Jin",
      },
    },
  ],
};
describe("patch-bun-exports", () => {
  it("applyPatchToPackageJson removes bun and default when src/index.ts is missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@elizaos", "plugin-fake");
      const pkgPath = join(pkgDir, "package.json");
      const pkg = {
        name: "@elizaos/plugin-fake",
        version: "1.0.0",
        exports: {
          ".": {
            bun: "./src/index.ts",
            default: "./src/index.ts",
            import: { default: "./dist/index.js" },
          },
        },
      };
      mkdirSync(join(pkgDir, "dist"), { recursive: true });
      writeFileSync(join(pkgDir, "dist", "index.js"), "// dummy", "utf8");
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");

      const result = applyPatchToPackageJson(pkgPath);
      expect(result).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.exports["."].bun).toBeUndefined();
      expect(updated.exports["."].default).toBeUndefined();
      expect(updated.exports["."].import).toEqual({
        default: "./dist/index.js",
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyPatchToPackageJson does not patch when src/index.ts exists", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@elizaos", "plugin-fake");
      const pkgPath = join(pkgDir, "package.json");
      const pkg = {
        name: "@elizaos/plugin-fake",
        exports: {
          ".": {
            bun: "./src/index.ts",
            import: { default: "./dist/index.js" },
          },
        },
      };
      mkdirSync(join(pkgDir, "src"), { recursive: true });
      writeFileSync(join(pkgDir, "src", "index.ts"), "// exists", "utf8");
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");

      const result = applyPatchToPackageJson(pkgPath);
      expect(result).toBe(false);

      const unchanged = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(unchanged.exports["."].bun).toBe("./src/index.ts");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("findPackageJsonPaths returns main path and uses replaceAll for safeName", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const scoped = join(
        tmp,
        "node_modules",
        "@elizaos",
        "plugin-coding-agent",
      );
      mkdirSync(scoped, { recursive: true });
      writeFileSync(join(scoped, "package.json"), "{}", "utf8");

      const paths = findPackageJsonPaths(tmp, "@elizaos/plugin-coding-agent");
      expect(paths).toContain(
        join(
          tmp,
          "node_modules",
          "@elizaos",
          "plugin-coding-agent",
          "package.json",
        ),
      );
      expect(paths.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("findPackageJsonPaths matches scoped packages in Bun cache", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const bunScoped = join(
        tmp,
        "node_modules",
        ".bun",
        "@noble+hashes@2.0.1",
        "node_modules",
        "@noble",
        "hashes",
      );
      mkdirSync(bunScoped, { recursive: true });
      writeFileSync(join(bunScoped, "package.json"), "{}", "utf8");

      const paths = findPackageJsonPaths(tmp, "@noble/hashes");
      expect(paths).toContain(join(bunScoped, "package.json"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("findPackageJsonPaths deduplicates symlinked node_modules entries that point at the Bun cache", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const cacheDir = join(
        tmp,
        "node_modules",
        ".bun",
        "@elizaos+plugin-agent-orchestrator@0.3.16",
        "node_modules",
        "@elizaos",
        "plugin-agent-orchestrator",
      );
      const mainDir = join(
        tmp,
        "node_modules",
        "@elizaos",
        "plugin-agent-orchestrator",
      );

      mkdirSync(cacheDir, { recursive: true });
      mkdirSync(join(mainDir, ".."), { recursive: true });
      writeFileSync(join(cacheDir, "package.json"), "{}", "utf8");

      try {
        symlinkSync(
          join(
            "..",
            ".bun",
            "@elizaos+plugin-agent-orchestrator@0.3.16",
            "node_modules",
            "@elizaos",
            "plugin-agent-orchestrator",
          ),
          mainDir,
        );
      } catch (err) {
        // Some environments disallow symlink creation; skip the regression in that case.
        if (err instanceof Error) return;
        throw err;
      }

      const paths = findPackageJsonPaths(
        tmp,
        "@elizaos/plugin-agent-orchestrator",
      );
      expect(paths).toHaveLength(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("findPackageFilePaths locates arbitrary files in the Bun cache", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const lockfilePath = join(
        tmp,
        "node_modules",
        ".bun",
        "proper-lockfile@4.1.2",
        "node_modules",
        "proper-lockfile",
        "lib",
        "lockfile.js",
      );
      mkdirSync(join(lockfilePath, ".."), { recursive: true });
      writeFileSync(lockfilePath, "// test", "utf8");

      const paths = findPackageFilePaths(
        tmp,
        "proper-lockfile",
        "lib/lockfile.js",
      );
      expect(paths).toContain(lockfilePath);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchBunExports patches package under root and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@elizaos", "plugin-fake");
      const pkgPath = join(pkgDir, "package.json");
      const pkg = {
        name: "@elizaos/plugin-fake",
        exports: {
          ".": {
            bun: "./src/index.ts",
            import: { default: "./dist/index.js" },
          },
        },
      };
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");

      const logs: string[] = [];
      const patched = patchBunExports(tmp, "@elizaos/plugin-fake", (msg) =>
        logs.push(msg),
      );
      expect(patched).toBe(true);
      expect(logs.some((l) => l.includes("plugin-fake"))).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.exports["."].bun).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyPluginVisionPermissionPatch disables eager camera mode and permission retry spam", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-plugin-vision-test-"));
    try {
      const bundlePath = join(tmp, "index.js");
      writeFileSync(
        bundlePath,
        `class VisionService {
  camera = null;
  lastFrame = null;
  DEFAULT_CONFIG = {
    visionMode: "CAMERA" /* CAMERA */,
  };
  async initializeCameraVision() {
    const toolCheck = await this.checkCameraTools();
  }
  startFrameProcessing() {
    if (this.frameProcessingInterval) {
      return;
    }
    this.frameProcessingInterval = setInterval(async () => {
      if (!this.isProcessing && this.camera) {
      }
    }, this.visionConfig.updateInterval || 100);
  }
  async captureAndProcessFrame() {
    if (!this.camera) {
      return;
    }
    try {
      await this.camera.capture();
    } catch (error) {
      logger14.error("[VisionService] Error capturing frame:", error);
    }
  }
  async captureImage() {
    try {
      return await this.camera.capture();
    } catch (error) {
      logger14.error("[VisionService] Failed to capture image:", error);
      return null;
    }
  }
}`,
        "utf8",
      );

      expect(applyPluginVisionPermissionPatch(bundlePath)).toBe(true);

      const patched = readFileSync(bundlePath, "utf8");
      expect(patched).toContain('visionMode: "OFF" /* OFF */');
      expect(patched).toContain("cameraPermissionDenied = false;");
      expect(patched).toContain(
        "this.frameProcessingInterval || this.cameraPermissionDenied",
      );
      expect(patched).toContain(
        "Camera permission not granted; disabling camera capture until permission is granted.",
      );
      expect(patched).toContain(
        'this.visionConfig.visionMode = "OFF" /* OFF */;',
      );
      expect(patched).toContain(
        "Camera permission not granted; skipping image capture.",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchPluginVisionPermissionHandling patches plugin-vision bundles under root and bun cache", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-plugin-vision-root-"));
    try {
      const rootBundle = join(
        tmp,
        "node_modules",
        "@elizaos",
        "plugin-vision",
        "dist",
        "index.js",
      );
      mkdirSync(join(rootBundle, ".."), { recursive: true });
      writeFileSync(
        rootBundle,
        `class VisionService {
  camera = null;
  lastFrame = null;
  DEFAULT_CONFIG = {
    visionMode: "CAMERA" /* CAMERA */,
  };
  async initializeCameraVision() {
    const toolCheck = await this.checkCameraTools();
  }
  startFrameProcessing() {
    if (this.frameProcessingInterval) {
      return;
    }
    this.frameProcessingInterval = setInterval(async () => {
      if (!this.isProcessing && this.camera) {
      }
    }, this.visionConfig.updateInterval || 100);
  }
  async captureAndProcessFrame() {
    if (!this.camera) {
      return;
    }
    try {
      await this.camera.capture();
    } catch (error) {
      logger14.error("[VisionService] Error capturing frame:", error);
    }
  }
  async captureImage() {
    try {
      return await this.camera.capture();
    } catch (error) {
      logger14.error("[VisionService] Failed to capture image:", error);
      return null;
    }
  }
}`,
        "utf8",
      );

      const logs: string[] = [];
      expect(
        patchPluginVisionPermissionHandling(tmp, (msg) => logs.push(msg)),
      ).toBe(true);

      const patched = readFileSync(rootBundle, "utf8");
      expect(patched).toContain('visionMode: "OFF" /* OFF */');
      expect(logs.some((line) => line.includes("@elizaos/plugin-vision"))).toBe(
        true,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("repairElizaCoreRuntimeDist copies runtime dist into a broken cached core package", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const sourcePkgDir = join(tmp, "node_modules", "@elizaos", "core");
      const brokenPkgDir = join(
        tmp,
        "node_modules",
        ".bun",
        "@elizaos+core@2.0.0-alpha.21",
        "node_modules",
        "@elizaos",
        "core",
      );

      mkdirSync(join(sourcePkgDir, "dist", "node"), { recursive: true });
      mkdirSync(join(sourcePkgDir, "dist", "browser"), { recursive: true });
      writeFileSync(join(sourcePkgDir, "dist", "index.js"), "// root", "utf8");
      writeFileSync(
        join(sourcePkgDir, "dist", "node", "index.node.js"),
        "// node",
        "utf8",
      );
      writeFileSync(
        join(sourcePkgDir, "dist", "browser", "index.browser.js"),
        "// browser",
        "utf8",
      );

      mkdirSync(join(brokenPkgDir, "dist", "testing"), { recursive: true });
      writeFileSync(
        join(brokenPkgDir, "dist", "testing", "index.js"),
        "// only testing",
        "utf8",
      );

      const patched = repairElizaCoreRuntimeDist(brokenPkgDir, sourcePkgDir);
      expect(patched).toBe(true);
      expect(readFileSync(join(brokenPkgDir, "dist", "index.js"), "utf8")).toBe(
        "// root",
      );
      expect(
        readFileSync(
          join(brokenPkgDir, "dist", "node", "index.node.js"),
          "utf8",
        ),
      ).toBe("// node");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchBrokenElizaCoreRuntimeDists repairs broken Bun cache copies from the root install", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const rootPkgDir = join(tmp, "node_modules", "@elizaos", "core");
      const brokenPkgDir = join(
        tmp,
        "node_modules",
        ".bun",
        "@elizaos+core@2.0.0-alpha.13",
        "node_modules",
        "@elizaos",
        "core",
      );

      mkdirSync(join(rootPkgDir, "dist", "node"), { recursive: true });
      mkdirSync(join(rootPkgDir, "dist", "browser"), { recursive: true });
      writeFileSync(join(rootPkgDir, "package.json"), "{}", "utf8");
      writeFileSync(join(rootPkgDir, "dist", "index.js"), "// root", "utf8");
      writeFileSync(
        join(rootPkgDir, "dist", "node", "index.node.js"),
        "// node",
        "utf8",
      );
      writeFileSync(
        join(rootPkgDir, "dist", "browser", "index.browser.js"),
        "// browser",
        "utf8",
      );

      mkdirSync(join(brokenPkgDir, "dist", "testing"), { recursive: true });
      writeFileSync(join(brokenPkgDir, "package.json"), "{}", "utf8");
      writeFileSync(
        join(brokenPkgDir, "dist", "testing", "index.js"),
        "// only testing",
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchBrokenElizaCoreRuntimeDists(tmp, (msg) =>
        logs.push(msg),
      );

      expect(patched).toBe(true);
      expect(logs.some((line) => line.includes("Repaired @elizaos/core"))).toBe(
        true,
      );
      expect(
        readFileSync(
          join(brokenPkgDir, "dist", "node", "index.node.js"),
          "utf8",
        ),
      ).toBe("// node");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("pruneNestedElizaPluginCoreCopies removes stale plugin-local core installs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const rootCoreDir = join(tmp, "node_modules", "@elizaos", "core");
      const pluginDir = join(tmp, "node_modules", "@elizaos", "plugin-ollama");
      const nestedCoreDir = join(pluginDir, "node_modules", "@elizaos", "core");

      mkdirSync(rootCoreDir, { recursive: true });
      mkdirSync(nestedCoreDir, { recursive: true });
      writeFileSync(
        join(rootCoreDir, "package.json"),
        JSON.stringify({ name: "@elizaos/core", version: "2.0.0-alpha.98" }),
        "utf8",
      );
      writeFileSync(
        join(pluginDir, "package.json"),
        JSON.stringify({
          name: "@elizaos/plugin-ollama",
          version: "2.0.0-alpha.70",
        }),
        "utf8",
      );
      writeFileSync(
        join(nestedCoreDir, "package.json"),
        JSON.stringify({ name: "@elizaos/core", version: "2.0.0-alpha.86" }),
        "utf8",
      );

      const logs: string[] = [];
      const patched = pruneNestedElizaPluginCoreCopies(tmp, (msg) =>
        logs.push(msg),
      );

      expect(patched).toBe(true);
      expect(existsSync(nestedCoreDir)).toBe(false);
      expect(existsSync(rootCoreDir)).toBe(true);
      expect(logs.some((line) => line.includes("@elizaos/plugin-ollama"))).toBe(
        true,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("pruneNestedElizaPluginCoreCopies scans Bun cache plugin installs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const rootCoreDir = join(tmp, "node_modules", "@elizaos", "core");
      const pluginDir = join(
        tmp,
        "node_modules",
        ".bun",
        "@elizaos+plugin-openrouter@2.0.0-alpha.10",
        "node_modules",
        "@elizaos",
        "plugin-openrouter",
      );
      const nestedCoreDir = join(pluginDir, "node_modules", "@elizaos", "core");

      mkdirSync(rootCoreDir, { recursive: true });
      mkdirSync(nestedCoreDir, { recursive: true });
      writeFileSync(
        join(rootCoreDir, "package.json"),
        JSON.stringify({ name: "@elizaos/core", version: "2.0.0-alpha.98" }),
        "utf8",
      );
      writeFileSync(
        join(pluginDir, "package.json"),
        JSON.stringify({
          name: "@elizaos/plugin-openrouter",
          version: "2.0.0-alpha.10",
        }),
        "utf8",
      );
      writeFileSync(
        join(nestedCoreDir, "package.json"),
        JSON.stringify({ name: "@elizaos/core", version: "2.0.0-alpha.86" }),
        "utf8",
      );

      expect(pruneNestedElizaPluginCoreCopies(tmp)).toBe(true);
      expect(existsSync(nestedCoreDir)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchElizaCoreStreamingTtsHandlerGuard rewrites TEXT_TO_SPEECH calls when handler may be missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@elizaos", "core");
      const nodePath = join(pkgDir, "dist", "node", "index.node.js");
      mkdirSync(join(pkgDir, "dist", "node"), { recursive: true });
      writeFileSync(join(pkgDir, "package.json"), "{}", "utf8");
      writeFileSync(
        nodePath,
        [
          "const result2 = await runtime2.useModel(ModelType.TEXT_TO_SPEECH, params);",
          "other();",
          "const result2 = await runtime2.useModel(ModelType.TEXT_TO_SPEECH, params);",
          'runtime2.logger.error({ error }, "Error generating voice for remaining text")',
        ].join("\n"),
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchElizaCoreStreamingTtsHandlerGuard(tmp, (msg) =>
        logs.push(msg),
      );

      expect(patched).toBe(true);
      const out = readFileSync(nodePath, "utf8");
      expect(out).not.toContain(
        "const result2 = await runtime2.useModel(ModelType.TEXT_TO_SPEECH, params);",
      );
      expect(out).toContain(
        "runtime2.getModel(ModelType.TEXT_TO_SPEECH) ? await runtime2.useModel(ModelType.TEXT_TO_SPEECH, params) : void 0",
      );
      expect(logs.some((line) => line.includes("streaming TTS guard"))).toBe(
        true,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchElizaCoreStreamingRetryPlaceholder removes retry onChunk placeholder", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@elizaos", "core");
      const nodePath = join(pkgDir, "dist", "node", "index.node.js");
      const browserPath = join(pkgDir, "dist", "browser", "index.browser.js");
      mkdirSync(join(pkgDir, "dist", "node"), { recursive: true });
      mkdirSync(join(pkgDir, "dist", "browser"), { recursive: true });
      writeFileSync(join(pkgDir, "package.json"), "{}", "utf8");
      writeFileSync(
        nodePath,
        [
          "signalRetry(retryCount) {",
          '    this.state = "retrying";',
          "    if (!this.config.hasRichConsumer) {",
          "      this.config.onChunk(`",
          "-- that's not right, let me start again:",
          "`);",
          "    }",
          '    this.emitEvent({ eventType: "retry_start" });',
          "  }",
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        browserPath,
        'signalRetry($){if(this.state="retrying",!this.config.hasRichConsumer)this.config.onChunk(`\n-- that\'s not right, let me start again:\n`);return this.emitEvent({});}',
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchElizaCoreStreamingRetryPlaceholder(tmp, (msg) =>
        logs.push(msg),
      );

      expect(patched).toBe(true);
      expect(readFileSync(nodePath, "utf8")).not.toContain("not right");
      expect(readFileSync(browserPath, "utf8")).not.toContain("not right");
      expect(readFileSync(browserPath, "utf8")).toContain(
        'this.state="retrying"',
      );
      expect(
        logs.some((line) => line.includes("streaming retry placeholder")),
      ).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyExtensionlessJsExportAliases adds extensionless aliases for .js subpaths", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@noble", "hashes");
      const pkgPath = join(pkgDir, "package.json");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: "@noble/hashes",
            exports: {
              ".": "./index.js",
              "./sha3.js": "./sha3.js",
              "./utils.js": "./utils.js",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const patched = applyExtensionlessJsExportAliases(pkgPath);
      expect(patched).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.exports["./sha3"]).toBe("./sha3.js");
      expect(updated.exports["./utils"]).toBe("./utils.js");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchExtensionlessJsExports patches package under root and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@noble", "hashes");
      const pkgPath = join(pkgDir, "package.json");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: "@noble/hashes",
            exports: {
              ".": "./index.js",
              "./sha3.js": "./sha3.js",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchExtensionlessJsExports(tmp, "@noble/hashes", (msg) =>
        logs.push(msg),
      );
      expect(patched).toBe(true);
      expect(logs.some((l) => l.includes("@noble/hashes"))).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.exports["./sha3"]).toBe("./sha3.js");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyNobleHashesCompat restores legacy ethers shims for @noble/hashes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@noble", "hashes");
      const pkgPath = join(pkgDir, "package.json");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, "legacy.js"), "export const ripemd160 = 1;\n");
      writeFileSync(
        join(pkgDir, "sha2.js"),
        "export const sha256 = 1; export const sha512 = 2;\n",
      );
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: "@noble/hashes",
            version: "2.0.1",
            exports: {
              ".": "./index.js",
              "./sha3": "./sha3.js",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const patched = applyNobleHashesCompat(pkgPath);
      expect(patched).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.exports["./ripemd160"]).toBe("./ripemd160.js");
      expect(updated.exports["./ripemd160.js"]).toBe("./ripemd160.js");
      expect(updated.exports["./sha256"]).toBe("./sha256.js");
      expect(updated.exports["./sha512"]).toBe("./sha512.js");
      expect(readFileSync(join(pkgDir, "ripemd160.js"), "utf8")).toContain(
        'export { ripemd160 } from "./legacy.js";',
      );
      expect(readFileSync(join(pkgDir, "sha256.js"), "utf8")).toContain(
        'export { sha256 } from "./sha2.js";',
      );
      expect(readFileSync(join(pkgDir, "sha512.js"), "utf8")).toContain(
        'export { sha512 } from "./sha2.js";',
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchNobleHashesCompat patches package copies and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@noble", "hashes");
      const pkgPath = join(pkgDir, "package.json");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, "legacy.js"), "export const ripemd160 = 1;\n");
      writeFileSync(
        join(pkgDir, "sha2.js"),
        "export const sha256 = 1; export const sha512 = 2;\n",
      );
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: "@noble/hashes",
            version: "2.0.1",
            exports: {
              ".": "./index.js",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchNobleHashesCompat(tmp, (msg) => logs.push(msg));
      expect(patched).toBe(true);
      expect(logs.some((l) => l.includes("ethers-compatible"))).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.exports["./sha256"]).toBe("./sha256.js");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyMissingLifecycleScriptPatch removes broken postinstall hooks when the target file is missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@elizaos", "plugin-fake");
      const pkgPath = join(pkgDir, "package.json");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: "@elizaos/plugin-fake",
            scripts: {
              postinstall: "node ./scripts/missing-hook.mjs",
              build: "bun run build.ts",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const patched = applyMissingLifecycleScriptPatch(
        pkgPath,
        "postinstall",
        "./scripts/missing-hook.mjs",
      );
      expect(patched).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.scripts.postinstall).toBeUndefined();
      expect(updated.scripts.build).toBe("bun run build.ts");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchMissingLifecycleScript patches package copies and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@elizaos", "plugin-fake");
      const pkgPath = join(pkgDir, "package.json");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: "@elizaos/plugin-fake",
            scripts: {
              postinstall: "node ./scripts/missing-hook.mjs",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchMissingLifecycleScript(
        tmp,
        "@elizaos/plugin-fake",
        "postinstall",
        "./scripts/missing-hook.mjs",
        (msg) => logs.push(msg),
      );
      expect(patched).toBe(true);
      expect(logs.some((l) => l.includes("missing-hook.mjs"))).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.scripts).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAutonomousMiladyOnboardingPresetsPatch replaces upstream presets with Milady's source", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "agent",
        "packages",
        "agent",
        "src",
        "onboarding-presets.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(filePath, 'export const STYLE_PRESETS = ["upstream"];\n');

      const miladySource =
        'export const SHARED_STYLE_RULES = ["Keep responses brief."];\nexport const STYLE_PRESETS = ["milady"];\n';
      const patched = applyAutonomousMiladyOnboardingPresetsPatch(
        filePath,
        miladySource,
      );

      expect(patched).toBe(true);
      expect(readFileSync(filePath, "utf8")).toBe(miladySource);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchAutonomousMiladyOnboardingPresets patches installed autonomous copies and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const rootSourcePath = join(
        tmp,
        "packages",
        "app-core",
        "src",
        "onboarding-presets.ts",
      );
      const rootPkgPath = join(
        tmp,
        "node_modules",
        "@miladyai",
        "agent",
        "packages",
        "agent",
        "src",
        "onboarding-presets.js",
      );
      const tsPkgPath = join(
        tmp,
        "node_modules",
        ".bun",
        "@miladyai+agent@2.0.0-alpha.74",
        "node_modules",
        "@miladyai",
        "agent",
        "src",
        "onboarding-presets.ts",
      );
      const cachedPkgPath = join(
        tmp,
        "node_modules",
        ".bun",
        "@miladyai+agent@2.0.0-alpha.53",
        "node_modules",
        "@miladyai",
        "agent",
        "packages",
        "agent",
        "src",
        "onboarding-presets.js",
      );

      mkdirSync(join(rootSourcePath, ".."), { recursive: true });
      mkdirSync(join(rootPkgPath, ".."), { recursive: true });
      mkdirSync(join(tsPkgPath, ".."), { recursive: true });
      mkdirSync(join(cachedPkgPath, ".."), { recursive: true });

      const miladySource =
        'export const SHARED_STYLE_RULES = ["Keep responses brief."] as const;\nexport const CHARACTER_PRESET_META: Record<string, { avatarIndex: number }> = { chen: { avatarIndex: 1 } };\n';
      writeFileSync(rootSourcePath, miladySource, "utf8");
      writeFileSync(
        rootPkgPath,
        'export const STYLE_PRESETS = ["upstream"];\n',
      );
      writeFileSync(tsPkgPath, 'export const STYLE_PRESETS = ["upstream"];\n');
      writeFileSync(
        cachedPkgPath,
        'export const STYLE_PRESETS = ["upstream"];\n',
      );

      const logs: string[] = [];
      const patched = patchAutonomousMiladyOnboardingPresets(tmp, (msg) =>
        logs.push(msg),
      );

      expect(patched).toBe(true);
      const patchedJsSource = readFileSync(rootPkgPath, "utf8");
      expect(patchedJsSource).toContain(
        'export const SHARED_STYLE_RULES = ["Keep responses brief."];',
      );
      expect(patchedJsSource).toContain(
        "export const CHARACTER_PRESET_META = { chen: { avatarIndex: 1 } };",
      );
      expect(patchedJsSource).not.toContain("as const");
      expect(patchedJsSource).not.toContain("Record<");
      expect(readFileSync(cachedPkgPath, "utf8")).toBe(patchedJsSource);
      expect(readFileSync(tsPkgPath, "utf8")).toBe(miladySource);
      expect(
        logs.some((line) =>
          line.includes(
            "@miladyai/agent packages/agent/src/onboarding-presets.js",
          ),
        ),
      ).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyProperLockfileSignalExitCompat supports signal-exit v3 and v4 shapes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "proper-lockfile",
        "lib",
        "lockfile.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        "const onExit = require('signal-exit');\nonExit(() => {});\n",
        "utf8",
      );

      const patched = applyProperLockfileSignalExitCompat(filePath);
      expect(patched).toBe(true);
      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain("const signalExit = require('signal-exit');");
      expect(updated).toContain(
        "const onExit = typeof signalExit === 'function' ? signalExit : signalExit.onExit;",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchProperLockfileSignalExitCompat patches discovered copies and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        ".bun",
        "proper-lockfile@4.1.2",
        "node_modules",
        "proper-lockfile",
        "lib",
        "lockfile.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        "const onExit = require('signal-exit');\nonExit(() => {});\n",
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchProperLockfileSignalExitCompat(tmp, (msg) =>
        logs.push(msg),
      );
      expect(patched).toBe(true);
      expect(logs.some((l) => l.includes("proper-lockfile"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyPtyManagerCursorPositionCompat injects cursor-position replies", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const target = join(tmp, "dist", "index.js");
      mkdirSync(join(tmp, "dist"), { recursive: true });
      writeFileSync(
        target,
        [
          "class PTYSession {",
          "  setupEventHandlers() {",
          "    if (!this.ptyProcess) return;",
          "    this.ptyProcess.onData((data) => {",
          "      this._lastActivityAt = /* @__PURE__ */ new Date();",
          "      this.outputBuffer += data;",
          '      this.emit("output", data);',
          "      if (!this._processScheduled) {",
          "        this._processScheduled = true;",
          "      }",
          "    });",
          "  }",
          "  /**",
          "   * Process the accumulated output buffer.",
          "   */",
          "}",
        ].join("\n"),
        "utf8",
      );

      const patched = applyPtyManagerCursorPositionCompat(target);
      expect(patched).toBe(true);

      const updated = readFileSync(target, "utf8");
      expect(updated).toContain("respondToCursorPositionRequests(data)");
      expect(updated).toContain("data.replace(/\\x1B\\[6n/g");
      expect(updated).toContain('this.ptyProcess.write("\\x1B[1;1R");');
      expect(updated).toContain("if (sanitizedData.length > 0)");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyPtyManagerCursorPositionCompat patches the ESM bundle too", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const target = join(tmp, "dist", "index.mjs");
      mkdirSync(join(tmp, "dist"), { recursive: true });
      writeFileSync(
        target,
        [
          "class PTYSession {",
          "  setupEventHandlers() {",
          "    if (!this.ptyProcess) return;",
          "    this.ptyProcess.onData((data) => {",
          "      this._lastActivityAt = /* @__PURE__ */ new Date();",
          "      this.outputBuffer += data;",
          '      this.emit("output", data);',
          "      if (!this._processScheduled) {",
          "        this._processScheduled = true;",
          "      }",
          "    });",
          "  }",
          "  /**",
          "   * Process the accumulated output buffer.",
          "   */",
          "}",
        ].join("\n"),
        "utf8",
      );

      const patched = applyPtyManagerCursorPositionCompat(target);
      expect(patched).toBe(true);

      const updated = readFileSync(target, "utf8");
      expect(updated).toContain("respondToCursorPositionRequests(data)");
      expect(updated).toContain("data.replace(/\\x1B\\[6n/g");
      expect(updated).toContain('this.ptyProcess.write("\\x1B[1;1R");');
      expect(updated).toContain("if (sanitizedData.length > 0)");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyPtyManagerEsmDirnameCompat defines __dirname in the ESM bundle", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const target = join(tmp, "dist", "index.mjs");
      mkdirSync(join(tmp, "dist"), { recursive: true });
      writeFileSync(
        target,
        [
          'var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : x)(function(x) {',
          '  if (typeof require !== "undefined") return require.apply(this, arguments);',
          `  throw Error('Dynamic require of "' + x + '" is not supported');`,
          "});",
          'import { join, relative, dirname } from "path";',
          'import { execSync } from "child_process";',
          'const packageRoot = join(__dirname, "..");',
        ].join("\n"),
        "utf8",
      );

      const patched = applyPtyManagerEsmDirnameCompat(target);
      expect(patched).toBe(true);

      const updated = readFileSync(target, "utf8");
      expect(updated).toContain('import { createRequire } from "module";');
      expect(updated).toContain(
        "const __require = createRequire(import.meta.url);",
      );
      expect(updated).toContain('import { fileURLToPath } from "url";');
      expect(updated).toContain(
        "const __dirname = dirname(fileURLToPath(import.meta.url));",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchPtyManagerEsmDirnameCompat patches installed ESM bundles and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "pty-manager", "dist");
      mkdirSync(pkgDir, { recursive: true });
      const target = join(pkgDir, "index.mjs");
      writeFileSync(
        target,
        [
          'var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : x)(function(x) {',
          '  if (typeof require !== "undefined") return require.apply(this, arguments);',
          `  throw Error('Dynamic require of "' + x + '" is not supported');`,
          "});",
          'import { join, relative, dirname } from "path";',
          'import { execSync } from "child_process";',
          'const packageRoot = join(__dirname, "..");',
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        join(tmp, "node_modules", "pty-manager", "package.json"),
        JSON.stringify({ name: "pty-manager" }, null, 2),
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchPtyManagerEsmDirnameCompat(tmp, (msg) =>
        logs.push(msg),
      );

      expect(patched).toBe(true);
      expect(readFileSync(target, "utf8")).toContain(
        "const __require = createRequire(import.meta.url);",
      );
      expect(readFileSync(target, "utf8")).toContain(
        "const __dirname = dirname(fileURLToPath(import.meta.url));",
      );
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain("pty-manager");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchPtyManagerEsmDirnameCompat handles aliased path imports", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "pty-manager", "dist");
      const target = join(pkgDir, "index.mjs");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        target,
        [
          'var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : x)(function(x) {',
          '  if (typeof require !== "undefined") return require.apply(this, arguments);',
          `  throw Error('Dynamic require of "' + x + '" is not supported');`,
          "});",
          'import { execSync } from "child_process";',
          'import { dirname, join as join2, relative } from "path";',
          'const packageRoot = join2(__dirname, "..");',
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        join(tmp, "node_modules", "pty-manager", "package.json"),
        JSON.stringify({ name: "pty-manager" }, null, 2),
        "utf8",
      );

      const patched = patchPtyManagerEsmDirnameCompat(tmp, () => {});

      expect(patched).toBe(true);
      const updated = readFileSync(target, "utf8");
      expect(updated).toContain('import { fileURLToPath } from "url";');
      expect(updated).toContain(
        "const __dirname = dirname(fileURLToPath(import.meta.url));",
      );
      expect(updated).toContain(
        "const __require = createRequire(import.meta.url);",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchPtyManagerCursorPositionCompat patches installed CJS, ESM, and worker files", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "pty-manager", "dist");
      const managerPath = join(pkgDir, "index.js");
      const esmPath = join(pkgDir, "index.mjs");
      const workerPath = join(pkgDir, "pty-worker.js");
      mkdirSync(pkgDir, { recursive: true });

      const source = [
        "class PTYSession {",
        "  setupEventHandlers() {",
        "    if (!this.ptyProcess) return;",
        "    this.ptyProcess.onData((data) => {",
        "      this._lastActivityAt = /* @__PURE__ */ new Date();",
        "      this.outputBuffer += data;",
        '      this.emit("output", data);',
        "      if (!this._processScheduled) {",
        "        this._processScheduled = true;",
        "      }",
        "    });",
        "  }",
        "  /**",
        "   * Process the accumulated output buffer.",
        "   */",
        "}",
      ].join("\n");

      writeFileSync(managerPath, source, "utf8");
      writeFileSync(esmPath, source, "utf8");
      writeFileSync(workerPath, source, "utf8");
      writeFileSync(
        join(tmp, "node_modules", "pty-manager", "package.json"),
        JSON.stringify({ name: "pty-manager" }, null, 2),
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchPtyManagerCursorPositionCompat(tmp, (msg) =>
        logs.push(msg),
      );

      expect(patched).toBe(true);
      expect(readFileSync(managerPath, "utf8")).toContain(
        'this.ptyProcess.write("\\x1B[1;1R");',
      );
      expect(readFileSync(esmPath, "utf8")).toContain(
        'this.ptyProcess.write("\\x1B[1;1R");',
      );
      expect(readFileSync(workerPath, "utf8")).toContain(
        'this.ptyProcess.write("\\x1B[1;1R");',
      );
      expect(logs).toHaveLength(3);
      expect(logs.every((line) => line.includes("pty-manager"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyCodexFolderApprovalPromptCompat expands Codex trust prompt matching", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const target = join(tmp, "dist", "index.js");
      mkdirSync(join(tmp, "dist"), { recursive: true });
      writeFileSync(
        target,
        [
          "const adapter = {",
          "  autoResponseRules: [",
          "    {",
          "      pattern: /do.?you.?trust.?the.?contents|trust.?this.?directory|yes,?.?continue|prompt.?injection/i,",
          "    },",
          "  ],",
          "};",
          "function detectBlockingPrompt(stripped) {",
          "    if (/would.?you.?like.?to.?run.?the.?following.?command/i.test(stripped) || /do.?you.?want.?to.?approve.?access/i.test(stripped) || /would.?you.?like.?to.?make.?the.?following.?edits/i.test(stripped) || /press.?enter.?to.?confirm/i.test(stripped) && /esc.?to.?cancel/i.test(stripped)) {",
          "    return true;",
          "  }",
          "  return false;",
          "}",
        ].join("\n"),
        "utf8",
      );

      const patched = applyCodexFolderApprovalPromptCompat(target);
      expect(patched).toBe(true);

      const updated = readFileSync(target, "utf8");
      expect(updated).toContain("allow.?codex.?to.?work.?in.?this.?folder");
      expect(updated).toContain("without.?asking.?for.?approval");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchCodexFolderApprovalPromptCompat patches installed ESM and CJS adapter bundles", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "coding-agent-adapters", "dist");
      const esmPath = join(pkgDir, "index.js");
      const cjsPath = join(pkgDir, "index.cjs");
      mkdirSync(pkgDir, { recursive: true });

      const source = [
        "const adapter = {",
        "  autoResponseRules: [",
        "    {",
        "      pattern: /do.?you.?trust.?the.?contents|trust.?this.?directory|yes,?.?continue|prompt.?injection/i,",
        "    },",
        "  ],",
        "};",
        "function detectBlockingPrompt(stripped) {",
        "    if (/would.?you.?like.?to.?run.?the.?following.?command/i.test(stripped) || /do.?you.?want.?to.?approve.?access/i.test(stripped) || /would.?you.?like.?to.?make.?the.?following.?edits/i.test(stripped) || /press.?enter.?to.?confirm/i.test(stripped) && /esc.?to.?cancel/i.test(stripped)) {",
        "    return true;",
        "  }",
        "  return false;",
        "}",
      ].join("\n");

      writeFileSync(esmPath, source, "utf8");
      writeFileSync(cjsPath, source, "utf8");
      writeFileSync(
        join(tmp, "node_modules", "coding-agent-adapters", "package.json"),
        JSON.stringify({ name: "coding-agent-adapters" }, null, 2),
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchCodexFolderApprovalPromptCompat(tmp, (msg) =>
        logs.push(msg),
      );

      expect(patched).toBe(true);
      expect(readFileSync(esmPath, "utf8")).toContain(
        "allow.?codex.?to.?work.?in.?this.?folder",
      );
      expect(readFileSync(cjsPath, "utf8")).toContain(
        "allow.?codex.?to.?work.?in.?this.?folder",
      );
      expect(logs).toHaveLength(2);
      expect(logs.every((line) => line.includes("coding-agent-adapters"))).toBe(
        true,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("warnStaleBunCache", () => {
  function makeTmp() {
    return mkdtempSync(join(tmpdir(), "bust-cache-"));
  }

  function makeBunCacheEntry(bunDir: string, name: string) {
    const dir = join(bunDir, name, "node_modules");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "marker.txt"), "ok", "utf8");
  }

  it("returns 0 when no .bun dir exists", () => {
    const tmp = makeTmp();
    try {
      mkdirSync(join(tmp, "node_modules"), { recursive: true });
      const logs: string[] = [];
      const count = warnStaleBunCache(tmp, (msg: string) => logs.push(msg));
      expect(count).toBe(0);
      expect(logs).toHaveLength(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("detects stale entries when two versions share the same hash", () => {
    const tmp = makeTmp();
    try {
      const bunDir = join(tmp, "node_modules/.bun");
      makeBunCacheEntry(bunDir, "@elizaos+core@2.0.0-alpha.77+samehash");
      makeBunCacheEntry(bunDir, "@elizaos+core@2.0.0-alpha.81+samehash");

      const logs: string[] = [];
      const count = warnStaleBunCache(tmp, (msg: string) => logs.push(msg));
      expect(count).toBe(1);
      expect(logs.some((l) => l.includes("stale Bun cache entries"))).toBe(
        true,
      );
      // Entries are NOT removed (detect-only), just warned about
      expect(
        existsSync(join(bunDir, "@elizaos+core@2.0.0-alpha.77+samehash")),
      ).toBe(true);
      expect(
        existsSync(join(bunDir, "@elizaos+core@2.0.0-alpha.81+samehash")),
      ).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns 0 when versions have different hashes", () => {
    const tmp = makeTmp();
    try {
      const bunDir = join(tmp, "node_modules/.bun");
      makeBunCacheEntry(bunDir, "@elizaos+autonomous@2.0.0-alpha.77+oldhash");
      makeBunCacheEntry(bunDir, "@elizaos+autonomous@2.0.0-alpha.81+newhash");

      const logs: string[] = [];
      const count = warnStaleBunCache(tmp, (msg: string) => logs.push(msg));
      expect(count).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("skips when stamp matches package.json version", () => {
    const tmp = makeTmp();
    try {
      const bunDir = join(tmp, "node_modules/.bun");
      mkdirSync(bunDir, { recursive: true });
      makeBunCacheEntry(bunDir, "@elizaos+core@2.0.0-alpha.77+samehash");
      makeBunCacheEntry(bunDir, "@elizaos+core@2.0.0-alpha.81+samehash");
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({ version: "1.0.0" }),
        "utf8",
      );
      writeFileSync(join(bunDir, ".bust-cache-stamp"), "1.0.0", "utf8");

      const logs: string[] = [];
      const count = warnStaleBunCache(tmp, (msg: string) => logs.push(msg));
      expect(count).toBe(0); // Stamp matches, skip check
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("re-checks when package.json version changes", () => {
    const tmp = makeTmp();
    try {
      const bunDir = join(tmp, "node_modules/.bun");
      mkdirSync(bunDir, { recursive: true });
      makeBunCacheEntry(bunDir, "@elizaos+core@2.0.0-alpha.77+samehash");
      makeBunCacheEntry(bunDir, "@elizaos+core@2.0.0-alpha.81+samehash");
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({ version: "2.0.0" }),
        "utf8",
      );
      writeFileSync(join(bunDir, ".bust-cache-stamp"), "1.0.0", "utf8");

      const logs: string[] = [];
      const count = warnStaleBunCache(tmp, (msg: string) => logs.push(msg));
      expect(count).toBe(1);
      // Stamp updated to new version
      const stamp = readFileSync(
        join(bunDir, ".bust-cache-stamp"),
        "utf8",
      ).trim();
      expect(stamp).toBe("2.0.0");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("ignores non-tracked package prefixes", () => {
    const tmp = makeTmp();
    try {
      const bunDir = join(tmp, "node_modules/.bun");
      makeBunCacheEntry(bunDir, "@elizaos+plugin-sql@2.0.0-alpha.77+samehash");
      makeBunCacheEntry(bunDir, "@elizaos+plugin-sql@2.0.0-alpha.81+samehash");

      const logs: string[] = [];
      const count = warnStaleBunCache(tmp, (msg: string) => logs.push(msg));
      expect(count).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// patchElectrobunWindowsTar
// ---------------------------------------------------------------------------

const ELECTROBUN_CJS_UNPATCHED = `const tarballPath = join(cacheDir, \`electrobun-\${platform}-\${arch}.tar.gz\`);
await downloadFile(tarballUrl, tarballPath);
execSync(\`tar -xzf "\${tarballPath}"\`, { cwd: cacheDir, stdio: 'pipe' });
unlinkSync(tarballPath);`;

const ELECTROBUN_CJS_PATCHED = `const tarballPath = join(cacheDir, \`electrobun-\${platform}-\${arch}.tar.gz\`);
await downloadFile(tarballUrl, tarballPath);
execSync(\`tar -xzf electrobun-\${platform}-\${arch}.tar.gz\`, { cwd: cacheDir, stdio: 'pipe' });
unlinkSync(tarballPath);`;

const PLATFORM_PLACEHOLDER = "$" + "{platform}";
const ARCH_PLACEHOLDER = "$" + "{arch}";
const TARBALL_PATH_PLACEHOLDER = "$" + "{tarballPath}";

describe("patchElectrobunWindowsTar", () => {
  it("patches the tar command and returns true", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-electrobun-tar-"));
    try {
      const cjsPath = join(tmp, "node_modules", "electrobun", "bin");
      mkdirSync(cjsPath, { recursive: true });
      writeFileSync(
        join(cjsPath, "electrobun.cjs"),
        ELECTROBUN_CJS_UNPATCHED,
        "utf8",
      );

      expect(patchElectrobunWindowsTar(tmp)).toBe(true);

      const patched = readFileSync(join(cjsPath, "electrobun.cjs"), "utf8");
      expect(patched).toContain(
        `electrobun-${PLATFORM_PLACEHOLDER}-${ARCH_PLACEHOLDER}.tar.gz\``,
      );
      expect(patched).not.toContain(`"${TARBALL_PATH_PLACEHOLDER}"`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns false when already patched", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-electrobun-tar-"));
    try {
      const cjsPath = join(tmp, "node_modules", "electrobun", "bin");
      mkdirSync(cjsPath, { recursive: true });
      writeFileSync(
        join(cjsPath, "electrobun.cjs"),
        ELECTROBUN_CJS_PATCHED,
        "utf8",
      );

      expect(patchElectrobunWindowsTar(tmp)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns false when needle is absent", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-electrobun-tar-"));
    try {
      const cjsPath = join(tmp, "node_modules", "electrobun", "bin");
      mkdirSync(cjsPath, { recursive: true });
      writeFileSync(
        join(cjsPath, "electrobun.cjs"),
        "// unrelated content",
        "utf8",
      );

      expect(patchElectrobunWindowsTar(tmp)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("logs a message on successful patch", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-electrobun-tar-"));
    try {
      const cjsPath = join(tmp, "node_modules", "electrobun", "bin");
      mkdirSync(cjsPath, { recursive: true });
      writeFileSync(
        join(cjsPath, "electrobun.cjs"),
        ELECTROBUN_CJS_UNPATCHED,
        "utf8",
      );

      const logs: string[] = [];
      patchElectrobunWindowsTar(tmp, (msg: string) => logs.push(msg));

      expect(logs.some((line) => line.includes("electrobun"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("finds and patches electrobun in the .bun cache", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-electrobun-tar-"));
    try {
      const cjsPath = join(
        tmp,
        "node_modules",
        ".bun",
        "electrobun@1.16.0",
        "node_modules",
        "electrobun",
        "bin",
      );
      mkdirSync(cjsPath, { recursive: true });
      writeFileSync(
        join(cjsPath, "electrobun.cjs"),
        ELECTROBUN_CJS_UNPATCHED,
        "utf8",
      );

      expect(patchElectrobunWindowsTar(tmp)).toBe(true);

      const patched = readFileSync(join(cjsPath, "electrobun.cjs"), "utf8");
      expect(patched).not.toContain(`"${TARBALL_PATH_PLACEHOLDER}"`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
