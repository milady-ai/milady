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

function patchRuntimeCopyTarSafeHoists(raw) {
  let next = raw.replace(
    'const ALWAYS_HOISTED_PACKAGES = new Set(["@elizaos/core"]);',
    'const ALWAYS_HOISTED_PACKAGES = new Set(["@elizaos/core", "commander"]);',
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
  return raw
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
    );
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

function applyReleaseSourcePatches() {
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
    path.join(elizaDir, "packages", "app-core", "scripts", "release-check.ts"),
    patchAppCoreReleaseCheck,
    "app-core release browser bridge hard gate",
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
