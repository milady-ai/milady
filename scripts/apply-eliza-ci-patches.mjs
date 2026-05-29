#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const elizaDir = path.join(repoRoot, "eliza");
const patchPathCandidates = [
  path.join(
    repoRoot,
    "eliza",
    "patches",
    "milady",
    "eliza-ci-bootstrap",
    "ci-release-contracts.patch",
  ),
  path.join(
    repoRoot,
    "eliza",
    "patches",
    "eliza",
    "eliza-ci-bootstrap",
    "ci-release-contracts.patch",
  ),
];

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", ["-C", elizaDir, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (!allowFailure && result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(
      stderr || `git ${args.join(" ")} failed with ${result.status}`,
    );
  }

  return result;
}

// Splits a unified diff into one chunk per `diff --git` header so we can apply
// each file independently. The whole-patch apply is all-or-nothing: if a single
// hunk has drifted upstream the entire overlay is dropped. Per-file apply lets
// the unaffected files still apply, surfacing drift as a precise list rather
// than masking everything.
function splitPatchByFile(patchText) {
  const lines = patchText.split("\n");
  const chunks = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) chunks.push(current);
      current = { header: line, lines: [line] };
      const match = line.match(/^diff --git a\/(\S+) b\/(\S+)/);
      if (match) {
        current.path = match[2];
      }
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) chunks.push(current);

  return chunks.map((chunk) => ({
    path: chunk.path ?? "<unknown>",
    text: `${chunk.lines.join("\n")}\n`,
  }));
}

function tryApplyPatchChunk(chunk) {
  const tmpFile = path.join(
    os.tmpdir(),
    `eliza-ci-patch-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`,
  );
  fs.writeFileSync(tmpFile, chunk.text);
  try {
    const reverseCheck = runGit(
      ["apply", "--unidiff-zero", "--reverse", "--check", tmpFile],
      { allowFailure: true },
    );
    if (reverseCheck.status === 0) return { status: "already-applied" };

    const forwardCheck = runGit(
      ["apply", "--unidiff-zero", "--check", tmpFile],
      { allowFailure: true },
    );
    if (forwardCheck.status !== 0) {
      return { status: "drift", stderr: forwardCheck.stderr.trim() };
    }

    runGit(["apply", "--unidiff-zero", tmpFile]);
    return { status: "applied" };
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

function replaceFileText(filePath, transform, label) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  const next = transform(raw);
  if (next === raw) return;
  fs.writeFileSync(filePath, next);
  console.log(`[apply-eliza-ci-patches] patched ${label}`);
}

function writeFileText(filePath, content, label, mode) {
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf8");
    if (raw === content) return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  if (mode !== undefined) {
    fs.chmodSync(filePath, mode);
  }
  console.log(`[apply-eliza-ci-patches] patched ${label}`);
}

function patchCloudDockerfile(raw) {
  let next = raw;
  if (!next.includes("COPY patches ./patches")) {
    next = next.replace(
      "COPY package.json bun.lock ./\n",
      "COPY package.json bun.lock ./\nCOPY patches ./patches\n",
    );
  }
  if (!next.includes("COPY cloud-sdk ./eliza/cloud/packages/sdk")) {
    next = next.replace(
      "COPY eliza/plugins/plugin-elizacloud/package.json ./eliza/plugins/plugin-elizacloud/package.json\n",
      "COPY eliza/plugins/plugin-elizacloud/package.json ./eliza/plugins/plugin-elizacloud/package.json\nCOPY cloud-sdk ./eliza/cloud/packages/sdk\n",
    );
  }

  const match = next.match(
    /RUN node(?: -)? <<'EOF'\nconst fs = require\("fs"\);[\s\S]*?\nEOF\n(?=# Drop --frozen-lockfile)/,
  );
  if (match?.index === undefined) {
    return next;
  }
  return `${next.slice(0, match.index)}COPY scripts/cloud-image-prune-deps.mjs ./scripts/cloud-image-prune-deps.mjs\nRUN bun scripts/cloud-image-prune-deps.mjs\n${next.slice(match.index + match[0].length)}`;
}

function patchElectrobunCliPatchScript(raw) {
  const normalized = raw.replace(/\r\n/g, "\n");
  const next = normalized.replace(
    `  const replacements = patched.match(
    /const rcedit = \\(await import\\("rcedit"\\)\\)\\.default;/g,
  );
  if (!replacements || replacements.length !== 3) {
    throw new Error(
      \`Expected 3 rcedit dynamic import call sites, found \${replacements?.length ?? 0}\`,
    );
  }
`,
    `  const replacements = patched.match(
    /const rcedit = \\(await import\\("rcedit"\\)\\)\\.default;/g,
  );
  if (
    (!replacements || replacements.length === 0) &&
    original.includes('require.resolve("rcedit/package.json")')
  ) {
    return original;
  }
  if (!replacements || replacements.length !== 3) {
    throw new Error(
      \`Expected 3 rcedit dynamic import call sites, found \${replacements?.length ?? 0}\`,
    );
  }
`,
  );
  return next === normalized ? raw : next;
}

function patchDesktopSmokeScript(raw) {
  return raw
    .replace(
      /\$pgliteDataDir\s*=\s*Join-Path\s+\$tempRoot\s+"pglite"/,
      '$pgliteDataDir = Join-Path $tempRoot ("pglite-" + [Guid]::NewGuid().ToString("N"))',
    )
    .replace(
      /\$defaultAvatarAssetSlugs\s*=\s*@\([^)]*\)/,
      '$defaultAvatarAssetSlugs = @("eliza-1")',
    )
    .replace(
      /DEFAULT_AVATAR_ASSET_SLUGS=\([^)]*\)/,
      "DEFAULT_AVATAR_ASSET_SLUGS=(eliza-1)",
    );
}

function patchCoreRuntimeTypes(raw) {
  return raw.replace(
    'type StructuredResponseFormat = "JSON";',
    'type StructuredResponseFormat = "JSON" | "TOON";',
  );
}

function patchCoreStateTypes(raw) {
  return raw.replace('format: "JSON";', 'format: "JSON" | "TOON";');
}

