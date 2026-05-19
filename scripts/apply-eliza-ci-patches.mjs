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

function writeFileTextIfMissing(filePath, content, label, sentinel, mode) {
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf8");
    if (raw === content || raw.includes(sentinel)) return;
  }
  writeFileText(filePath, content, label, mode);
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

function patchUiAppContextSingleton(raw) {
  if (raw.includes("__ELIZAOS_UI_APP_CONTEXT__")) {
    return raw;
  }

  const next = raw.replace(
    /import \{ createContext, useContext \} from "react";\r?\nimport type \{ AppContextValue \} from "\.\/types";\r?\n\r?\nexport const AppContext = createContext<AppContextValue \| null>\(null\);\r?\n/,
    `import { createContext, useContext } from "react";
import type { AppContextValue } from "./types";

type AppContextObject = ReturnType<
  typeof createContext<AppContextValue | null>
>;

const appContextGlobal = globalThis as typeof globalThis & {
  __ELIZAOS_UI_APP_CONTEXT__?: AppContextObject;
};

export const AppContext =
  appContextGlobal.__ELIZAOS_UI_APP_CONTEXT__ ??
  (appContextGlobal.__ELIZAOS_UI_APP_CONTEXT__ =
    createContext<AppContextValue | null>(null));
`,
  );

  if (next === raw) {
    throw new Error(
      "Could not patch UI AppContext singleton: expected AppContext declaration was not found",
    );
  }

  return next;
}

function patchCoreTsconfigLocalPrompts(raw) {
  if (raw.includes('"@elizaos/prompts": ["../prompts/src/index.ts"]')) {
    return raw;
  }

  return raw.replace(
    '"@elizaos/contracts/*": ["../contracts/src/*"],',
    [
      '"@elizaos/contracts/*": ["../contracts/src/*"],',
      '\t\t\t"@elizaos/prompts": ["../prompts/src/index.ts"],',
      '\t\t\t"@elizaos/prompts/*": ["../prompts/src/*"],',
    ].join("\n"),
  );
}

function patchCoreToonParser(raw) {
  if (raw.includes("export function parseToonKeyValue")) {
    return raw;
  }

  const parser = `function parseStructuredResponseFence(text: string): string {
\tconst trimmed = text.trim();
\tconst match = /^\\\`\\\`\\\`(?:toon|text)?\\s*([\\s\\S]*?)\\s*\\\`\\\`\\\`$/i.exec(trimmed);
\treturn match?.[1]?.trim() ?? trimmed;
}

function parseToonScalar(value: string): unknown {
\tif (!value) return "";
\tif (value === "null") return null;
\tif (
\t\t(value.startsWith('"') && value.endsWith('"')) ||
\t\t(value.startsWith("[") && value.endsWith("]")) ||
\t\t(value.startsWith("{") && value.endsWith("}"))
\t) {
\t\ttry {
\t\t\treturn JSON.parse(value);
\t\t} catch {
\t\t\treturn value;
\t\t}
\t}
\treturn value;
}

/**
 * Parses the simple TOON key-value shape used by generated plugin prompts.
 *
 * Supported fields are \`key: value\` and indexed arrays like
 * \`items[0]: value\`. Values stay as strings unless they are JSON literals,
 * which preserves large IDs such as Discord snowflakes.
 */
export function parseToonKeyValue<T = Record<string, unknown>>(text: string): T | null {
\tconst body = parseStructuredResponseFence(text);
\tif (!body) return null;

\tconst result: Record<string, unknown> = {};
\tlet found = false;
\tfor (const rawLine of body.split(/\\r?\\n/)) {
\t\tconst line = rawLine.trim();
\t\tif (!line || line.startsWith("#")) continue;

\t\tconst match = /^([A-Za-z_][\\w.-]*)(?:\\[(\\d+)\\])?\\s*:\\s*(.*)$/.exec(line);
\t\tif (!match) continue;

\t\tfound = true;
\t\tconst [, key, arrayIndex, rawValue] = match;
\t\tconst value = parseToonScalar(rawValue.trim());
\t\tif (arrayIndex === undefined) {
\t\t\tresult[key] = value;
\t\t\tcontinue;
\t\t}

\t\tconst index = Number.parseInt(arrayIndex, 10);
\t\tconst current = result[key];
\t\tconst values = Array.isArray(current) ? current : [];
\t\tvalues[index] = value;
\t\tresult[key] = values;
\t}

\treturn found ? (result as T) : null;
}

`;

  return raw.replace(
    /\/\*\*\r?\n \* Legacy structured-response parser\./,
    `${parser}/**\n * Legacy structured-response parser.`,
  );
}

