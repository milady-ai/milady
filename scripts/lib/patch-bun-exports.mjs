/**
 * Patch @elizaos packages whose exports["."].bun points to ./src/index.ts
 * (missing in published tarball). Exported for use by patch-deps.mjs and tests.
 * See docs/plugin-resolution-and-node-path.md "Bun and published package exports".
 */
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const ELIZA_CORE_RUNTIME_FILES = [
  "dist/index.js",
  "dist/browser/index.browser.js",
  "dist/node/index.node.js",
];

/**
 * Find all package.json paths for pkgName under root (main node_modules and
 * Bun cache). Match Bun's cache dir naming: @scope/pkg → scope+pkg.
 * Exported for tests.
 */
export function findPackageJsonPaths(root, pkgName) {
  return findPackageFilePaths(root, pkgName, "package.json");
}

/**
 * Find all matching files for pkgName under root (main node_modules and Bun
 * cache). Exported so tests and other patch helpers share the same lookup.
 */
export function findPackageFilePaths(root, pkgName, relativePath) {
  const candidates = [];
  const mainPath = resolve(root, "node_modules", pkgName, relativePath);
  if (existsSync(mainPath)) candidates.push(mainPath);
  const bunCache = resolve(root, "node_modules/.bun");
  if (existsSync(bunCache)) {
    const safeNames = new Set([
      pkgName.replaceAll("/", "+"),
      pkgName.replaceAll("/", "+").replaceAll("@", ""),
    ]);
    for (const entry of readdirSync(bunCache)) {
      if (![...safeNames].some((safeName) => entry.startsWith(safeName)))
        continue;
      const p = resolve(bunCache, entry, "node_modules", pkgName, relativePath);
      if (existsSync(p)) candidates.push(p);
    }
  }
  return candidates;
}

function hasRequiredFiles(dirPath, relativePaths) {
  return relativePaths.every((relativePath) =>
    existsSync(resolve(dirPath, relativePath)),
  );
}

/**
 * Some published @elizaos/core builds in Bun's cache only contain dist/testing,
 * but their package.json still exports dist/node and dist/browser. Copy the
 * runtime dist from a healthy install when that happens so dependents can boot.
 */
export function repairElizaCoreRuntimeDist(targetPkgDir, sourcePkgDir) {
  if (!targetPkgDir || !sourcePkgDir) return false;
  if (targetPkgDir === sourcePkgDir) return false;
  if (!existsSync(targetPkgDir)) return false;
  if (!hasRequiredFiles(sourcePkgDir, ELIZA_CORE_RUNTIME_FILES)) return false;
  if (hasRequiredFiles(targetPkgDir, ELIZA_CORE_RUNTIME_FILES)) return false;

  const sourceDist = resolve(sourcePkgDir, "dist");
  const targetDist = resolve(targetPkgDir, "dist");

  rmSync(targetDist, { recursive: true, force: true });
  cpSync(sourceDist, targetDist, { recursive: true });
  return true;
}

/**
 * Repair any cached @elizaos/core package copies whose runtime dist files are
 * missing by cloning the dist tree from the healthy root install.
 */
export function patchBrokenElizaCoreRuntimeDists(root, log = console.log) {
  const pkgPaths = findPackageJsonPaths(root, "@elizaos/core");
  const pkgDirs = pkgPaths.map((pkgPath) => dirname(pkgPath));
  const sourcePkgDir = pkgDirs.find((pkgDir) =>
    hasRequiredFiles(pkgDir, ELIZA_CORE_RUNTIME_FILES),
  );

  if (!sourcePkgDir) {
    log(
      "[patch-deps] Skipping @elizaos/core runtime repair: no healthy source dist was found.",
    );
    return false;
  }

  let patched = false;
  for (const pkgDir of pkgDirs) {
    if (repairElizaCoreRuntimeDist(pkgDir, sourcePkgDir)) {
      patched = true;
      log(
        `[patch-deps] Repaired @elizaos/core runtime dist in Bun cache: ${pkgDir}`,
      );
    }
  }
  return patched;
}