function patchElectrobunAgentChildPathFallback(raw) {
  if (raw.includes("existingPathKey")) {
    return raw;
  }

  // Pattern A: newer eliza (f4991bc6+) uses a prependDesktopChildPathDirectory helper
  const helperPatched = raw.replace(
    /export function prependDesktopChildPathDirectory\(\r?\n([ \t]*)childEnv: Record<string, string \| undefined>,\r?\n[ \t]*directory: string,\r?\n[ \t]*\): boolean \{\r?\n[ \t]*const existingPath = childEnv\.PATH\?\.trim\(\);\r?\n[ \t]*if \(!existingPath\) \{\r?\n[ \t]*childEnv\.PATH = directory;\r?\n[ \t]*return true;\r?\n[ \t]*\}\r?\n[ \t]*if \(existingPath\.split\(path\.delimiter\)\.includes\(directory\)\) \{\r?\n[ \t]*return false;\r?\n[ \t]*\}\r?\n[ \t]*childEnv\.PATH = `\$\{directory\}\$\{path\.delimiter\}\$\{existingPath\}`;\r?\n[ \t]*return true;\r?\n[ \t]*\}/,
    (_, indent) =>
      `export function prependDesktopChildPathDirectory(
${indent}childEnv: Record<string, string | undefined>,
${indent}directory: string,
): boolean {
${indent}const existingPathKey = childEnv.PATH !== undefined ? "PATH" : "Path";
${indent}const existingPath = childEnv[existingPathKey]?.trim();
${indent}if (!existingPath) {
${indent}  childEnv[existingPathKey] = directory;
${indent}  return true;
${indent}}
${indent}if (existingPath.split(path.delimiter).includes(directory)) {
${indent}  return false;
${indent}}
${indent}childEnv[existingPathKey] = \`\${directory}\${path.delimiter}\${existingPath}\`;
${indent}return true;
}`,
  );

  if (helperPatched !== raw) {
    return helperPatched;
  }

  // Pattern B: older eliza has the PATH prepend inline in the spawn block
  const inlinePatched = raw.replace(
    /([ \t]*)const bunDir = path\.dirname\(bunExecutable\);\r?\n\1const existingPath = childEnv\.PATH(?: \?\? "")?;\r?\n\1if \(!existingPath\.split\(path\.delimiter\)\.includes\(bunDir\)\) \{\r?\n\1[ \t]*childEnv\.PATH = bunDir \+ path\.delimiter \+ existingPath;\r?\n\1[ \t]*diagnosticLog\(`\[Agent\] Prepended bun dir to child PATH: \$\{bunDir\}`\);\r?\n\1\}\r?\n/,
    (_, indent) => `${indent}const bunDir = path.dirname(bunExecutable);
${indent}const existingPathKey =
${indent}  childEnv.PATH !== undefined ? "PATH" : "Path";
${indent}const existingPath =
${indent}  childEnv[existingPathKey] ?? process.env.PATH ?? process.env.Path ?? "";
${indent}if (!existingPath.split(path.delimiter).includes(bunDir)) {
${indent}  childEnv[existingPathKey] = existingPath
${indent}    ? bunDir + path.delimiter + existingPath
${indent}    : bunDir;
${indent}  diagnosticLog(\`[Agent] Prepended bun dir to child PATH: \${bunDir}\`);
${indent}}
`,
  );

  if (inlinePatched !== raw) {
    return inlinePatched;
  }

  throw new Error(
    "Could not patch Electrobun agent PATH fallback: neither helper function nor inline block matched",
  );
}

function patchComputerUseVisionContextProvider(raw) {
  const providerPath = path.join(
    elizaDir,
    "plugins",
    "plugin-computeruse",
    "src",
    "services",
    "vision-context-provider.ts",
  );
  if (fs.existsSync(providerPath)) return raw;

  return raw
    .replace(
      /import \{ VisionContextProvider \} from "\.\/services\/vision-context-provider\.js";\r?\n/,
      "",
    )
    .replace(
      "  services: [ComputerUseService, VisionContextProvider],",
      "  services: [ComputerUseService],",
    )
    .replace(
      /export \{\r?\n {2}type VisionContext,[\s\S]*?\} from "\.\/services\/vision-context-provider\.js";\r?\n/,
      "",
    );
}

function patchLocalInferenceExternalGlob(raw) {
  return raw.replaceAll(
    "--external @node-llama-cpp/*",
    '--external \\"@node-llama-cpp/*\\"',
  );
}

function patchCapacitorBridgeBuildScript(raw) {
  return raw
    .replace(
      "tsup src/index.ts --format esm --dts --clean",
      "node ../../../scripts/build-capacitor-bridge-release.mjs",
    )
    .replace(
      "bun run check:android-manifest && tsup",
      "bun run check:android-manifest && node ../../../scripts/build-capacitor-bridge-release.mjs",
    );
}

function patchCapacitorBridgeLazyCliExports(raw) {
  return raw.replace(
    `export { runAndroidBridgeCli } from "./android/bridge.js";
export { runIosBridgeCli } from "./ios/bridge.js";`,
    `export async function runAndroidBridgeCli(): Promise<void> {
\tconst { runAndroidBridgeCli } = await import("./android/bridge.js");
\treturn runAndroidBridgeCli();
}

export async function runIosBridgeCli(
\targv: string[] = process.argv,
): Promise<void> {
\tconst { runIosBridgeCli } = await import("./ios/bridge.js");
\treturn runIosBridgeCli(argv);
}`,
  );
}

function patchRuntimeCopyTarSafeHoists(raw) {
  let next = raw
    // eliza refs that only have @elizaos/core
    .replace(
      'const ALWAYS_HOISTED_PACKAGES = new Set(["@elizaos/core"]);',
      'const ALWAYS_HOISTED_PACKAGES = new Set(["@elizaos/core", "commander", "pg", "pg-pool"]);',
    )
    // eliza refs (e.g. f4991bc6+) that already include commander
    .replace(
      'const ALWAYS_HOISTED_PACKAGES = new Set(["@elizaos/core", "commander"]);',
      'const ALWAYS_HOISTED_PACKAGES = new Set(["@elizaos/core", "commander", "pg", "pg-pool"]);',
    );
  if (!next.includes("function shouldHoistRuntimePackage")) {
    next = next.replace(
      "\ntype CopyTargetOptions = {",
      `
function shouldHoistRuntimePackage(name: string): boolean {
  return ALWAYS_HOISTED_PACKAGES.has(name) || name.startsWith("@solana/");
}

type CopyTargetOptions = {`,
    );
  }
  return next.replace(
    "if (ALWAYS_HOISTED_PACKAGES.has(name) && topLevelVersions.has(name)) {",
    "if (shouldHoistRuntimePackage(name) && topLevelVersions.has(name)) {",
  );
}

function patchBrowserBridgeReleaseVersion(raw) {
  return raw
    .replace(
      "(?:-(beta|rc|nightly)\\.([0-9A-Za-z.-]+))?",
      "(?:-(alpha|beta|rc|nightly)\\.([0-9A-Za-z.-]+))?",
    )
    .replace(
      "Expected 1.2.3 or 1.2.3-beta.0 style semver.",
      "Expected 1.2.3 or 1.2.3-alpha.0 style semver.",
    );
}