function patchCoreToonParserExports(raw) {
  if (raw.includes("parseKeyValueXml, parseToonKeyValue")) {
    return raw.replaceAll(
      "parseKeyValueXml, parseToonKeyValue, parseToonKeyValue",
      "parseKeyValueXml, parseToonKeyValue",
    );
  }

  return raw.replaceAll(
    "addHeader, composePromptFromState, parseKeyValueXml",
    "addHeader, composePromptFromState, parseKeyValueXml, parseToonKeyValue",
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

function ensureConstStringArrayEntry(raw, arrayName, entry) {
  const arrayPattern = new RegExp(
    `const ${arrayName} = \\[\\r?\\n([\\s\\S]*?)\\r?\\n\\] as const;`,
  );
  return raw.replace(arrayPattern, (match, body) => {
    if (body.includes(`"${entry}"`)) return match;
    const lineEnding = match.includes("\r\n") ? "\r\n" : "\n";
    const trimmedBody = body.trimEnd();
    return `const ${arrayName} = [${lineEnding}${trimmedBody}${lineEnding}  "${entry}",${lineEnding}] as const;`;
  });
}

function patchReleasePluginPolicySupportPackages(raw) {
  let next = raw;
  if (!next.includes("BASELINE_PLUGIN_SUPPORT_PACKAGES")) {
    next = next
      .replace(
        /const BASELINE_PROVIDER_PLUGINS = \[\r?\n {2}"@elizaos\/plugin-elizacloud",\r?\n {2}"@elizaos\/plugin-openai",\r?\n {2}"@elizaos\/plugin-anthropic",\r?\n {2}"@elizaos\/plugin-ollama",\r?\n\] as const;\r?\n/,
        `const BASELINE_PROVIDER_PLUGINS = [
  "@elizaos/plugin-elizacloud",
  "@elizaos/plugin-openai",
  "@elizaos/plugin-anthropic",
  "@elizaos/plugin-ollama",
] as const;

// These are implementation dependencies of bundled core plugins. They need
// to ship in the runtime bundle, but are not auto-loaded by collectPluginNames.
const BASELINE_PLUGIN_SUPPORT_PACKAGES = [
  "@elizaos/plugin-calendly",
  "@elizaos/plugin-health",
  "@elizaos/plugin-app-manager",
  "@elizaos/plugin-registry",
  "@elizaos/plugin-wallet-ui",
  "@elizaos/plugin-wallet",
] as const;
`,
      )
      .replace(
        /  \.\.\.OPTIONAL_CORE_PLUGINS,\r?\n {2}\.\.\.BASELINE_PROVIDER_PLUGINS,\r?\n/,
        `  ...OPTIONAL_CORE_PLUGINS,
  ...BASELINE_PLUGIN_SUPPORT_PACKAGES,
  ...BASELINE_PROVIDER_PLUGINS,
`,
      );
  }

  for (const packageName of [
    "@elizaos/plugin-calendly",
    "@elizaos/plugin-health",
    "@elizaos/plugin-app-manager",
    "@elizaos/plugin-registry",
    "@elizaos/plugin-wallet-ui",
    "@elizaos/plugin-wallet",
  ]) {
    next = ensureConstStringArrayEntry(
      next,
      "BASELINE_PLUGIN_SUPPORT_PACKAGES",
      packageName,
    );
  }
  return next;
}

function patchRuntimeCopyTarSafeHoists(raw) {
  let next = raw
    .replace(
      'const DEP_SKIP = new Set(["typescript", "@types/node", "lucide-react"]);',
      'const DEP_SKIP = new Set(["typescript", "@types/node"]);',
    )
    .replace(
      'const ALWAYS_HOISTED_PACKAGES = new Set(["@elizaos/core"]);',
      'const ALWAYS_HOISTED_PACKAGES = new Set(["@elizaos/core", "commander"]);',
    );
  if (!next.includes('packageName === "googleapis"')) {
    next = next.replace(
      /  if \(packageName !== "@elevenlabs\/elevenlabs-js" \|\| !packageDir\) \{\r?\n    return false;\r?\n  \}\r?\n\r?\n  const relativePath = toPosixPath\(path\.relative\(packageDir, entryPath\)\);/,
      `  const relativePath = packageDir
    ? toPosixPath(path.relative(packageDir, entryPath))
    : "";
  if (
    packageName === "googleapis" &&
    (relativePath === "build/src/apis/docs" ||
      relativePath.startsWith("build/src/apis/docs/"))
  ) {
    return true;
  }

  if (packageName !== "@elevenlabs/elevenlabs-js" || !packageDir) {
    return false;
  }
`,
    );
  }
  if (!next.includes('packageName === "three"')) {
    next = next.replace(
      `  if (
    packageName === "googleapis" &&
    (relativePath === "build/src/apis/docs" ||
      relativePath.startsWith("build/src/apis/docs/"))
  ) {
    return true;
  }

  if (packageName !== "@elevenlabs/elevenlabs-js" || !packageDir) {
    return false;
  }
`,
      `  if (
    packageName === "googleapis" &&
    (relativePath === "build/src/apis/docs" ||
      relativePath.startsWith("build/src/apis/docs/"))
  ) {
    return true;
  }

  if (
    packageName === "three" &&
    (relativePath === "examples" ||
      relativePath === "examples/jsm" ||
      relativePath.startsWith("examples/jsm/") ||
      relativePath === "examples/fonts" ||
      relativePath.startsWith("examples/fonts/"))
  ) {
    return true;
  }

  if (packageName !== "@elevenlabs/elevenlabs-js" || !packageDir) {
    return false;
  }
`,
    );
  }
  if (!next.includes('packageName === "@elizaos/ui"')) {
    next = next.replace(
      `  if (
    packageName === "three" &&
    (relativePath === "examples" ||
      relativePath === "examples/jsm" ||
      relativePath.startsWith("examples/jsm/") ||
      relativePath === "examples/fonts" ||
      relativePath.startsWith("examples/fonts/"))
  ) {
    return true;
  }

  if (packageName !== "@elevenlabs/elevenlabs-js" || !packageDir) {
    return false;
  }
`,
      `  if (
    packageName === "three" &&
    (relativePath === "examples" ||
      relativePath === "examples/jsm" ||
      relativePath.startsWith("examples/jsm/") ||
      relativePath === "examples/fonts" ||
      relativePath.startsWith("examples/fonts/"))
  ) {
    return true;
  }

  if (
    packageName === "@elizaos/ui" &&
    (relativePath === "dist/cloud-ui/components/docs" ||
      relativePath.startsWith("dist/cloud-ui/components/docs/"))
  ) {
    return true;
  }

  if (packageName !== "@elevenlabs/elevenlabs-js" || !packageDir) {
    return false;
  }
`,
    );
  }
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
  if (!next.includes("function hasRootPackageOverride")) {
    next = next.replace(
      "\nfunction collectInstalledPackageDirs(",
      `
function hasRootPackageOverride(name: string): boolean {
  try {
    const manifest = readJson<{
      overrides?: Record<string, unknown>;
      resolutions?: Record<string, unknown>;
    }>(PACKAGE_JSON_PATH);
    return (
      Object.prototype.hasOwnProperty.call(manifest.overrides ?? {}, name) ||
      Object.prototype.hasOwnProperty.call(manifest.resolutions ?? {}, name)
    );
  } catch {
    return false;
  }
}

function collectInstalledPackageDirs(`,
    );
  }
  if (!next.includes("root override/resolution install")) {
    const rootOverridePreference = `  if (opts?.includeWorkspace !== false) {
    buildWorkspacePackageIndex();
    for (const candidate of workspacePackageIndex.get(name) ?? []) {
      addCandidate(candidate.sourceDir);
    }
  }

  // Root overrides/resolutions are the package manager's answer for peers.
  // Prefer that install over requester-local Bun store fallbacks so runtime
  // packaging follows the same graph used by app-core builds.
  if (hasRootPackageOverride(name)) {
    addCandidate(packagePath(name, ROOT_NODE_MODULES));
  }

  let dir = requesterDir;`;
    next = next.replace(
      /  if \(opts\?\.includeWorkspace !== false\) \{\r?\n    buildWorkspacePackageIndex\(\);\r?\n    for \(const candidate of workspacePackageIndex\.get\(name\) \?\? \[\]\) \{\r?\n      addCandidate\(candidate\.sourceDir\);\r?\n    }\r?\n  }\r?\n\r?\n  let dir = requesterDir;/,
      rootOverridePreference,
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
      "bash packages/app-core/platforms/electrobun/scripts/ensure-whisper-model.sh base.en",
      "bash eliza/packages/app-core/platforms/electrobun/scripts/ensure-whisper-model.sh base.en",
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

const remoteCapabilityEndpointProviderSource = `import {
  CAPABILITY_ROUTER_SERVICE_TYPE,
  type CapabilityEnvironment,
  type IAgentRuntime,
} from "@elizaos/core";
import {
  RemoteCapabilityRouterService,
  type RemoteCapabilityEndpointConfig,
} from "./remote-capability-router.ts";
import {
  syncRemoteCapabilityPlugins,
  type RemotePluginSyncResult,
  type RemotePluginTrustPolicy,
} from "./remote-plugin-adapter.ts";

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_CAPABILITY_ENVIRONMENT: CapabilityEnvironment = "server";

export type ProvisionedRemoteCapabilityEndpoint = {
  providerId: string;
  endpoint: RemoteCapabilityEndpointConfig;
  agentId?: string;
  jobId?: string;
  allowedModuleIds?: string[];
};

export type RemoteCapabilityEndpointProvider<TOptions = unknown> = {
  id: string;
  provision: (
    options: TOptions,
  ) => Promise<ProvisionedRemoteCapabilityEndpoint>;
};

export type DirectRemoteCapabilityEndpointProviderOptions = {
  endpoint: RemoteCapabilityEndpointConfig;
  allowedModuleIds?: string[];
};

export type ConnectRemoteCapabilityEndpointProviderOptions<
  TOptions = unknown,
> = {
  provider: RemoteCapabilityEndpointProvider<TOptions>;
  provisionOptions: TOptions;
  unloadMissing?: boolean;
  requestTimeoutMs?: number;
  environment?: CapabilityEnvironment;
  allowedModuleIds?: string[];
  reloadExisting?: boolean;
};

export type ConnectRemoteCapabilityEndpointProviderResult =
  ProvisionedRemoteCapabilityEndpoint & {
    sync: RemotePluginSyncResult;
  };

export type InstallRemoteCapabilityEndpointOptions = {
  enabled?: boolean;
  endpoint?: RemoteCapabilityEndpointConfig;
  endpoints?: RemoteCapabilityEndpointConfig[];
  environment?: CapabilityEnvironment;
  requestTimeoutMs?: number;
};

export function directRemoteCapabilityEndpointProvider(): RemoteCapabilityEndpointProvider<DirectRemoteCapabilityEndpointProviderOptions> {
  return {
    id: "direct",
    provision: async (options) => ({
      providerId: "direct",
      endpoint: normalizeEndpoint(options.endpoint),
      ...optionalStringListProp("allowedModuleIds", options.allowedModuleIds),
    }),
  };
}

export async function connectRemoteCapabilityEndpointProvider<TOptions>(
  runtime: IAgentRuntime,
  options: ConnectRemoteCapabilityEndpointProviderOptions<TOptions>,
): Promise<ConnectRemoteCapabilityEndpointProviderResult> {
  const provisioned = await options.provider.provision(
    options.provisionOptions,
  );
  const endpoint = normalizeEndpoint(provisioned.endpoint);
  const allowedModuleIds =
    normalizeStringList(options.allowedModuleIds) ??
    normalizeStringList(provisioned.allowedModuleIds);

  const router = installRemoteCapabilityEndpoint(runtime, {
    enabled: true,
    endpoints: [endpoint],
    environment: options.environment ?? DEFAULT_CAPABILITY_ENVIRONMENT,
    requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  });
  const modules = (await router.plugin.listModules({ endpointId: endpoint.id }))
    .modules;

  const sync = await syncRemoteCapabilityPlugins(runtime, {
    modules,
    reloadExisting: options.reloadExisting,
    unloadMissing: options.unloadMissing,
    unloadMissingEndpointIds: [endpoint.id],
    trustPolicy: buildRemoteCapabilityEndpointTrustPolicy(
      endpoint,
      allowedModuleIds,
    ),
  });

  return {
    ...provisioned,
    providerId: provisioned.providerId || options.provider.id,
    endpoint,
    ...optionalStringListProp("allowedModuleIds", allowedModuleIds),
    sync,
  };
}

export function installRemoteCapabilityEndpoint(
  runtime: IAgentRuntime,
  options: InstallRemoteCapabilityEndpointOptions,
): RemoteCapabilityRouterService {
  const endpoints = mergeEndpointConfigs(
    getRuntimeEndpointConfigs(runtime),
    normalizeInstallEndpoints(options),
  );
  const router = new RemoteCapabilityRouterService(runtime, {
    enabled: options.enabled ?? true,
    endpoints,
    environment: options.environment ?? DEFAULT_CAPABILITY_ENVIRONMENT,
    requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  });
  registerRuntimeService(runtime, router);
  return router;
}

export function buildRemoteCapabilityEndpointTrustPolicy(
  endpoint: RemoteCapabilityEndpointConfig | string,
  allowedModuleIds?: string[],
): RemotePluginTrustPolicy {
  const endpointId =
    typeof endpoint === "string" ? endpoint.trim() : endpoint.id.trim();
  if (!endpointId) {
    throw new Error("Remote capability endpoint id is required.");
  }
  return {
    allowedEndpointIds: [endpointId],
    ...optionalStringListProp("allowedModuleIds", allowedModuleIds),
    requireEndpointId: true,
  };
}

function normalizeInstallEndpoints(
  options: InstallRemoteCapabilityEndpointOptions,
): RemoteCapabilityEndpointConfig[] {
  const endpoints = [
    ...(options.endpoint ? [options.endpoint] : []),
    ...(options.endpoints ?? []),
  ].map(normalizeEndpoint);
  if (endpoints.length === 0) {
    throw new Error("At least one remote capability endpoint is required.");
  }
  return endpoints;
}

function normalizeEndpoint(
  endpoint: RemoteCapabilityEndpointConfig,
): RemoteCapabilityEndpointConfig {
  const id = endpoint.id.trim();
  const baseUrl = stripTrailingSlash(endpoint.baseUrl.trim());
  if (!id) {
    throw new Error("Remote capability endpoint id is required.");
  }
  if (!baseUrl) {
    throw new Error("Remote capability endpoint baseUrl is required.");
  }
  return {
    id,
    baseUrl,
    ...(endpoint.token?.trim() ? { token: endpoint.token.trim() } : {}),
  };
}

function getRuntimeEndpointConfigs(
  runtime: IAgentRuntime,
): RemoteCapabilityEndpointConfig[] {
  const runtimeServices = runtime as IAgentRuntime & {
    getService?: (service: string) => unknown;
    getServicesByType?: (service: string) => unknown[];
    services?: Map<string, unknown[]>;
  };
  const candidates = [
    ...(runtimeServices.getServicesByType?.(CAPABILITY_ROUTER_SERVICE_TYPE) ??
      []),
    runtimeServices.getService?.(CAPABILITY_ROUTER_SERVICE_TYPE),
    ...(runtimeServices.services?.get(CAPABILITY_ROUTER_SERVICE_TYPE) ?? []),
  ];
  const seen = new Set<unknown>();
  const endpoints: RemoteCapabilityEndpointConfig[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    if (!hasEndpointConfigs(candidate)) continue;
    endpoints.push(...candidate.getEndpointConfigs().map(normalizeEndpoint));
  }
  return endpoints;
}

function hasEndpointConfigs(
  value: unknown,
): value is { getEndpointConfigs: () => RemoteCapabilityEndpointConfig[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "getEndpointConfigs" in value &&
    typeof value.getEndpointConfigs === "function"
  );
}

function mergeEndpointConfigs(
  existing: RemoteCapabilityEndpointConfig[],
  next: RemoteCapabilityEndpointConfig[],
): RemoteCapabilityEndpointConfig[] {
  const byId = new Map<string, RemoteCapabilityEndpointConfig>();
  for (const endpoint of [...existing, ...next]) {
    const normalized = normalizeEndpoint(endpoint);
    byId.set(normalized.id, normalized);
  }
  return [...byId.values()];
}

function registerRuntimeService(
  runtime: IAgentRuntime,
  router: RemoteCapabilityRouterService,
): void {
  const services = (runtime as { services?: Map<string, unknown[]> }).services;
  if (!services || typeof services.set !== "function") return;
  const existing = services.get(CAPABILITY_ROUTER_SERVICE_TYPE) ?? [];
  services.set(CAPABILITY_ROUTER_SERVICE_TYPE, [
    router,
    ...existing.filter((service) => service !== router),
  ]);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\\/+$/, "");
}

function normalizeStringList(value: string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  const normalized = [
    ...new Set(value.map((item) => item.trim()).filter(Boolean)),
  ];
  return normalized.length === 0 ? undefined : normalized;
}

function optionalStringListProp<const TKey extends string>(
  key: TKey,
  value: string[] | undefined,
): Partial<Record<TKey, string[]>> {
  const normalized = normalizeStringList(value);
  return normalized === undefined
    ? {}
    : ({ [key]: normalized } as Partial<Record<TKey, string[]>>);
}
`;

const remoteCapabilityEndpointConformanceSource = `import {
  type CapabilityAvailability,
  type IAgentRuntime,
  type JsonObject,
  type JsonValue,
  type PluginCallRouteResult,
  type PluginGetAssetResult,
  type PluginGetProviderResult,
  type PluginInvokeActionResult,
  type RemotePluginModuleManifest,
  type RemotePluginRouteManifest,
  type RemotePluginViewManifest,
  type UUID,
} from "@elizaos/core";
import {
  RemoteCapabilityRouterService,
  type RemoteCapabilityEndpointConfig,
} from "./remote-capability-router.ts";

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export type RemoteCapabilityEndpointConformanceOptions = {
  endpoint: RemoteCapabilityEndpointConfig;
  requestTimeoutMs?: number;
  actionContent?: JsonObject;
  actionOptions?: JsonObject;
  providerState?: JsonObject;
  routeBody?: JsonValue;
  routeQuery?: Record<string, string | string[]>;
  routeHeaders?: Record<string, string>;
  requireViewAsset?: boolean;
};

export type RemoteCapabilityEndpointConformanceResult = {
  endpointId: string;
  moduleCount: number;
  availability: CapabilityAvailability;
  exercised: {
    action: string;
    provider: string;
    route: string;
    viewAsset?: string;
  };
};

type SelectedRemoteComponent<TComponent> = {
  module: RemotePluginModuleManifest;
  component: TComponent;
};

export async function assertRemoteCapabilityEndpointConformance(
  options: RemoteCapabilityEndpointConformanceOptions,
): Promise<RemoteCapabilityEndpointConformanceResult> {
  const endpoint = normalizeEndpoint(options.endpoint);
  const router = new RemoteCapabilityRouterService(makeRuntime(), {
    enabled: true,
    endpoints: [endpoint],
    environment: "server",
    requestTimeoutMs:
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  });

  const availability = await router.availability();
  assertPluginAvailability(endpoint, availability);

  const modules = (
    await router.plugin.listModules({ endpointId: endpoint.id })
  ).modules;
  assertValidModules(endpoint, modules);

  const action = findRequiredComponent(
    modules,
    "action",
    (module) => module.actions?.find((item) => isNonEmptyString(item.name)),
  );
  const actionResult = await router.plugin.invokeAction({
    endpointId: endpoint.id,
    moduleId: action.module.id,
    action: action.component.name,
    content: options.actionContent ?? {
      text: "remote capability endpoint conformance",
    },
    ...(options.actionOptions === undefined
      ? {}
      : { options: options.actionOptions }),
  });
  assertActionResult(endpoint, action, actionResult);

  const provider = findRequiredComponent(
    modules,
    "provider",
    (module) =>
      module.providers?.find((item) => isNonEmptyString(item.name)),
  );
  const providerResult = await router.plugin.getProvider({
    endpointId: endpoint.id,
    moduleId: provider.module.id,
    provider: provider.component.name,
    state: options.providerState ?? {},
  });
  assertProviderResult(endpoint, provider, providerResult);

  const route = findRequiredComponent(
    modules,
    "route",
    (module) =>
      module.routes?.find(
        (item) =>
          item.method !== "STATIC" &&
          isNonEmptyString(item.method) &&
          isNonEmptyString(item.path),
      ),
  );
  const routeResult = await router.plugin.callRoute({
    endpointId: endpoint.id,
    moduleId: route.module.id,
    method: route.component.method,
    path: route.component.path,
    ...(route.component.method === "GET"
      ? {}
      : { body: options.routeBody ?? { conformance: true } }),
    ...(options.routeQuery === undefined ? {} : { query: options.routeQuery }),
    ...(options.routeHeaders === undefined
      ? {}
      : { headers: options.routeHeaders }),
  });
  assertRouteResult(endpoint, route, routeResult);

  const exercised: RemoteCapabilityEndpointConformanceResult["exercised"] = {
    action: action.module.id + ":" + action.component.name,
    provider: provider.module.id + ":" + provider.component.name,
    route:
      route.module.id +
      ":" +
      route.component.method +
      " " +
      route.component.path,
  };

  if (options.requireViewAsset !== false) {
    const view = findRequiredComponent(
      modules,
      "view asset",
      (module) =>
        module.views?.find((item) => isNonEmptyString(item.bundlePath)),
    );
    const bundlePath = view.component.bundlePath as string;
    const asset = await router.plugin.getAsset({
      endpointId: endpoint.id,
      moduleId: view.module.id,
      path: bundlePath,
    });
    assertAssetResult(endpoint, view, asset);
    exercised.viewAsset = view.module.id + ":" + bundlePath;
  }

  return {
    endpointId: endpoint.id,
    moduleCount: modules.length,
    availability,
    exercised,
  };
}

function makeRuntime(): IAgentRuntime {
  return {
    agentId: "00000000-0000-0000-0000-000000000000" as UUID,
    character: { name: "Remote Capability Conformance" },
    getSetting: () => null,
  } as Partial<IAgentRuntime> as IAgentRuntime;
}

function normalizeEndpoint(
  endpoint: RemoteCapabilityEndpointConfig,
): RemoteCapabilityEndpointConfig {
  const id = endpoint.id.trim();
  const baseUrl = endpoint.baseUrl.trim().replace(/\\/+$/, "");
  if (!id) {
    throw new Error("Remote capability endpoint id is required.");
  }
  if (!baseUrl) {
    throw new Error("Remote capability endpoint baseUrl is required.");
  }
  return {
    id,
    baseUrl,
    ...(endpoint.token?.trim() ? { token: endpoint.token.trim() } : {}),
  };
}

function assertPluginAvailability(
  endpoint: RemoteCapabilityEndpointConfig,
  availability: CapabilityAvailability,
): void {
  if (!availability.available || !availability.capabilities.plugin) {
    throw new Error(
      "Remote capability endpoint " +
        endpoint.id +
        " does not advertise an available plugin capability.",
    );
  }
}

function assertValidModules(
  endpoint: RemoteCapabilityEndpointConfig,
  modules: RemotePluginModuleManifest[],
): void {
  if (!Array.isArray(modules) || modules.length === 0) {
    throw new Error(
      "Remote capability endpoint " +
        endpoint.id +
        " did not return any plugin modules.",
    );
  }
  const ids = new Set<string>();
  for (const module of modules) {
    if (!isNonEmptyString(module.id)) {
      throw new Error("Remote plugin module id must be a non-empty string.");
    }
    if (!isNonEmptyString(module.name)) {
      throw new Error(
        "Remote plugin module " +
          module.id +
          " name must be a non-empty string.",
      );
    }
    if (ids.has(module.id)) {
      throw new Error('Remote plugin module id "' + module.id + '" is duplicated.');
    }
    ids.add(module.id);
  }
}

function findRequiredComponent<TComponent>(
  modules: RemotePluginModuleManifest[],
  label: string,
  select: (module: RemotePluginModuleManifest) => TComponent | undefined,
): SelectedRemoteComponent<TComponent> {
  for (const module of modules) {
    const component = select(module);
    if (component !== undefined) {
      return { module, component };
    }
  }
  throw new Error("Remote capability endpoint is missing a " + label + ".");
}

function assertActionResult(
  endpoint: RemoteCapabilityEndpointConfig,
  action: SelectedRemoteComponent<{ name: string }>,
  result: PluginInvokeActionResult,
): void {
  if (!isRecord(result)) {
    throw new Error(
      "Remote action " +
        action.module.id +
        ":" +
        action.component.name +
        " on endpoint " +
        endpoint.id +
        " did not return an object.",
    );
  }
}

function assertProviderResult(
  endpoint: RemoteCapabilityEndpointConfig,
  provider: SelectedRemoteComponent<{ name: string }>,
  result: PluginGetProviderResult,
): void {
  if (!isRecord(result)) {
    throw new Error(
      "Remote provider " +
        provider.module.id +
        ":" +
        provider.component.name +
        " on endpoint " +
        endpoint.id +
        " did not return an object.",
    );
  }
}

function assertRouteResult(
  endpoint: RemoteCapabilityEndpointConfig,
  route: SelectedRemoteComponent<RemotePluginRouteManifest>,
  result: PluginCallRouteResult,
): void {
  if (!isRecord(result) || !Number.isInteger(result.status)) {
    throw new Error(
      "Remote route " +
        route.module.id +
        ":" +
        route.component.path +
        " on endpoint " +
        endpoint.id +
        " did not return a status.",
    );
  }
  if (result.status < 200 || result.status >= 400) {
    throw new Error(
      "Remote route " +
        route.module.id +
        ":" +
        route.component.path +
        " on endpoint " +
        endpoint.id +
        " returned HTTP " +
        result.status +
        ".",
    );
  }
}

function assertAssetResult(
  endpoint: RemoteCapabilityEndpointConfig,
  view: SelectedRemoteComponent<RemotePluginViewManifest>,
  asset: PluginGetAssetResult,
): void {
  if (!isRecord(asset) || !isNonEmptyString(asset.contentType)) {
    throw new Error(
      "Remote view asset " +
        view.module.id +
        ":" +
        view.component.bundlePath +
        " on endpoint " +
        endpoint.id +
        " did not return a content type.",
    );
  }
  if (!isNonEmptyString(asset.bodyBase64)) {
    throw new Error(
      "Remote view asset " +
        view.module.id +
        ":" +
        view.component.bundlePath +
        " on endpoint " +
        endpoint.id +
        " returned an empty body.",
    );
  }
  try {
    Buffer.from(asset.bodyBase64, "base64");
  } catch {
    throw new Error(
      "Remote view asset " +
        view.module.id +
        ":" +
        view.component.bundlePath +
        " on endpoint " +
        endpoint.id +
        " returned invalid base64.",
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
`;

const remoteCapabilityUrlEndpointProvidersSource = `import type { RemoteCapabilityEndpointProvider } from "./remote-capability-endpoint-provider.ts";
import type { RemoteCapabilityEndpointConfig } from "./remote-capability-router.ts";

export type UrlRemoteCapabilityEndpointProviderOptions = {
  baseUrl: string;
  endpointId?: string;
  token?: string;
  allowedModuleIds?: string[];
};

type UrlRemoteCapabilityEndpointProviderId =
  | "e2b"
  | "home-machine"
  | "mobile-companion"
  | "desktop-companion";

export const e2bCapabilityEndpointProvider =
  createUrlRemoteCapabilityEndpointProvider("e2b");

export const homeMachineCapabilityEndpointProvider =
  createUrlRemoteCapabilityEndpointProvider("home-machine");

export const mobileCompanionCapabilityEndpointProvider =
  createUrlRemoteCapabilityEndpointProvider("mobile-companion");

export const desktopCompanionCapabilityEndpointProvider =
  createUrlRemoteCapabilityEndpointProvider("desktop-companion");

function createUrlRemoteCapabilityEndpointProvider(
  id: UrlRemoteCapabilityEndpointProviderId,
): RemoteCapabilityEndpointProvider<UrlRemoteCapabilityEndpointProviderOptions> {
  return {
    id,
    provision: async (options) => ({
      providerId: id,
      endpoint: normalizeEndpoint(options, id),
      ...optionalStringListProp("allowedModuleIds", options.allowedModuleIds),
    }),
  };
}

function normalizeEndpoint(
  options: UrlRemoteCapabilityEndpointProviderOptions,
  defaultEndpointId: string,
): RemoteCapabilityEndpointConfig {
  const endpointId = normalizeEndpointId(options.endpointId, defaultEndpointId);
  const baseUrl = normalizeProviderBaseUrl(options.baseUrl);
  const token = options.token?.trim();
  return {
    id: endpointId,
    baseUrl,
    ...(token ? { token } : {}),
  };
}

function normalizeProviderBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Capability endpoint baseUrl is required.");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Capability endpoint baseUrl must be a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Capability endpoint baseUrl must use http or https.");
  }
  if (url.username || url.password) {
    throw new Error("Capability endpoint baseUrl must not include credentials.");
  }
  return url.toString().replace(/\\/+$/, "");
}

function normalizeEndpointId(
  value: string | undefined,
  fallback: string,
): string {
  const endpointId = (value ?? fallback).trim();
  if (!endpointId) {
    throw new Error("Capability endpoint id is required.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(endpointId)) {
    throw new Error(
      "Capability endpoint id may only contain letters, numbers, dots, underscores, colons, or dashes.",
    );
  }
  return endpointId;
}

function normalizeStringList(value: string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  const normalized = [
    ...new Set(value.map((item) => item.trim()).filter(Boolean)),
  ];
  return normalized.length === 0 ? undefined : normalized;
}

function optionalStringListProp<const TKey extends string>(
  key: TKey,
  value: string[] | undefined,
): Partial<Record<TKey, string[]>> {
  const normalized = normalizeStringList(value);
  return normalized === undefined
    ? {}
    : ({ [key]: normalized } as Partial<Record<TKey, string[]>>);
}
`;

const registerCapabilityRouterCommandSource = `import type { Command } from "commander";

type ConnectOptions = {
  id?: string;
  url: string;
  token?: string;
  provider?: string;
  allowedModule?: string[];
  persist?: boolean;
  unloadMissing?: boolean;
  timeoutMs?: string;
  apiUrl?: string;
  apiToken?: string;
  json?: boolean;
};

type ConformanceOptions = {
  token?: string;
  timeoutMs?: string;
  json?: boolean;
};

export function registerCapabilityRouterCommand(program: Command) {
  const capabilityRouter = program
    .command("capability-router")
    .description("Connect and validate remote capability-router endpoints");

  capabilityRouter
    .command("connect")
    .description("Connect a remote capability endpoint through the running agent API")
    .requiredOption("--url <url>", "Remote capability-router endpoint URL")
    .option("--id <id>", "Endpoint id", "default")
    .option("--token <token>", "Bearer token for the remote endpoint")
    .option(
      "--provider <provider>",
      "Endpoint provider mode: direct, e2b, home-machine, mobile-companion, or desktop-companion",
      "direct",
    )
    .option(
      "--allowed-module <id>",
      "Allowed remote plugin module id; repeat for more than one",
      collectValues,
      [],
    )
    .option("--no-persist", "Do not persist the endpoint")
    .option("--no-unload-missing", "Do not unload missing remote plugins for this endpoint")
    .option("--timeout-ms <ms>", "Remote request timeout in milliseconds")
    .option("--api-url <url>", "Running agent API base URL")
    .option("--api-token <token>", "Running agent API bearer token")
    .option("--json", "Print the raw API response as JSON")
    .action(async (options: ConnectOptions) => {
      const endpoint = {
        id: normalizeEndpointId(options.id ?? "default"),
        baseUrl: normalizeHttpUrl(options.url, "url"),
        ...(options.token?.trim() ? { token: options.token.trim() } : {}),
      };
      const allowedModuleIds = normalizeStringList(options.allowedModule);
      const body = {
        endpoint,
        ...(options.provider && options.provider !== "direct"
          ? { provider: options.provider }
          : {}),
        persist: options.persist !== false,
        unloadMissing: options.unloadMissing !== false,
        ...optionalPositiveIntegerProp(
          "requestTimeoutMs",
          options.timeoutMs,
          "timeout-ms",
        ),
        ...(allowedModuleIds === undefined ? {} : { allowedModuleIds }),
      };
      const result = await postAgentJson(
        resolveAgentApiBase(options.apiUrl),
        "/api/capability-router/connect",
        body,
        resolveAgentApiToken(options.apiToken),
      );
      printResult(result, options.json);
    });

  capabilityRouter
    .command("conformance <baseUrl>")
    .description("Validate a capability-router endpoint without provider-specific code")
    .option("--token <token>", "Endpoint bearer token")
    .option("--timeout-ms <ms>", "Request timeout in milliseconds", "60000")
    .option("--json", "Print the raw conformance result as JSON")
    .action(async (baseUrl: string, options: ConformanceOptions) => {
      const endpoint = normalizeHttpUrl(baseUrl, "baseUrl");
      const timeoutMs =
        parsePositiveInteger(options.timeoutMs, "timeout-ms") ?? 60000;
      const availability = await requestEndpointJson(
        endpoint,
        "GET",
        "/v1/capabilities",
        undefined,
        options.token,
        timeoutMs,
      );
      const modules = await requestEndpointJson(
        endpoint,
        "POST",
        "/v1/capabilities/invoke",
        { method: "plugin.modules.list", params: {} },
        options.token,
        timeoutMs,
      );
      const result = {
        ok: true,
        endpoint,
        availability,
        modules,
      };
      printResult(result, options.json);
    });
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

async function postAgentJson(
  apiBase: string,
  path: string,
  body: unknown,
  token: string | undefined,
): Promise<unknown> {
  const response = await fetch(new URL(path, apiBase), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
  });
  return await readJsonResponse(response, path);
}

async function requestEndpointJson(
  baseUrl: string,
  method: "GET" | "POST",
  path: string,
  body: unknown,
  token: string | undefined,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token?.trim() ? { authorization: "Bearer " + token.trim() } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    return await readJsonResponse(response, path);
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse(response: Response, label: string): Promise<unknown> {
  const text = await response.text();
  const data = text ? parseJson(text, label) : null;
  if (!response.ok) {
    throw new Error(errorMessageFromResponse(data, response.status, label));
  }
  return data;
}

function errorMessageFromResponse(
  data: unknown,
  status: number,
  label: string,
): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const error = record.error;
    if (typeof error === "string" && error.trim()) return error;
    if (error && typeof error === "object") {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string" && message.trim()) return message;
    }
    const message = record.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return label + " failed with HTTP " + status + ".";
}

function resolveAgentApiBase(value: string | undefined): string {
  return normalizeHttpUrl(
    value ??
      process.env.ELIZA_API_URL ??
      "http://127.0.0.1:" +
        (process.env.ELIZA_API_PORT ?? process.env.ELIZA_PORT ?? "31337"),
    "api-url",
  );
}

function resolveAgentApiToken(value: string | undefined): string | undefined {
  const token =
    value?.trim() ??
    process.env.ELIZA_API_TOKEN?.trim() ??
    process.env.MILADY_API_TOKEN?.trim();
  return token || undefined;
}

function normalizeHttpUrl(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(label + " is required.");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(label + " must be a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(label + " must use http or https.");
  }
  if (url.username || url.password) {
    throw new Error(label + " must not include credentials.");
  }
  return url.toString().replace(/\\/+$/, "");
}

function normalizeEndpointId(value: string): string {
  const endpointId = value.trim();
  if (!endpointId) throw new Error("Endpoint id is required.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(endpointId)) {
    throw new Error(
      "Endpoint id may only contain letters, numbers, dots, underscores, colons, or dashes.",
    );
  }
  return endpointId;
}

function optionalPositiveIntegerProp<const TKey extends string>(
  key: TKey,
  value: string | undefined,
  label: string,
): Partial<Record<TKey, number>> {
  const parsed = parsePositiveInteger(value, label);
  return parsed === undefined
    ? {}
    : ({ [key]: parsed } as Partial<Record<TKey, number>>);
}

function parsePositiveInteger(
  value: string | undefined,
  label: string,
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(label + " must be a positive integer.");
  }
  return parsed;
}

function normalizeStringList(value: string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  const normalized = [
    ...new Set(value.map((item) => item.trim()).filter(Boolean)),
  ];
  return normalized.length === 0 ? undefined : normalized;
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(label + " returned invalid JSON.");
  }
}

function printResult(value: unknown, rawJson: boolean | undefined): void {
  if (rawJson) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (value && typeof value === "object" && "success" in value) {
    const success = (value as { success?: unknown }).success;
    console.log(success === false ? "failed" : "connected");
    return;
  }
  console.log("ok");
}
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

  writeFileTextIfMissing(
    path.join(
      elizaDir,
      "packages",
      "agent",
      "src",
      "services",
      "remote-capability-endpoint-provider.ts",
    ),
    remoteCapabilityEndpointProviderSource,
    "agent remote capability endpoint provider",
    "connectRemoteCapabilityEndpointProvider",
  );

  writeFileTextIfMissing(
    path.join(
      elizaDir,
      "packages",
      "agent",
      "src",
      "services",
      "remote-capability-endpoint-conformance.ts",
    ),
    remoteCapabilityEndpointConformanceSource,
    "agent remote capability endpoint conformance harness",
    "assertRemoteCapabilityEndpointConformance",
  );

  writeFileTextIfMissing(
    path.join(
      elizaDir,
      "packages",
      "agent",
      "src",
      "services",
      "remote-capability-url-endpoint-providers.ts",
    ),
    remoteCapabilityUrlEndpointProvidersSource,
    "agent remote capability URL endpoint providers",
    "homeMachineCapabilityEndpointProvider",
  );

  writeFileTextIfMissing(
    path.join(
      elizaDir,
      "packages",
      "app-core",
      "src",
      "cli",
      "program",
      "register.capability-router.ts",
    ),
    registerCapabilityRouterCommandSource,
    "app-core capability-router CLI command registration",
    "registerCapabilityRouterCommand",
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
    path.join(elizaDir, "packages", "ui", "src", "state", "useApp.ts"),
    patchUiAppContextSingleton,
    "UI AppContext singleton",
  );

  replaceFileText(
    path.join(elizaDir, "packages", "core", "tsconfig.json"),
    patchCoreTsconfigLocalPrompts,
    "core local prompts path mapping",
  );

  replaceFileText(
    path.join(elizaDir, "packages", "core", "src", "utils.ts"),
    patchCoreToonParser,
    "core TOON key-value parser compatibility",
  );

  for (const coreIndexFile of [
    "index.node.ts",
    "index.browser.ts",
    "index.edge.ts",
  ]) {
    replaceFileText(
      path.join(elizaDir, "packages", "core", "src", coreIndexFile),
      patchCoreToonParserExports,
      `core TOON parser export (${coreIndexFile})`,
    );
  }

  replaceFileText(
    path.join(
      elizaDir,
      "packages",
      "agent",
      "src",
      "runtime",
      "release-plugin-policy.ts",
    ),
    patchReleasePluginPolicySupportPackages,
    "agent release plugin bundled support packages",
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