/**
 * Detect stale Bun module cache and warn the user.
 *
 * Bun's content-addressable cache deduplicates packages by tarball hash. When
 * upstream publishes multiple versions with identical (stale) build artifacts,
 * they share a hash and Bun serves stale content. We can't safely remove
 * entries during postinstall (symlinks break), so we detect the condition
 * and tell the user to run `bun run repair` which does:
 *   rm -rf node_modules/.bun && bun install
 *
 * Runs once per package.json version (stamp-guarded).
 *
 * Bun cache entry format: @scope+pkg@version+contenthash
 * e.g. @elizaos+core@2.0.0-alpha.77+f9c270f5561f2899
 */
export function warnStaleBunCache(root, log = console.log) {
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (!existsSync(bunCacheDir)) return 0;

  // Only check once per package.json version.
  const pkgJsonPath = resolve(root, "package.json");
  const stampPath = resolve(bunCacheDir, ".bust-cache-stamp");
  if (existsSync(pkgJsonPath) && existsSync(stampPath)) {
    try {
      const pkgVersion =
        JSON.parse(readFileSync(pkgJsonPath, "utf8")).version || "";
      const stamp = readFileSync(stampPath, "utf8").trim();
      if (stamp === pkgVersion) return 0;
    } catch {}
  }

  const prefixes = [
    "@elizaos+core@",
    "@elizaos+autonomous@",
    "@elizaos+app-core@",
    "@elizaos+prompts@",
    "@elizaos+skills@",
    "@elizaos+tui@",
  ];
  let staleCount = 0;

  let allEntries;
  try {
    allEntries = readdirSync(bunCacheDir);
  } catch (err) {
    log(`[patch-deps] Warning: failed to read Bun cache: ${err.message}`);
    return 0;
  }

  for (const prefix of prefixes) {
    const entries = allEntries.filter((e) => e.startsWith(prefix));
    if (entries.length < 2) continue;

    // Group by content hash (the part after the last '+')
    const byHash = new Map();
    for (const entry of entries) {
      const plusIdx = entry.lastIndexOf("+");
      if (plusIdx === -1 || plusIdx === entry.length - 1) continue;
      const hash = entry.slice(plusIdx + 1);
      if (!byHash.has(hash)) byHash.set(hash, []);
      byHash.get(hash).push(entry);
    }

    for (const [, group] of byHash) {
      if (group.length >= 2) staleCount += group.length - 1;
    }
  }

  // Write stamp regardless so we don't re-check every install.
  try {
    const pkgVersion = existsSync(pkgJsonPath)
      ? JSON.parse(readFileSync(pkgJsonPath, "utf8")).version || ""
      : "";
    writeFileSync(stampPath, pkgVersion, "utf8");
  } catch {}

  if (staleCount > 0) {
    log(
      `[patch-deps] ⚠️  Detected ${staleCount} stale Bun cache entries. Run: rm -rf node_modules/.bun && bun install`,
    );
  }
  return staleCount;
}

/**
 * If pkg.json has exports["."].bun = "./src/index.ts" and that file doesn't
 * exist, remove "bun" and "default" so resolver uses "import" → dist/.
 * Returns true if the file was patched.
 */