function patchBrowserBridgeSafariPackage(raw) {
  const bundleIdentifierMarker =
    "PRODUCT_BUNDLE_IDENTIFIER = $" + "{bundleIdentifier}";
  const extensionBundleIdentifierMarker =
    "PRODUCT_BUNDLE_IDENTIFIER = $" + "{bundleIdentifier}.Extension";
  const currentProjectVersionPatch = `${[
    "  source = source.replace(",
    "    /CURRENT_PROJECT_VERSION = [^;]+;/g,",
    "    `CURRENT_PROJECT_VERSION = $" + "{safariVersions.buildVersion};`,",
    "  );",
  ].join("\n")}\n`;
  const safariBundlePatch = `${[
    "  source = source.replace(",
    '    /PRODUCT_BUNDLE_IDENTIFIER = "ai\\.elizaos\\.browserbridge\\.Agent-Browser-Bridge";/g,',
    "    `PRODUCT_BUNDLE_IDENTIFIER = $" + "{bundleIdentifier};`,",
    "  );",
  ].join("\n")}\n`;
  const safariExtensionBundlePatch = `${[
    "  source = source.replace(",
    '    /PRODUCT_BUNDLE_IDENTIFIER = "ai\\.elizaos\\.browserbridge\\.Agent-Browser-Bridge\\.Extension";/g,',
    "    `PRODUCT_BUNDLE_IDENTIFIER = $" + "{bundleIdentifier}.Extension;`,",
    "  );",
  ].join("\n")}\n`;
  let patched = raw;
  if (!patched.includes(bundleIdentifierMarker)) {
    patched = patched.replace(
      currentProjectVersionPatch,
      currentProjectVersionPatch + safariBundlePatch,
    );
  }
  if (!patched.includes(extensionBundleIdentifierMarker)) {
    const insertionAnchor = patched.includes(safariBundlePatch)
      ? safariBundlePatch
      : currentProjectVersionPatch;
    patched = patched.replace(
      insertionAnchor,
      insertionAnchor + safariExtensionBundlePatch,
    );
  }
  return patched;
}

function patchAppCoreReleaseCheck(raw) {
  let patched = raw
    .replace(
      '  "if bun run browser-bridge:package:release; then",\n',
      '  "bun run browser-bridge:package:release",\n',
    )
    .replace(
      '  "Agent Browser Bridge packaging failed; desktop release will continue without browser companion bundles.",\n',
      "",
    )
    .replace(
      "release-check: release workflow is missing notary wrapper wiring:",
      "release-check: release workflow is missing required release wiring:",
    )
    .replace(
      '"ELIZA_TEST_WINDOWS_PROOF_INSTALL_DIR: $" +\n    "{{ runner.temp }}\\\\el-proof",',
      '"ELIZA_TEST_WINDOWS_PROOF_INSTALL_DIR: $" + "{{ runner.temp }}\\\\el-smoke-proof",',
    )
    .replace(
      '"ELIZA_TEST_WINDOWS_PROOF_INSTALL_DIR: $" + "{{ runner.temp }}\\\\el-proof",',
      '"ELIZA_TEST_WINDOWS_PROOF_INSTALL_DIR: $" + "{{ runner.temp }}\\\\el-smoke-proof",',
    )
    .replace(
      '!catchBlock.includes("opts?.serverOnly") ||',
      '!(catchBlock.includes("opts?.serverOnly") || catchBlock.includes("options?.serverOnly")) ||',
    )
    .replace(
      "  if (!isExactVersion(version)) {\n",
      '  if (!isExactVersion(version) && !["alpha", "beta"].includes(version)) {\n',
    )
    .replace(
      '  if (!isExactVersion(version) && version !== "beta") {\n',
      '  if (!isExactVersion(version) && !["alpha", "beta"].includes(version)) {\n',
    )
    .replace(
      "must either use workspace:* for the local checkout or be pinned to an exact version",
      "must either use workspace:* for the local checkout, use a release dist tag, or be pinned to an exact version",
    )
    .replace(
      '    !hasNoPublishedRelease &&\n    !releaseDataSource.includes("/packages/homepage/public/")\n',
      '    !hasNoPublishedRelease &&\n    !releaseDataSource.includes("/apps/homepage/public/")\n',
    )
    .replace(
      "release-check: generated homepage release data must point homepageAssetBaseUrl at /packages/homepage/public/.",
      "release-check: generated homepage release data must point homepageAssetBaseUrl at /apps/homepage/public/.",
    )
    .replace(
      '    releaseDataSource.includes("/apps/web/public/") ||\n    releaseDataSource.includes("/apps/homepage/public/")\n',
      '    releaseDataSource.includes("/apps/web/public/")\n',
    )
    .replace(
      "release-check: generated homepage release data still points at legacy /apps/*/public/. Regenerate it with node scripts/write-homepage-release-data.mjs.",
      "release-check: generated homepage release data still points at legacy /apps/web/public/. Regenerate it with node scripts/write-homepage-release-data.mjs.",
    );

  patched = patched.replace(
    /const requiredPaths = \[[\s\S]*?\];/,
    `const requiredPaths = [
  "dist/index.js",
  "dist/entry.js",
  "dist/build-info.json",
  "eliza/packages/app-core/scripts",
  "eliza/packages/app-core/scripts/setup-upstreams.mjs",
  "eliza/packages/app-core/scripts/init-submodules.mjs",
];`,
  );

  patched = patched.replace(
    /const requiredElectrobunPrWorkflowSnippets = \[[\s\S]*?\];/,
    `const requiredElectrobunPrWorkflowSnippets = [
  "name: Validate Electrobun Release Workflow",
  "pull_request:",
  "branches: [main, develop]",
  "workflow_dispatch:",
  "permissions:",
  "contents: read",
  'BUN_VERSION: "1.3.13"',
  "name: Release Workflow Contract",
  "bun install --ignore-scripts",
  'run-postinstall: "true"',
  "bun run test:regression-matrix:release-contract",
  "bun run test:release:contract",
];`,
  );

  patched = patched.replace(
    /const requiredRootPackageScriptSnippets: Record<string, readonly string\[]> = \{[\s\S]*?\n\};\nconst requiredElectrobunConfigSnippets/,
    `const requiredRootPackageScriptSnippets: Record<string, readonly string[]> = {
  "release:check": ["scripts/run-release-check.mjs"],
  "test:release:contract": ["scripts/run-release-contract-suite.mjs"],
  "test:regression-matrix:release": [
    "scripts/run-eliza-app-core-script.mjs validate-regression-matrix.mjs --workflow release",
  ],
  "test:regression-matrix:release-contract": [
    "scripts/run-eliza-app-core-script.mjs validate-regression-matrix.mjs --workflow release-contract",
  ],
};
const requiredElectrobunConfigSnippets`,
  );

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [upstreamSnippet, miladySnippet] of [
    [
      "node packages/app-core/scripts/ensure-avatars.mjs",
      "node eliza/packages/app-core/scripts/ensure-avatars.mjs",
    ],
    [
      "bash packages/app-core/platforms/electrobun/scripts/ensure-whisper-gguf.sh base.en",
      "bash eliza/packages/app-core/platforms/electrobun/scripts/ensure-whisper-gguf.sh base.en",
    ],
    [
      "bash packages/app-core/platforms/electrobun/scripts/ensure-whisper-model.sh base.en",
      "bash eliza/packages/app-core/platforms/electrobun/scripts/ensure-whisper-gguf.sh base.en",
    ],
    [
      "bash packages/app-core/platforms/electrobun/scripts/ensure-whisper-gguf.sh base.en",
      "bash eliza/packages/app-core/platforms/electrobun/scripts/ensure-whisper-gguf.sh base.en",
    ],
    [
      "packages/app-core/platforms/electrobun/scripts/hdiutil-wrapper.sh",
      "eliza/packages/app-core/platforms/electrobun/scripts/hdiutil-wrapper.sh",
    ],
    [
      "packages/app-core/platforms/electrobun/scripts/xcrun-wrapper.sh",
      "eliza/packages/app-core/platforms/electrobun/scripts/xcrun-wrapper.sh",
    ],
    [
      "packages/app-core/platforms/electrobun/scripts/zip-wrapper.sh",
      "eliza/packages/app-core/platforms/electrobun/scripts/zip-wrapper.sh",
    ],
    [
      "node packages/app-core/scripts/desktop-build.mjs stage --variant=base --build-whisper",
      "node eliza/packages/app-core/scripts/desktop-build.mjs stage --variant=base --build-whisper",
    ],
    [
      "packages/app-core/platforms/electrobun/scripts/stage-macos-release-artifacts.sh",
      "eliza/packages/app-core/platforms/electrobun/scripts/stage-macos-release-artifacts.sh",
    ],
    [
      'Get-ChildItem -Path "packages/app-core/platforms/electrobun/artifacts" -File -Filter "ElizaOSApp-Setup-*.exe"',
      'Get-ChildItem -Path "eliza/packages/app-core/platforms/electrobun/artifacts" -File -Filter "ElizaOSApp-Setup-*.exe"',
    ],
    [
      "packages/app-core/platforms/electrobun/artifacts/*.exe",
      "eliza/packages/app-core/platforms/electrobun/artifacts/*.exe",
    ],
    [
      "path: packages/app-core/platforms/electrobun/artifacts/public-canary-installer/ElizaOSApp-Setup-*.exe",
      "path: eliza/packages/app-core/platforms/electrobun/artifacts/public-canary-installer/ElizaOSApp-Setup-*.exe",
    ],
    [
      'const workspacePackageJson = path.resolve("packages/app-core/platforms/electrobun/package.json");',
      'const workspacePackageJson = path.resolve("eliza/packages/app-core/platforms/electrobun/package.json");',
    ],
    [
      'node packages/app-core/scripts/build-patched-electrobun-cli.mjs "$',
      'node eliza/packages/app-core/scripts/build-patched-electrobun-cli.mjs "$',
    ],
    [
      "node packages/app-core/scripts/desktop-build.mjs package --env=$",
      "node eliza/packages/app-core/scripts/desktop-build.mjs package --env=$",
    ],
    [
      "path: packages/app-core/platforms/electrobun/artifacts/windows-installer-proof/**",
      "path: eliza/packages/app-core/platforms/electrobun/artifacts/windows-installer-proof/**",
    ],
  ]) {
    patched = patched.replace(
      new RegExp(`(?<!eliza/)${escapeRegExp(upstreamSnippet)}`, "g"),
      miladySnippet,
    );
  }
  patched = patched.replace(
    /(?:eliza\/)+packages\/app-core/g,
    "eliza/packages/app-core",
  );

  patched = patched.replace(
    `function assertAppleStoreSandboxAuditPasses() {
  try {
    execSync("node packages/app-core/scripts/audit-apple-store-sandbox.mjs", {
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    console.error("release-check: Apple store sandbox audit failed.");
    process.exit(1);
  }
}
`,
    `function assertAppleStoreSandboxAuditPasses() {
  const auditScriptPath = resolveExistingPath([
    "packages/app-core/scripts/audit-apple-store-sandbox.mjs",
    "eliza/packages/app-core/scripts/audit-apple-store-sandbox.mjs",
  ]);
  if (!auditScriptPath) {
    console.error("release-check: Apple store sandbox audit script is missing.");
    process.exit(1);
  }

  try {
    execSync(\`node \${JSON.stringify(auditScriptPath)}\`, {
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    console.error("release-check: Apple store sandbox audit failed.");
    process.exit(1);
  }
}
`,
  );

  return patched;
}

function patchWhisperBuildWindowsConfig(raw) {
  if (raw.includes('"--config"')) return raw;

  // MSBuild (the default Windows generator) is multi-config, so the cmake
  // configure-time CMAKE_BUILD_TYPE=Release flag is ignored; without --config
  // at build time MSBuild silently picks Debug. Outputs then land in Debug
  // subdirs that the post-build search probes never look at. Force Release at
  // build time on Windows, and broaden the candidate lookup so both Release
  // and Debug subdirs resolve (covers stale local caches too).
  let patched = raw.replace(
    `  const buildArgs = [
    "--build",
    buildPath,
    "--target",`,
    `  const buildArgs = [
    "--build",
    buildPath,
    ...(process.platform === "win32" ? ["--config", "Release"] : []),
    "--target",`,
  );

  patched = patched.replace(
    `      : process.platform === "win32"
        ? [
            path.join(subBuild, "src", "whisper.dll"),
            path.join(subBuild, "whisper.dll"),
          ]`,
    `      : process.platform === "win32"
        ? [
            path.join(subBuild, "src", "Release", "whisper.dll"),
            path.join(subBuild, "src", "Debug", "whisper.dll"),
            path.join(subBuild, "src", "whisper.dll"),
            path.join(subBuild, "Release", "whisper.dll"),
            path.join(subBuild, "Debug", "whisper.dll"),
            path.join(subBuild, "whisper.dll"),
          ]`,
  );

  patched = patched.replace(
    `      : process.platform === "win32"
        ? [path.join(buildPath, "whisper_eliza_adapter.dll")]`,
    `      : process.platform === "win32"
        ? [
            path.join(buildPath, "Release", "whisper_eliza_adapter.dll"),
            path.join(buildPath, "Debug", "whisper_eliza_adapter.dll"),
            path.join(buildPath, "whisper_eliza_adapter.dll"),
          ]`,
  );

  // CLI lookup is non-fatal (a warning) but ship the matching Windows config
  // subdirs so the diagnostic logs the actual binary instead of giving up.
  patched = patched.replace(
    `  const cliCandidates = [
    path.join(buildPath, "bin", "whisper-cli"),
    path.join(subBuild, "bin", "whisper-cli"),
    path.join(subBuild, "whisper-cli"),
  ];`,
    `  const cliCandidates =
    process.platform === "win32"
      ? [
          path.join(buildPath, "bin", "Release", "whisper-cli.exe"),
          path.join(buildPath, "bin", "Debug", "whisper-cli.exe"),
          path.join(buildPath, "bin", "whisper-cli.exe"),
          path.join(subBuild, "bin", "Release", "whisper-cli.exe"),
          path.join(subBuild, "bin", "Debug", "whisper-cli.exe"),
          path.join(subBuild, "bin", "whisper-cli.exe"),
          path.join(subBuild, "Release", "whisper-cli.exe"),
          path.join(subBuild, "Debug", "whisper-cli.exe"),
          path.join(subBuild, "whisper-cli.exe"),
        ]
      : [
          path.join(buildPath, "bin", "whisper-cli"),
          path.join(subBuild, "bin", "whisper-cli"),
          path.join(subBuild, "whisper-cli"),
        ];`,
  );

  return patched;
}