export function applyPatchToPackageJson(pkgPath) {
  if (!existsSync(pkgPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const dot = pkg.exports?.["."];
  if (!dot || typeof dot !== "object") return false;
  if (!dot.bun || !dot.bun.endsWith("/src/index.ts")) return false;

  const dir = dirname(pkgPath);
  if (existsSync(resolve(dir, dot.bun))) return false; // src exists — no patch

  delete dot.bun;
  if (dot.default?.endsWith("/src/index.ts")) {
    delete dot.default;
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return true;
}

/**
 * Some published packages only export subpaths with explicit `.js` suffixes
 * (for example "./sha3.js"), while runtime consumers import the extensionless
 * variant ("@scope/pkg/sha3"). Add extensionless aliases so Bun resolves the
 * published package the same way as modern bundlers.
 */
export function applyExtensionlessJsExportAliases(pkgPath) {
  if (!existsSync(pkgPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const exportsField = pkg.exports;
  if (
    !exportsField ||
    typeof exportsField !== "object" ||
    Array.isArray(exportsField)
  ) {
    return false;
  }

  let patched = false;
  for (const [key, value] of Object.entries(exportsField)) {
    if (!key.startsWith("./") || !key.endsWith(".js")) continue;
    const alias = key.slice(0, -3);
    if (Object.hasOwn(exportsField, alias)) continue;
    exportsField[alias] = value;
    patched = true;
  }

  if (!patched) return false;

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return true;
}

/**
 * @noble/hashes@2.x removed several legacy direct entry points that ethers@6
 * still imports (sha256, sha512, ripemd160). Recreate those shims so Bun can
 * resolve the package without downgrading the whole tree.
 */
export function applyNobleHashesCompat(pkgPath) {
  if (!existsSync(pkgPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.name !== "@noble/hashes") return false;

  const exportsField = pkg.exports;
  if (
    !exportsField ||
    typeof exportsField !== "object" ||
    Array.isArray(exportsField)
  ) {
    return false;
  }

  const dir = dirname(pkgPath);
  const shims = [
    {
      subpath: "ripemd160",
      sourceFile: "legacy.js",
      contents: 'export { ripemd160 } from "./legacy.js";\n',
    },
    {
      subpath: "sha256",
      sourceFile: "sha2.js",
      contents: 'export { sha256 } from "./sha2.js";\n',
    },
    {
      subpath: "sha512",
      sourceFile: "sha2.js",
      contents: 'export { sha512 } from "./sha2.js";\n',
    },
  ];

  let patched = false;

  for (const shim of shims) {
    if (!existsSync(resolve(dir, shim.sourceFile))) continue;

    const exportKey = `./${shim.subpath}`;
    const exportFileKey = `./${shim.subpath}.js`;
    const exportTarget = `./${shim.subpath}.js`;
    const shimPath = resolve(dir, `${shim.subpath}.js`);

    if (!existsSync(shimPath)) {
      writeFileSync(shimPath, shim.contents, "utf8");
      patched = true;
    }

    if (exportsField[exportKey] !== exportTarget) {
      exportsField[exportKey] = exportTarget;
      patched = true;
    }

    if (exportsField[exportFileKey] !== exportTarget) {
      exportsField[exportFileKey] = exportTarget;
      patched = true;
    }
  }

  if (!patched) return false;

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return true;
}

/**
 * Remove a lifecycle script when it references a file that is missing from the
 * published package tarball. This is used for upstream packages that ship a
 * broken postinstall hook.
 */
export function applyMissingLifecycleScriptPatch(
  pkgPath,
  scriptName,
  relativeTarget,
) {
  if (!existsSync(pkgPath)) return false;

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const lifecycleScripts = pkg.scripts;
  const lifecycleCommand = lifecycleScripts?.[scriptName];
  if (
    !lifecycleScripts ||
    typeof lifecycleCommand !== "string" ||
    !lifecycleCommand.includes(relativeTarget)
  ) {
    return false;
  }

  const dir = dirname(pkgPath);
  if (existsSync(resolve(dir, relativeTarget))) {
    return false;
  }

  delete lifecycleScripts[scriptName];
  if (Object.keys(lifecycleScripts).length === 0) {
    delete pkg.scripts;
  }

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return true;
}

/**
 * Patch all copies of pkgName under root (node_modules and Bun cache).
 * Logs when a file is patched. Used by postinstall in patch-deps.mjs.
 */
export function patchBunExports(root, pkgName, log = console.log) {
  const candidates = findPackageJsonPaths(root, pkgName);
  let patched = false;
  for (const pkgPath of candidates) {
    if (applyPatchToPackageJson(pkgPath)) {
      patched = true;
      log(
        `[patch-deps] Patched ${pkgName} exports: removed dead "bun"/"default" → src/index.ts conditions.`,
      );
    }
  }
  return patched;
}

/**
 * Patch all copies of pkgName so any "./foo.js" export also exposes "./foo".
 */
export function patchExtensionlessJsExports(root, pkgName, log = console.log) {
  const candidates = findPackageJsonPaths(root, pkgName);
  let patched = false;
  for (const pkgPath of candidates) {
    if (applyExtensionlessJsExportAliases(pkgPath)) {
      patched = true;
      log(
        `[patch-deps] Patched ${pkgName} exports: added extensionless aliases for .js subpaths.`,
      );
    }
  }
  return patched;
}

/**
 * Patch all copies of @noble/hashes so legacy ethers subpaths keep resolving
 * even when Bun installs the newer 2.x package at the root.
 */
export function patchNobleHashesCompat(root, log = console.log) {
  const candidates = findPackageJsonPaths(root, "@noble/hashes");
  let patched = false;
  for (const pkgPath of candidates) {
    if (applyNobleHashesCompat(pkgPath)) {
      patched = true;
      log(
        "[patch-deps] Patched @noble/hashes exports: restored legacy ethers-compatible sha256/sha512/ripemd160 shims.",
      );
    }
  }
  return patched;
}

/**
 * Patch all copies of pkgName so a broken lifecycle hook is removed when the
 * referenced script file is missing from the installed package.
 */
export function patchMissingLifecycleScript(
  root,
  pkgName,
  scriptName,
  relativeTarget,
  log = console.log,
) {
  const candidates = findPackageJsonPaths(root, pkgName);
  let patched = false;
  for (const pkgPath of candidates) {
    if (applyMissingLifecycleScriptPatch(pkgPath, scriptName, relativeTarget)) {
      patched = true;
      log(
        `[patch-deps] Patched ${pkgName} ${scriptName}: removed lifecycle hook referencing missing ${relativeTarget}.`,
      );
    }
  }
  return patched;
}

function loadMiladyOnboardingPresetsSource(root, targetPath) {
  const sourcePath = resolve(
    root,
    "packages/app-core/src/onboarding-presets.ts",
  );
  const source = readFileSync(sourcePath, "utf8");
  if (!targetPath?.endsWith(".js")) {
    return source;
  }

  return ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

/**
 * Milady owns the onboarding preset roster, but the published autonomous
 * package still serves upstream style presets. Replace the installed module
 * with Milady's local preset source so the onboarding API and runtime expose
 * the same Milady-specific characters that app-core is patched to display.
 */
export function applyAutonomousMiladyOnboardingPresetsPatch(filePath, source) {
  if (!existsSync(filePath)) return false;

  // When writing to a .js file, strip TypeScript-only syntax so Bun can
  // parse it as plain JavaScript. The source is always loaded from the
  // local .ts file which may contain `as const`, type annotations, etc.
  let output = source;
  if (filePath.endsWith(".js")) {
    output = stripTypeScriptSyntax(output);
  }

  const compatSource = readFileSync(filePath, "utf8");
  if (compatSource === output) return false;

  writeFileSync(filePath, output, "utf8");
  return true;
}

/**
 * Naively strip TypeScript-only syntax from a source string so it can be
 * loaded as plain JavaScript by Bun. Handles the patterns used in
 * onboarding-presets.ts:
 *   - `] as const;`  →  `];`
 *   - `export const FOO: Type<...> = {`  →  `export const FOO = {`
 *   - Interface-style property lines inside a Record<> type block
 */
function stripTypeScriptSyntax(src) {
  // Remove `as const` assertions
  src = src.replace(/\]\s+as\s+const\s*;/g, "];");

  // Remove inline type annotations on const declarations:
  //   export const FOO: Record<\n  string,\n  {\n    ...\n  }\n> = {
  // Matches `: <type>` between the variable name and ` = `.
  src = src.replace(
    /^(export\s+const\s+\w+)\s*:\s*Record<[\s\S]*?>\s*=/gm,
    "$1 =",
  );

  return src;
}

export function patchAutonomousMiladyOnboardingPresets(
  root,
  log = console.log,
  source,
) {
  const candidates = [
    ...findPackageFilePaths(
      root,
      "@elizaos/agent",
      "packages/agent/src/onboarding-presets.js",
    ),
    ...findPackageFilePaths(
      root,
      "@elizaos/agent",
      "src/onboarding-presets.js",
    ),
    ...findPackageFilePaths(
      root,
      "@elizaos/agent",
      "src/onboarding-presets.ts",
    ),
  ];

  let patched = false;
  for (const filePath of candidates) {
    const nextSource =
      source ?? loadMiladyOnboardingPresetsSource(root, filePath);
    if (!applyAutonomousMiladyOnboardingPresetsPatch(filePath, nextSource)) {
      continue;
    }
    patched = true;
    log(
      "[patch-deps] Patched @elizaos/agent packages/agent/src/onboarding-presets.js: onboarding presets now derive from Milady.",
    );
  }

  return patched;
}

/**
 * @elizaos/plugin-agent-skills alpha.11 logs duplicate catalog warnings when
 * concurrent callers all hit the same upstream 429. Coalesce in-flight fetches
 * and treat 429s as a soft backoff with Retry-After support.
 */
export function applyAgentSkillsCatalogFetchPatch(filePath) {
  if (!existsSync(filePath)) return false;

  const compatSource = readFileSync(filePath, "utf8");
  if (compatSource.includes("catalogFetchCooldownUntil = 0;")) return false;

  const originalFieldBlock =
    "  // Tracks the last catalog fetch failure timestamp for backoff.\n  lastFetchErrorAt = 0;";
  if (!compatSource.includes(originalFieldBlock)) return false;

  let updatedSource = compatSource.replace(
    originalFieldBlock,
    `${originalFieldBlock}\n  // Coalesce concurrent catalog refreshes and track absolute cooldowns for 429s.\n  catalogFetchInFlight = null;\n  catalogFetchCooldownUntil = 0;`,
  );

  const catalogMethodPattern =
    / {2}async getCatalog\(options = \{\}\) \{[\s\S]*?\n {2}\/\*\*\n {3}\* Search ClawHub for skills\.\n {3}\*\//;
  if (!catalogMethodPattern.test(updatedSource)) return false;

  const patchedCatalogMethod = `  async getCatalog(options = {}) {
    const parseRetryAfterMs = (value) => {
      if (typeof value !== "string" || value.trim().length === 0) return null;
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.ceil(seconds * 1e3);
      }
      const retryAt = Date.parse(value);
      if (Number.isNaN(retryAt)) return null;
      return Math.max(0, retryAt - Date.now());
    };
    const ttl = options.notOlderThan ?? CACHE_TTL.CATALOG;
    if (!options.forceRefresh && this.catalogCache) {
      const age = Date.now() - this.catalogCache.cachedAt;
      if (age < ttl) {
        return this.catalogCache.data;
      }
    }
    if (this.catalogFetchCooldownUntil > Date.now()) {
      return this.catalogCache?.data ?? [];
    }
    if (this.catalogFetchInFlight) {
      return this.catalogFetchInFlight;
    }
    this.catalogFetchInFlight = (async () => {
      try {
        const entries = [];
        let cursor;
        do {
          const url = \`\${this.apiBase}/api/v1/skills?limit=100\${cursor ? \`&cursor=\${cursor}\` : ""}\`;
          const response = await fetch(url, {
            headers: { Accept: "application/json" }
          });
          if (!response.ok) {
            const statusError = new Error(\`Catalog fetch failed: \${response.status}\`);
            statusError.status = response.status;
            statusError.retryAfter = response.headers.get("retry-after");
            throw statusError;
          }
          const data = await response.json();
          entries.push(...data.items);
          cursor = data.nextCursor;
        } while (cursor);
        this.catalogCache = { data: entries, cachedAt: Date.now() };
        this.lastFetchErrorAt = 0;
        this.catalogFetchCooldownUntil = 0;
        if (this.storage.type === "filesystem") {
          await this.saveCatalogToDisk();
        }
        return entries;
      } catch (error) {
        const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : null;
        const retryAfter = typeof error === "object" && error !== null && "retryAfter" in error ? error.retryAfter : null;
        const retryAfterMs = parseRetryAfterMs(retryAfter);
        const cooldownMs = Math.max(FETCH_ERROR_COOLDOWN, retryAfterMs ?? 0);
        this.lastFetchErrorAt = Date.now();
        this.catalogFetchCooldownUntil = Date.now() + cooldownMs;
        if (status === 429) {
          const cachedCount = this.catalogCache?.data.length ?? 0;
          const cacheSuffix = cachedCount > 0 ? \`; using \${cachedCount} cached skills\` : "";
          this.runtime.logger.info(
            \`AgentSkills: Catalog rate limited (429); backing off for \${Math.ceil(cooldownMs / 1e3)}s\${cacheSuffix}\`
          );
        } else {
          this.runtime.logger.warn(\`AgentSkills: Catalog fetch failed (will retry after cooldown): \${error}\`);
        }
        if (!this.catalogCache) {
          this.catalogCache = { data: [], cachedAt: Date.now() };
        }
        return this.catalogCache.data;
      } finally {
        this.catalogFetchInFlight = null;
      }
    })();
    return this.catalogFetchInFlight;
  }
  /**
   * Search ClawHub for skills.
   */`;

  updatedSource = updatedSource.replace(
    catalogMethodPattern,
    patchedCatalogMethod,
  );

  writeFileSync(filePath, updatedSource, "utf8");
  return true;
}

/**
 * @elizaos/plugin-vision currently defaults to CAMERA mode and keeps retrying
 * imagesnap/fswebcam/ffmpeg when OS camera permission is denied. In the
 * desktop app this spams logs and can interfere with startup. Patch the
 * published bundle so camera capture defaults to OFF and a permission denial
 * disables the camera loop until the user explicitly re-enables it.
 */
export function applyPluginVisionPermissionPatch(filePath) {
  if (!existsSync(filePath)) return false;

  let source = readFileSync(filePath, "utf8");
  if (
    source.includes(
      "Camera permission not granted; disabling camera capture until permission is granted.",
    )
  ) {
    return false;
  }

  const replacements = [
    [
      '    visionMode: "CAMERA" /* CAMERA */,',
      '    visionMode: "OFF" /* OFF */,',
    ],
    [
      "  camera = null;\n  lastFrame = null;",
      "  camera = null;\n  cameraPermissionDenied = false;\n  lastFrame = null;",
    ],
    [
      "  async initializeCameraVision() {\n    const toolCheck = await this.checkCameraTools();",
      "  async initializeCameraVision() {\n    this.cameraPermissionDenied = false;\n    const toolCheck = await this.checkCameraTools();",
    ],
    [
      "  startFrameProcessing() {\n    if (this.frameProcessingInterval) {\n      return;\n    }",
      "  startFrameProcessing() {\n    if (this.frameProcessingInterval || this.cameraPermissionDenied) {\n      return;\n    }",
    ],
    [
      "      if (!this.isProcessing && this.camera) {",
      "      if (!this.isProcessing && this.camera && !this.cameraPermissionDenied) {",
    ],
    [
      "    if (!this.camera) {\n      return;\n    }",
      "    if (!this.camera || this.cameraPermissionDenied) {\n      return;\n    }",
    ],
    [
      `    } catch (error) {
      logger14.error("[VisionService] Error capturing frame:", error);
    }`,
      `    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (/camera access not granted|permission denied|not authorized|not permitted|device access denied/i.test(errorMessage)) {
        if (!this.cameraPermissionDenied) {
          logger14.warn("[VisionService] Camera permission not granted; disabling camera capture until permission is granted.");
        }
        this.cameraPermissionDenied = true;
        this.camera = null;
        if (this.frameProcessingInterval) {
          clearInterval(this.frameProcessingInterval);
          this.frameProcessingInterval = null;
        }
        if (this.visionConfig.visionMode === "BOTH" /* BOTH */) {
          this.visionConfig.visionMode = "SCREEN" /* SCREEN */;
        } else if (this.visionConfig.visionMode === "CAMERA" /* CAMERA */) {
          this.visionConfig.visionMode = "OFF" /* OFF */;
        }
        return;
      }
      logger14.error("[VisionService] Error capturing frame:", error);
    }`,
    ],
    [
      `    } catch (error) {
      logger14.error("[VisionService] Failed to capture image:", error);
      return null;
    }`,
      `    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (/camera access not granted|permission denied|not authorized|not permitted|device access denied/i.test(errorMessage)) {
        logger14.warn("[VisionService] Camera permission not granted; skipping image capture.");
        this.cameraPermissionDenied = true;
        this.camera = null;
        return null;
      }
      logger14.error("[VisionService] Failed to capture image:", error);
      return null;
    }`,
    ],
  ];

  for (const [searchValue, replaceValue] of replacements) {
    if (!source.includes(searchValue)) return false;
    source = source.replace(searchValue, replaceValue);
  }

  writeFileSync(filePath, source, "utf8");
  return true;
}

export function patchPluginVisionPermissionHandling(root, log = console.log) {
  const candidates = findPackageFilePaths(
    root,
    "@elizaos/plugin-vision",
    "dist/index.js",
  );

  let patched = false;
  for (const filePath of candidates) {
    if (!applyPluginVisionPermissionPatch(filePath)) continue;
    patched = true;
    log(
      `[patch-deps] Patched @elizaos/plugin-vision camera permission handling: ${filePath}`,
    );
  }

  return patched;
}

/**
 * Patch all copies of @elizaos/plugin-agent-skills so 429 responses back off
 * cleanly without duplicate warnings from concurrent catalog fetches.
 */
export function patchAgentSkillsCatalogFetch(root, log = console.log) {
  const candidates = findPackageFilePaths(
    root,
    "@elizaos/plugin-agent-skills",
    "dist/index.js",
  );
  let patched = false;
  for (const filePath of candidates) {
    if (applyAgentSkillsCatalogFetchPatch(filePath)) {
      patched = true;
      log(
        "[patch-deps] Patched @elizaos/plugin-agent-skills: coalesced catalog fetches and softened 429 rate-limit logging.",
      );
    }
  }
  return patched;
}

/**
 * proper-lockfile expects require("signal-exit") to return a callable export
 * (v3 behavior). In v4 the package exports an object with { onExit }. Patch the
 * require site so the dependency works with either version.
 */
export function applyProperLockfileSignalExitCompat(filePath) {
  if (!existsSync(filePath)) return false;

  const compatSource = readFileSync(filePath, "utf8");
  const patchedLine =
    "const signalExit = require('signal-exit');\nconst onExit = typeof signalExit === 'function' ? signalExit : signalExit.onExit;";
  if (compatSource.includes(patchedLine)) return false;

  const originalLine = "const onExit = require('signal-exit');";
  if (!compatSource.includes(originalLine)) return false;

  writeFileSync(
    filePath,
    compatSource.replace(originalLine, patchedLine),
    "utf8",
  );
  return true;
}

/**
 * Patch all copies of proper-lockfile so signal-exit v3/v4 both work.
 */
export function patchProperLockfileSignalExitCompat(root, log = console.log) {
  const candidates = findPackageFilePaths(
    root,
    "proper-lockfile",
    "lib/lockfile.js",
  );
  let patched = false;
  for (const filePath of candidates) {
    if (applyProperLockfileSignalExitCompat(filePath)) {
      patched = true;
      log(
        "[patch-deps] Patched proper-lockfile: signal-exit v3/v4 compatibility applied.",
      );
    }
  }
  return patched;
}

export function patchAutonomousTypeError(root, log = console.log) {
  const candidates = findPackageFilePaths(
    root,
    "@elizaos/agent",
    "src/api/server.ts",
  );
  let patched = false;
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    let source = readFileSync(filePath, "utf8");
    // Skip if already fixed (contains "as unknown as SubscriptionAuthApi")
    if (source.includes("as unknown as SubscriptionAuthApi")) continue;
    if (source.includes("as SubscriptionAuthApi")) {
      source = source.replaceAll(
        "as SubscriptionAuthApi",
        "as unknown as SubscriptionAuthApi",
      );
      writeFileSync(filePath, source, "utf8");
      patched = true;
      log("[patch-deps] Patched @elizaos/agent type error in server.ts");
    }
  }
  return patched;
}