function patchValidateCdnAssetsRootDir(raw) {
  if (raw.includes("ELIZA_CDN_ROOT_DIR")) return raw;
  // Patch the CLI entry point to accept a root dir override
  let patched = raw.replace(
    "  await main();\n}",
    "  const overrideRoot = process.env.ELIZA_CDN_ROOT_DIR;\n  await main({ cwd: overrideRoot ? path.resolve(overrideRoot) : repoRoot });\n}",
  );
  // Patch validateGroup calls to accept asset root overrides via env
  patched = patched.replace(
    `  const [missingApp, missingHomepage] = await Promise.all([
    validateGroup(manifest.app, {
      repository,
      releaseTag: effectiveRef,
      assetRoot: "packages/app/public",
      retryPolicy,
    }),
    validateGroup(manifest.homepage, {
      repository,
      releaseTag: effectiveRef,
      assetRoot: "packages/homepage/public",
      retryPolicy,
    }),
  ]);`,
    `  const appAssetRoot = env.ELIZA_CDN_APP_ASSET_ROOT || "packages/app/public";
  const homepageAssetRoot = env.ELIZA_CDN_HOMEPAGE_ASSET_ROOT || "packages/homepage/public";
  const [missingApp, missingHomepage] = await Promise.all([
    validateGroup(manifest.app, {
      repository,
      releaseTag: effectiveRef,
      assetRoot: appAssetRoot,
      retryPolicy,
    }),
    validateGroup(manifest.homepage, {
      repository,
      releaseTag: effectiveRef,
      assetRoot: homepageAssetRoot,
      retryPolicy,
    }),
  ]);`,
  );
  return patched;
}

function patchStartApiServerCatchBlock(raw) {
  if (raw.includes("console.error(apiErrMsg)")) {
    return raw;
  }

  const existingCatch = raw.replace(
    "    logger.error(apiErrMsg);\n\n    // In server-only mode",
    "    logger.error(apiErrMsg);\n    console.error(apiErrMsg);\n\n    // In server-only mode",
  );
  if (existingCatch !== raw) {
    return existingCatch;
  }

  const before = `      const { port: actualApiPort } = await startApiServer({
        port: apiPort,
        runtime: currentRuntime,
        onRestart: async () => {
          if (!currentRuntime) {
            return null;
          }

          await upstreamShutdownRuntime(currentRuntime, "server-only restart");

          const restarted =
            (await upstreamStartElizaWithPgliteCompat({
              ...options,
              headless: true,
              serverOnly: false,
            })) ?? undefined;

          currentRuntime = restarted
            ? await repairRuntimeAfterBoot(restarted)
            : undefined;
          earlyCompatState.current = currentRuntime ?? null;

          return currentRuntime ?? null;
        },
      });
`;
  const after = `      let actualApiPort: number;
      try {
        const startedApiServer = await startApiServer({
          port: apiPort,
          runtime: currentRuntime,
          onRestart: async () => {
            if (!currentRuntime) {
              return null;
            }

            await upstreamShutdownRuntime(currentRuntime, "server-only restart");

            const restarted =
              (await upstreamStartElizaWithPgliteCompat({
                ...options,
                headless: true,
                serverOnly: false,
              })) ?? undefined;

            currentRuntime = restarted
              ? await repairRuntimeAfterBoot(restarted)
              : undefined;
            earlyCompatState.current = currentRuntime ?? null;

            return currentRuntime ?? null;
          },
        });
        actualApiPort = startedApiServer.port;
      } catch (apiErr) {
        const apiErrMsg =
          apiErr instanceof Error
            ? (apiErr.stack ?? apiErr.message)
            : String(apiErr);
        logger.error(\`[eliza] API server failed to start: \${apiErrMsg}\`);
        console.error(apiErrMsg);
        if (options?.serverOnly) {
          process.exit(1);
        }
        throw apiErr;
      }
`;

  return raw.replace(before, after);
}

function patchWorkspaceDistRelinkScript(raw) {
  if (raw.includes("nestedElizaPackageJson")) return raw;
  return raw.replace(
    `const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const { workspaceDirs, nameToDir } = collectWorkspaceMaps(
  root,
  rootPkg.workspaces ?? [],
);
const candidateBases = [root, ...workspaceDirs];
`,
    `const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const rootWorkspaceMaps = collectWorkspaceMaps(root, rootPkg.workspaces ?? []);
const workspaceDirs = [...rootWorkspaceMaps.workspaceDirs];
const nameToDir = new Map(rootWorkspaceMaps.nameToDir);

const nestedElizaPackageJson = join(root, "eliza", "package.json");
if (existsSync(nestedElizaPackageJson)) {
  const elizaRoot = join(root, "eliza");
  const elizaPkg = JSON.parse(readFileSync(nestedElizaPackageJson, "utf8"));
  const elizaWorkspaceMaps = collectWorkspaceMaps(
    elizaRoot,
    elizaPkg.workspaces ?? [],
  );
  for (const dir of elizaWorkspaceMaps.workspaceDirs) {
    workspaceDirs.push(dir);
  }
  for (const [name, dir] of elizaWorkspaceMaps.nameToDir) {
    if (!nameToDir.has(name)) {
      nameToDir.set(name, dir);
    }
  }
}
const candidateBases = [root, ...workspaceDirs];
`,
  );
}

function patchCorePluginRuntimeSurface(raw) {
  return raw
    .replace(
      '  "@elizaos/app-companion", // VRM companion emotes; actions gated until app session is active\n',
      "",
    )
    .replace(
      '  "@elizaos/app-lifeops", // LifeOps: personal ops — tasks, goals, calendar, inbox, website blocking\n',
      "",
    )
    .replace(
      '  "@elizaos/plugin-video", // Video download / transcription (managed yt-dlp + ffmpeg with auto-update on extractor failure)\n',
      "",
    );
}

function patchN8nAutoEnableDefault(raw) {
  return raw.replace(
    `    const localN8nEnabled =
      params.isNativePlatform === true
        ? false
        : n8nConfig?.localEnabled !== false;
`,
    `    const localN8nEnabled =
      params.isNativePlatform === true
        ? false
        : n8nConfig?.localEnabled === true;
`,
  );
}

function patchN8nCharacterKnowledge(raw) {
  return raw.replace(
    "  const n8nLocalEnabled = config.n8n?.localEnabled !== false;",
    "  const n8nLocalEnabled = config.n8n?.localEnabled === true;",
  );
}

const agentActionParamsTemplateDefinition = [
  "const EXTRACT_ACTION_PARAMS_TEMPLATE = `You are filling in missing parameters for the {{actionName}} action.",
  "Action description: {{actionDescription}}",
  "",
  "Parameter schema:",
  "{{schemaLines}}",
  "",
  "Already-supplied parameters: {{existingJson}}",
  "",
  "Missing required fields you must extract: {{missingFields}}",
  "",
  "{{recentConversationBlock}}",
  "",
  "Current user message: {{currentMessageText}}",
  "",
  "Return a JSON object containing values for the MISSING fields.",
  "If a value is genuinely indeterminable from the conversation, return null for that field.",
  'Example: {"subaction": "search", "query": "github"}',
  "",
  "JSON only. Return one JSON object. No prose, fences, thinking, or markdown.`;",
  "",
].join("\n");

function patchAgentExtractParamsPrompt(raw) {
  let next = raw
    .replace("  extractActionParamsTemplate,\n", "")
    .replace(
      "    template: extractActionParamsTemplate,",
      "    template: EXTRACT_ACTION_PARAMS_TEMPLATE,",
    );

  if (!next.includes("const EXTRACT_ACTION_PARAMS_TEMPLATE = `")) {
    next = next.replace(
      "const DEFAULT_RECENT_MESSAGES_LIMIT = 8;\n",
      `const DEFAULT_RECENT_MESSAGES_LIMIT = 8;\n${agentActionParamsTemplateDefinition}`,
    );
  }

  return next;
}

const agentConfigPathsImportBlock = `import fs from "node:fs";
import path from "node:path";
import {
  getElizaNamespace,
  migrateLegacyStateDir,
  readEnv,
  resolveOAuthDir,
  resolveStateDir,
  resolveUserPath,
} from "@elizaos/core";`;

const agentConfigPathsPatchedImportBlock = `import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { logger } from "@elizaos/core";`;

const agentConfigPathsHelpers = [
  'const LEGACY_NAMESPACE = "milady";',
  "const warnedAliases = new Set<string>();",
  "",
  "interface ReadEnvOptions {",
  "  env?: NodeJS.ProcessEnv;",
  "  defaultValue?: string;",
  "  silent?: boolean;",
  "}",
  "",
  "function defaultEnv(): NodeJS.ProcessEnv {",
  '  return typeof process !== "undefined" && process.env',
  "    ? process.env",
  "    : ({} as NodeJS.ProcessEnv);",
  "}",
  "",
  "function readRaw(env: NodeJS.ProcessEnv, key: string): string | undefined {",
  "  const value = env[key];",
  '  if (typeof value !== "string") return undefined;',
  "  const trimmed = value.trim();",
  "  return trimmed.length > 0 ? trimmed : undefined;",
  "}",
  "",
  "function readEnv(",
  "  canonicalKey: string,",
  "  legacyAliases: readonly string[] = [],",
  "  options: ReadEnvOptions = {},",
  "): string | undefined {",
  "  const env = options.env ?? defaultEnv();",
  "  const canonical = readRaw(env, canonicalKey);",
  "  if (canonical !== undefined) return canonical;",
  "  for (const alias of legacyAliases) {",
  "    const value = readRaw(env, alias);",
  "    if (value === undefined) continue;",
  "    if (!options.silent && !warnedAliases.has(alias)) {",
  "      warnedAliases.add(alias);",
  "      logger.warn(",
  '        "[env] \\"" +',
  "          alias +",
  '          "\\" is deprecated; use \\"" +',
  "          canonicalKey +",
  '          "\\" instead. The legacy name still works for now.",',
  "      );",
  "    }",
  "    return value;",
  "  }",
  "  return options.defaultValue;",
  "}",
  "",
  "function resolveUserPath(input: string): string {",
  "  const trimmed = input.trim();",
  "  if (!trimmed) return trimmed;",
  '  if (trimmed.startsWith("~")) {',
  "    return path.resolve(trimmed.replace(/^~(?=$|[\\\\/])/, homedir()));",
  "  }",
  "  return path.resolve(trimmed);",
  "}",
  "",
  "function getElizaNamespace(env: NodeJS.ProcessEnv = process.env): string {",
  '  return readEnv("ELIZA_NAMESPACE", [], { env }) ?? "eliza";',
  "}",
  "",
  "function resolveStateDir(",
  "  env: NodeJS.ProcessEnv = process.env,",
  "  getHome: () => string = homedir,",
  "): string {",
  '  const explicit = readEnv("ELIZA_STATE_DIR", ["MILADY_STATE_DIR"], { env });',
  "  if (explicit) return resolveUserPath(explicit);",
  '  return path.join(getHome(), "." + getElizaNamespace(env));',
  "}",
  "",
  "function resolveOAuthDir(",
  "  env: NodeJS.ProcessEnv = process.env,",
  "  stateDirPath: string = resolveStateDir(env),",
  "): string {",
  '  const explicit = readEnv("ELIZA_OAUTH_DIR", [], { env });',
  "  return explicit",
  "    ? resolveUserPath(explicit)",
  '    : path.join(stateDirPath, "credentials");',
  "}",
  "",
  "function migrateLegacyStateDir(",
  "  env: NodeJS.ProcessEnv = process.env,",
  "  getHome: () => string = homedir,",
  "): { migrated: boolean; from?: string; to?: string } {",
  '  if (readEnv("ELIZA_STATE_DIR", ["MILADY_STATE_DIR"], { env, silent: true })) {',
  "    return { migrated: false };",
  "  }",
  "  const namespace = getElizaNamespace(env);",
  "  if (namespace === LEGACY_NAMESPACE) return { migrated: false };",
  "  const home = getHome();",
  '  const newDir = path.join(home, "." + namespace);',
  '  const legacyDir = path.join(home, "." + LEGACY_NAMESPACE);',
  "  if (fs.existsSync(newDir)) return { migrated: false };",
  "  if (!fs.existsSync(legacyDir)) return { migrated: false };",
  "  try {",
  "    fs.mkdirSync(newDir, { recursive: true });",
  "    fs.cpSync(legacyDir, newDir, {",
  "      recursive: true,",
  "      force: false,",
  "      errorOnExist: false,",
  "      dereference: false,",
  "    });",
  "    logger.warn(",
  '      "[state-dir] migrated legacy state from \\"" +',
  "        legacyDir +",
  '        "\\" to \\"" +',
  "        newDir +",
  '        "\\". The old directory is left in place; you may remove it once you\'ve confirmed the migration.",',
  "    );",
  "    return { migrated: true, from: legacyDir, to: newDir };",
  "  } catch (err) {",
  "    logger.warn(",
  '      "[state-dir] failed to migrate legacy state from \\"" +',
  "        legacyDir +",
  '        "\\" to \\"" +',
  "        newDir +",
  '        "\\": " +',
  "        (err instanceof Error ? err.message : String(err)) +",
  '        ". Continuing with a fresh \\"" +',
  "        newDir +",
  '        "\\".",',
  "    );",
  "    return { migrated: false, from: legacyDir, to: newDir };",
  "  }",
  "}",
  "",
].join("\n");

function patchAgentConfigPaths(raw) {
  let next = raw.replace(
    agentConfigPathsImportBlock,
    agentConfigPathsPatchedImportBlock,
  );

  if (!next.includes("function getElizaNamespace(")) {
    next = next.replace(
      'const LEGACY_CONFIG_FILENAME = "milady.json";\n',
      `const LEGACY_CONFIG_FILENAME = "milady.json";\n${agentConfigPathsHelpers}`,
    );
  }

  return next;
}

const agentConfigPlainObjectHelper = [
  "function isPlainObject(value: unknown): value is Record<string, unknown> {",
  '  return typeof value === "object" && value !== null && !Array.isArray(value);',
  "}",
  "",
].join("\n");

function patchAgentConfigPlainObjectImport(raw) {
  let next = raw
    .replace('import { isPlainObject } from "@elizaos/shared";\n', "")
    .replace("  isPlainObject,\n", "");

  if (!next.includes("function isPlainObject(")) {
    next = next.replace(
      'import JSON5 from "json5";\n',
      `import JSON5 from "json5";\n\n${agentConfigPlainObjectHelper}`,
    );
  }

  return next;
}

function patchAgentRelationshipsGraphExports(raw) {
  return raw.replace(
    '  searchMemoriesForCluster,\n} from "@elizaos/core";',
    '  searchMemoriesForCluster,\n} from "../../../core/src/services/relationships-graph-builder.ts";',
  );
}

function patchAgentRuntimeSchemaDurationImport(raw) {
  return raw.replace(
    'import { parseDurationMs } from "@elizaos/shared";',
    'import { parseDurationMs } from "../../../shared/src/cli/parse-duration.ts";',
  );
}

function patchSqlRawConnectionReturnType(raw, managerTypeName) {
  return raw.replace(
    "  getRawConnection() {\n    return this.manager.getConnection();\n  }",
    `  getRawConnection(): ReturnType<${managerTypeName}["getConnection"]> {\n    return this.manager.getConnection();\n  }`,
  );
}

const ensureWhisperModelScript = `#!/usr/bin/env bash
set -euo pipefail

model="\${1:-base.en}"
whisper_pkg="\${WHISPER_NODE_PACKAGE_DIR:-}"

if [ -z "$whisper_pkg" ]; then
  whisper_pkg="$(node -e 'const { createRequire } = require("node:module"); const path = require("node:path"); const req = createRequire(process.cwd() + "/"); console.log(path.dirname(req.resolve("whisper-node/package.json")));')"
fi

models_dir="$whisper_pkg/lib/whisper.cpp/models"
model_file="$models_dir/ggml-$model.bin"
cache_dir="\${MILADY_WHISPER_MODEL_CACHE_DIR:-}"
cache_file=""

if [ -n "$cache_dir" ]; then
  cache_file="$cache_dir/ggml-$model.bin"
fi

if [ -n "$cache_file" ] && [ -f "$cache_file" ]; then
  mkdir -p "$models_dir"
  cp "$cache_file" "$model_file"
  exit 0
fi

if [ -f "$model_file" ]; then
  exit 0
fi

bash "$models_dir/download-ggml-model.sh" "$model"

if [ -n "$cache_file" ]; then
  mkdir -p "$cache_dir"
  cp "$model_file" "$cache_file"
fi
`;

function applyReleaseSourcePatches() {
  writeFileText(
    path.join(
      elizaDir,
      "packages",
      "app-core",
      "platforms",
      "electrobun",
      "scripts",
      "ensure-whisper-model.sh",
    ),
    ensureWhisperModelScript,
    "Electrobun whisper model script",
    0o755,
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "app-core",
      "scripts",
      "runtime-package-manifest.ts",
    ),
    (raw) =>
      raw.replace(
        '"@elizaos/agent/runtime/release-plugin-policy.js"',
        '"@elizaos/agent/runtime/release-plugin-policy"',
      ),
    "runtime-package-manifest release-plugin-policy import",
  );

  replaceFileText(
    path.join(elizaDir, "packages", "app-core", "deploy", "Dockerfile.cloud"),
    patchCloudDockerfile,
    "Dockerfile.cloud dependency pruning runner",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "app-core",
      "scripts",
      "build-patched-electrobun-cli.mjs",
    ),
    patchElectrobunCliPatchScript,
    "Electrobun rcedit patch compatibility",
  );

  for (const scriptName of ["smoke-test-windows.ps1", "smoke-test.sh"]) {
    replaceFileText(
      path.join(
        elizaDir,
        "packages",
        "app-core",
        "platforms",
        "electrobun",
        "scripts",
        scriptName,
      ),
      patchDesktopSmokeScript,
      `Electrobun packaged avatar smoke assets (${scriptName})`,
    );
  }

  replaceFileText(
    path.join(elizaDir, "packages", "core", "src", "runtime.ts"),
    patchCoreRuntimeTypes,
    "core structured response format type",
  );

  replaceFileText(
    path.join(elizaDir, "packages", "core", "src", "types", "state.ts"),
    patchCoreStateTypes,
    "core structured failure format type",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "app-core",
      "scripts",
      "copy-runtime-node-modules.ts",
    ),
    patchRuntimeCopyTarSafeHoists,
    "runtime copy tar-safe Solana hoists",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "browser-bridge",
      "scripts",
      "release-version.mjs",
    ),
    patchBrowserBridgeReleaseVersion,
    "browser bridge canary release versions",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "browser-bridge",
      "scripts",
      "package-safari.mjs",
    ),
    patchBrowserBridgeSafariPackage,
    "browser bridge Safari bundle identifiers",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "browser-bridge-extension",
      "scripts",
      "release-version.mjs",
    ),
    patchBrowserBridgeReleaseVersion,
    "browser bridge extension canary release versions",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "browser-bridge-extension",
      "scripts",
      "package-safari.mjs",
    ),
    patchBrowserBridgeSafariPackage,
    "browser bridge extension Safari bundle identifiers",
  );

  replaceFileText(
    path.join(elizaDir, "packages", "app-core", "scripts", "release-check.ts"),
    patchAppCoreReleaseCheck,
    "app-core release-check Milady wrappers",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "app-core",
      "scripts",
      "validate-cdn-assets.mjs",
    ),
    patchValidateCdnAssetsRootDir,
    "validate-cdn-assets ELIZA_CDN_ROOT_DIR override",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "plugins",
      "plugin-local-inference",
      "native",
      "build-whisper.mjs",
    ),
    patchWhisperBuildWindowsConfig,
    "whisper Windows MSBuild Release config + lookup",
  );

  replaceFileText(
    path.join(elizaDir, "packages", "app-core", "src", "runtime", "eliza.ts"),
    patchStartApiServerCatchBlock,
    "app-core API startup error visibility",
  );

  replaceFileText(
    path.join(elizaDir, "packages", "agent", "src", "runtime", "eliza.ts"),
    patchStartApiServerCatchBlock,
    "agent API startup error visibility",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "app-core",
      "platforms",
      "electrobun",
      "src",
      "native",
      "agent.ts",
    ),
    patchElectrobunAgentChildPathFallback,
    "Electrobun agent child PATH fallback",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "app-core",
      "scripts",
      "relink-workspace-packages-to-dist.mjs",
    ),
    patchWorkspaceDistRelinkScript,
    "workspace dist relink nested eliza discovery",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "agent",
      "src",
      "runtime",
      "core-plugins.ts",
    ),
    patchCorePluginRuntimeSurface,
    "agent core plugin runtime surface",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "agent",
      "src",
      "config",
      "plugin-auto-enable.ts",
    ),
    patchN8nAutoEnableDefault,
    "agent n8n explicit local auto-enable",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "agent",
      "src",
      "runtime",
      "build-character-config.ts",
    ),
    patchN8nCharacterKnowledge,
    "agent n8n explicit knowledge gate",
  );

  replaceFileText(
    path.join(elizaDir, "packages", "agent", "src", "config", "paths.ts"),
    patchAgentConfigPaths,
    "agent config path helpers",
  );

  for (const configFileName of ["config.ts", "includes.ts"]) {
    replaceFileText(
      path.join(elizaDir, "packages", "agent", "src", "config", configFileName),
      patchAgentConfigPlainObjectImport,
      `agent config plain object helper (${configFileName})`,
    );
  }

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "agent",
      "src",
      "services",
      "relationships-graph.ts",
    ),
    patchAgentRelationshipsGraphExports,
    "agent relationships graph local core exports",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "agent",
      "src",
      "config",
      "zod-schema.agent-runtime.ts",
    ),
    patchAgentRuntimeSchemaDurationImport,
    "agent runtime schema duration import",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "agent",
      "src",
      "actions",
      "extract-params.ts",
    ),
    patchAgentExtractParamsPrompt,
    "agent action param extraction prompt",
  );

  replaceFileText(
    path.join(elizaDir, "plugins", "plugin-computeruse", "src", "index.ts"),
    patchComputerUseVisionContextProvider,
    "plugin-computeruse missing vision context provider import",
  );

  replaceFileText(
    path.join(elizaDir, "plugins", "plugin-local-inference", "package.json"),
    patchLocalInferenceExternalGlob,
    "plugin-local-inference quoted node-llama external glob",
  );

  replaceFileText(
    path.join(elizaDir, "plugins", "plugin-capacitor-bridge", "package.json"),
    patchCapacitorBridgeBuildScript,
    "plugin-capacitor-bridge JS-only release build",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "plugins",
      "plugin-capacitor-bridge",
      "src",
      "index.ts",
    ),
    patchCapacitorBridgeLazyCliExports,
    "plugin-capacitor-bridge lazy mobile CLI exports",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "plugins",
      "plugin-sql",
      "typescript",
      "pg",
      "adapter.ts",
    ),
    (raw) => patchSqlRawConnectionReturnType(raw, "PostgresConnectionManager"),
    "plugin-sql pg raw connection return type",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "plugins",
      "plugin-sql",
      "typescript",
      "pglite",
      "adapter.ts",
    ),
    (raw) => patchSqlRawConnectionReturnType(raw, "PGliteClientManager"),
    "plugin-sql pglite raw connection return type",
  );

  replaceFileText(
    path.join(
      elizaDir,
      "plugins",
      "plugin-sql",
      "typescript",
      "neon",
      "adapter.ts",
    ),
    (raw) => patchSqlRawConnectionReturnType(raw, "NeonConnectionManager"),
    "plugin-sql neon raw connection return type",
  );
}

function main() {
  if (!fs.existsSync(path.join(elizaDir, "package.json"))) {
    console.log(
      "[apply-eliza-ci-patches] eliza checkout is absent; skipping local patch overlay",
    );
    return;
  }
  const patchPath =
    patchPathCandidates.find((candidate) => fs.existsSync(candidate)) ??
    patchPathCandidates[0];
  if (!fs.existsSync(patchPath)) {
    console.log(
      `[apply-eliza-ci-patches] no eliza CI patch file found at ${path.relative(repoRoot, patchPath)}; assuming current eliza checkout carries the required CI contracts`,
    );
    applyReleaseSourcePatches();
    return;
  }

  const wholeApplied = runGit(
    ["apply", "--unidiff-zero", "--reverse", "--check", patchPath],
    { allowFailure: true },
  );
  if (wholeApplied.status === 0) {
    console.log("[apply-eliza-ci-patches] eliza CI patches already applied");
    applyReleaseSourcePatches();
    return;
  }

  const wholeCheck = runGit(["apply", "--unidiff-zero", "--check", patchPath], {
    allowFailure: true,
  });
  if (wholeCheck.status === 0) {
    runGit(["apply", "--unidiff-zero", patchPath]);
    console.log("[apply-eliza-ci-patches] applied eliza CI patches");
    applyReleaseSourcePatches();
    return;
  }

  // Whole-patch apply failed — try per-file so unaffected files still get the
  // overlay and we can report precisely which files drifted.
  const chunks = splitPatchByFile(fs.readFileSync(patchPath, "utf8"));
  const applied = [];
  const alreadyApplied = [];
  const drifted = [];

  for (const chunk of chunks) {
    const result = tryApplyPatchChunk(chunk);
    if (result.status === "applied") {
      applied.push(chunk.path);
    } else if (result.status === "already-applied") {
      alreadyApplied.push(chunk.path);
    } else {
      drifted.push(chunk.path);
    }
  }

  if (applied.length > 0) {
    console.log(
      `[apply-eliza-ci-patches] applied ${applied.length} file(s) from eliza CI patch`,
    );
  }
  if (alreadyApplied.length > 0) {
    console.log(
      `[apply-eliza-ci-patches] ${alreadyApplied.length} file(s) already at patched state`,
    );
  }
  if (drifted.length > 0) {
    console.warn(
      `[apply-eliza-ci-patches] ${drifted.length} file(s) drifted from upstream and were skipped:\n  - ${drifted.join("\n  - ")}\nRegenerate eliza/patches/milady/eliza-ci-bootstrap/ci-release-contracts.patch against the current eliza submodule HEAD.`,
    );
  }
  applyReleaseSourcePatches();
}

try {
  main();
} catch (error) {
  console.error(
    `[apply-eliza-ci-patches] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
