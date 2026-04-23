#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPackageJson } from "./lib/read-package-json.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");

export const LOCAL_UPSTREAM_SKIP_ENVS = [
  "MILADY_SKIP_LOCAL_UPSTREAMS",
  "ELIZA_SKIP_LOCAL_UPSTREAMS",
];
export const LOCAL_UPSTREAM_FORCE_ENVS = [
  "MILADY_FORCE_LOCAL_UPSTREAMS",
  "ELIZA_FORCE_LOCAL_UPSTREAMS",
];
export const ELIZA_GIT_URL = "https://github.com/elizaos/eliza.git";
export const ELIZA_BRANCH = "develop";
export const ELIZA_REQUIRED_FILES = ["package.json"];
export const ELIZA_BUILD_STEPS = [
  {
    // Fresh CI checkouts do not track generated protobuf types for @elizaos/core.
    // Build the package once so src/types/generated exists before root typecheck/tests.
    check: path.join(
      "packages",
      "typescript",
      "src",
      "types",
      "generated",
      "eliza",
      "v1",
      "agent_pb.ts",
    ),
    cwd: path.join("packages", "typescript"),
    args: ["run", "build"],
    label: "@elizaos/core",
  },
  {
    check: path.join("packages", "prompts", "dist", "typescript", "index.ts"),
    cwd: path.join("packages", "prompts"),
    args: ["run", "build:typescript"],
    label: "@elizaos/prompts",
  },
  {
    check: path.join("packages", "skills", "dist", "index.js"),
    cwd: path.join("packages", "skills"),
    args: ["run", "build"],
    label: "@elizaos/skills",
  },
];

const OPTIONAL_ELIZA_PLUGIN_FALLBACK_TAG = "alpha";
const ELIZA_INSTALL_RETRY_DELAY_MS = 3_000;

// Plugins referenced as @elizaos/* workspace:* inside the eliza workspace but
// provided by a CI stub in the root repo rather than published on npm. Before
// `bun install --cwd eliza`, we inject an override into eliza/package.json so
// the workspace:* specifier resolves to the stub instead of failing.
const UNPUBLISHED_ELIZA_PLUGIN_CI_STUBS = [
  {
    packageName: "@elizaos/plugin-app-control",
    workspaceEntry: "plugins/plugin-app-control/typescript",
    /** Relative from eliza/ to the CI stub directory. */
    stubRelativePath: "../scripts/ci-stubs/elizaos-plugin-app-control",
  },
  {
    packageName: "@elizaos/plugin-wechat",
    workspaceEntry: "plugins/plugin-wechat",
    /** Relative from eliza/ to the CI stub directory. */
    stubRelativePath: "../scripts/ci-stubs/elizaos-plugin-wechat",
  },
];

const OPTIONAL_ELIZA_PLUGIN_PACKAGES = [
  {
    submodulePath: "plugins/plugin-sql",
    workspaceEntry: "plugins/plugin-sql/typescript",
    packageName: "@elizaos/plugin-sql",
  },
  {
    submodulePath: "plugins/plugin-ollama",
    workspaceEntry: "plugins/plugin-ollama/typescript",
    packageName: "@elizaos/plugin-ollama",
  },
  {
    submodulePath: "plugins/plugin-local-ai",
    workspaceEntry: "plugins/plugin-local-ai/typescript",
    packageName: "@elizaos/plugin-local-ai",
  },
];

const PACKAGE_LINK_ROOTS = [
  ["node_modules"],
  ["eliza", "node_modules"],
  ["apps", "app", "node_modules"],
  ["apps", "home", "node_modules"],
];
const ELIZA_AGENT_SKILLS_PLUGIN_BUILD = {
  label: "@elizaos/plugin-agent-skills",
  cwd: path.join("eliza", "plugins", "plugin-agent-skills", "typescript"),
  manifest: path.join(
    "eliza",
    "plugins",
    "plugin-agent-skills",
    "typescript",
    "package.json",
  ),
  artifact: path.join(
    "eliza",
    "plugins",
    "plugin-agent-skills",
    "typescript",
    "dist",
    "index.js",
  ),
  args: [
    "build",
    "./src/index.ts",
    "--outdir",
    "./dist",
    "--target",
    "node",
    "--format",
    "esm",
    "--sourcemap=linked",
    "--external",
    "node:*",
    "--external",
    "@elizaos/core",
    "--external",
    "fflate",
  ],
};
const ELIZA_TELEGRAM_PLUGIN_BUILD = {
  label: "@elizaos/plugin-telegram",
  cwd: path.join("eliza", "plugins", "plugin-telegram"),
  manifest: path.join("eliza", "plugins", "plugin-telegram", "package.json"),
  artifact: path.join(
    "eliza",
    "plugins",
    "plugin-telegram",
    "dist",
    "account-auth-service.js",
  ),
  args: ["run", "build"],
};
const ELIZA_EDGE_TTS_PLUGIN_BUILD = {
  label: "@elizaos/plugin-edge-tts",
  cwd: path.join("eliza", "plugins", "plugin-edge-tts", "typescript"),
  manifest: path.join(
    "eliza",
    "plugins",
    "plugin-edge-tts",
    "typescript",
    "package.json",
  ),
  artifact: path.join(
    "eliza",
    "plugins",
    "plugin-edge-tts",
    "typescript",
    "dist",
    "node",
    "index.node.js",
  ),
  args: ["run", "build"],
};
const ELIZA_REQUIRED_PLUGIN_BUILDS = [
  ELIZA_AGENT_SKILLS_PLUGIN_BUILD,
  ELIZA_TELEGRAM_PLUGIN_BUILD,
  ELIZA_EDGE_TTS_PLUGIN_BUILD,
];
const INBOX_REPLY_HINT_LEGACY =
  "Sent through the connected {{source}} account on this Mac.";
const INBOX_REPLY_HINT_PLATFORM_NEUTRAL =
  "Sent through the connected {{source}} account on this device.";
const MILADY_COPY_PATCH_RELATIVE_PATHS = [
  path.join(
    "packages",
    "app-core",
    "src",
    "components",
    "pages",
    "ChatView.tsx",
  ),
  path.join("packages", "app-core", "src", "i18n", "locales", "en.json"),
];
const PLUGIN_ANTHROPIC_CLAUDE_CLI_RELATIVE_PATH = path.join(
  "plugins",
  "plugin-anthropic",
  "typescript",
  "utils",
  "claude-cli.ts",
);
const PLUGIN_ANTHROPIC_INIT_RELATIVE_PATH = path.join(
  "plugins",
  "plugin-anthropic",
  "typescript",
  "init.ts",
);
const PLUGIN_ANTHROPIC_CLAUDE_CLI_REPLACEMENTS = [
  [
    "    inputTokens: number;\n    outputTokens: number;\n",
    "    promptTokens: number;\n    completionTokens: number;\n",
  ],
  [
    "    inputTokens: entry.inputTokens,\n    outputTokens: entry.outputTokens,\n",
    "    promptTokens: entry.inputTokens,\n    completionTokens: entry.outputTokens,\n",
  ],
  [
    "      promptTokens: usage.inputTokens,\n      completionTokens: usage.outputTokens,\n",
    "      promptTokens: usage.promptTokens,\n      completionTokens: usage.completionTokens,\n",
  ],
  [
    "                promptTokens: usage.inputTokens,\n                completionTokens: usage.outputTokens,\n",
    "                promptTokens: usage.promptTokens,\n                completionTokens: usage.completionTokens,\n",
  ],
];
const PLUGIN_ANTHROPIC_INIT_BUN_REPLACEMENTS = [
  [
    `        const result = Bun.spawnSync(["claude", "--version"], {\n          stdout: "pipe",\n          stderr: "pipe",\n        });\n        if (result.exitCode !== 0) throw new Error("claude not found");\n`,
    `        const bunRuntime = (globalThis as typeof globalThis & {\n          Bun?: {\n            spawnSync(\n              args: string[],\n              options: { stdout: "pipe"; stderr: "pipe" },\n            ): { exitCode: number };\n          };\n        }).Bun;\n        const result = bunRuntime?.spawnSync(["claude", "--version"], {\n          stdout: "pipe",\n          stderr: "pipe",\n        });\n        if (!result || result.exitCode !== 0) throw new Error("claude not found");\n`,
  ],
];
const PLUGIN_ANTHROPIC_CLAUDE_CLI_BUN_REPLACEMENTS = [
  [
    `function parseUsage(\n  modelUsage: Record<string, ClaudeCliModelUsage> | undefined,\n): CliGenerateResult["usage"] {\n  const entry = modelUsage ? Object.values(modelUsage)[0] : undefined;\n  if (!entry) return null;\n  return {\n    inputTokens: entry.inputTokens,\n    outputTokens: entry.outputTokens,\n    totalTokens: entry.inputTokens + entry.outputTokens,\n  };\n}\n\n/**\n * Run a prompt through \`claude -p\` (non-streaming).\n */\n`,
    `function parseUsage(\n  modelUsage: Record<string, ClaudeCliModelUsage> | undefined,\n): CliGenerateResult["usage"] {\n  const entry = modelUsage ? Object.values(modelUsage)[0] : undefined;\n  if (!entry) return null;\n  return {\n    promptTokens: entry.inputTokens,\n    completionTokens: entry.outputTokens,\n    totalTokens: entry.inputTokens + entry.outputTokens,\n  };\n}\n\nfunction getBunRuntime() {\n  const bunRuntime = (globalThis as typeof globalThis & {\n    Bun?: {\n      spawn(\n        args: string[],\n        options: { stdout: "pipe"; stderr: "pipe" },\n      ): {\n        stdout: ReadableStream<Uint8Array>;\n        stderr: ReadableStream<Uint8Array>;\n        exited: Promise<number>;\n      };\n    };\n  }).Bun;\n\n  if (!bunRuntime) {\n    throw new Error("[Anthropic CLI] Bun runtime is required for CLI mode");\n  }\n\n  return bunRuntime;\n}\n\n/**\n * Run a prompt through \`claude -p\` (non-streaming).\n */\n`,
  ],
  [
    `function parseUsage(\n  modelUsage: Record<string, ClaudeCliModelUsage> | undefined,\n): CliGenerateResult["usage"] {\n  const entry = modelUsage ? Object.values(modelUsage)[0] : undefined;\n  if (!entry) return null;\n  return {\n    promptTokens: entry.inputTokens,\n    completionTokens: entry.outputTokens,\n    totalTokens: entry.inputTokens + entry.outputTokens,\n  };\n}\n\n/**\n * Run a prompt through \`claude -p\` (non-streaming).\n */\n`,
    `function parseUsage(\n  modelUsage: Record<string, ClaudeCliModelUsage> | undefined,\n): CliGenerateResult["usage"] {\n  const entry = modelUsage ? Object.values(modelUsage)[0] : undefined;\n  if (!entry) return null;\n  return {\n    promptTokens: entry.inputTokens,\n    completionTokens: entry.outputTokens,\n    totalTokens: entry.inputTokens + entry.outputTokens,\n  };\n}\n\nfunction getBunRuntime() {\n  const bunRuntime = (globalThis as typeof globalThis & {\n    Bun?: {\n      spawn(\n        args: string[],\n        options: { stdout: "pipe"; stderr: "pipe" },\n      ): {\n        stdout: ReadableStream<Uint8Array>;\n        stderr: ReadableStream<Uint8Array>;\n        exited: Promise<number>;\n      };\n    };\n  }).Bun;\n\n  if (!bunRuntime) {\n    throw new Error("[Anthropic CLI] Bun runtime is required for CLI mode");\n  }\n\n  return bunRuntime;\n}\n\n/**\n * Run a prompt through \`claude -p\` (non-streaming).\n */\n`,
  ],
  [
    `const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });`,
    `const proc = getBunRuntime().spawn(args, { stdout: "pipe", stderr: "pipe" });`,
  ],
];
const TS_IGNORE_DEPRECATIONS_COMPAT_FILES = [
  path.join("packages", "typescript", "tsconfig.json"),
  path.join("packages", "typescript", "tsconfig.declarations.json"),
  path.join("packages", "shared", "tsconfig.json"),
  path.join("packages", "interop", "tsconfig.json"),
];
const TSUP_IGNORE_DEPRECATIONS_COMPAT_FILES = [
  path.join("plugins", "plugin-calendly", "tsconfig.json"),
  path.join("plugins", "plugin-github", "tsconfig.json"),
  path.join("plugins", "plugin-shopify", "tsconfig.json"),
];
const LIFEOPS_SETTINGS_SECTION_RELATIVE_PATH = path.join(
  "apps",
  "app-lifeops",
  "src",
  "components",
  "LifeOpsSettingsSection.tsx",
);
const LIFEOPS_LUCIDE_GITHUB_REPLACEMENTS = [
  [
    'import { Copy, ExternalLink, Github } from "lucide-react";',
    'import { Copy, ExternalLink, GitBranch } from "lucide-react";',
  ],
  [
    '<Github className="h-4 w-4 shrink-0" />',
    '<GitBranch className="h-4 w-4 shrink-0" />',
  ],
];

function toDisplayPath(targetPath) {
  return path.normalize(targetPath);
}

function runCommand(command, args, { cwd, env = process.env, label } = {}) {
  const printable = label ?? `${command} ${args.join(" ")}`;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `${printable} failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${printable} exited due to signal ${signal}`));
        return;
      }

      if ((code ?? 1) !== 0) {
        reject(new Error(`${printable} exited with code ${code ?? 1}`));
        return;
      }

      resolve();
    });
  });
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function writePackageJson(packagePath, raw, nextPackageJson) {
  const indent = raw.match(/^(\s+)"/m)?.[1] ?? "  ";
  writeFileSync(
    packagePath,
    `${JSON.stringify(nextPackageJson, null, indent)}\n`,
  );
}

function parseFirstNumericVersionSegment(versionSpecifier) {
  if (typeof versionSpecifier !== "string") {
    return null;
  }

  const match = versionSpecifier.match(/(\d+)(?:\.\d+)?(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const major = Number.parseInt(match[1], 10);
  return Number.isFinite(major) ? major : null;
}

export function resolveTypeScriptIgnoreDeprecationsTarget(
  repoRoot = DEFAULT_REPO_ROOT,
  { fallbackRoot } = {},
) {
  const candidateRoots = [repoRoot, fallbackRoot].filter(
    (candidate) => typeof candidate === "string" && candidate.length > 0,
  );

  for (const candidateRoot of candidateRoots) {
    const rootPackageJson = readPackageJson(candidateRoot);
    const versionSpecifier =
      rootPackageJson?.devDependencies?.typescript ??
      rootPackageJson?.dependencies?.typescript;
    const major = parseFirstNumericVersionSegment(versionSpecifier);
    if (major !== null) {
      return major >= 6 ? "6.0" : "5.0";
    }
  }

  return "5.0";
}

function buildIgnoreDeprecationsCompatibilityReplacements(targetVersion) {
  const alternateVersion = targetVersion === "6.0" ? "5.0" : "6.0";
  return [
    [
      `"ignoreDeprecations": "${alternateVersion}"`,
      `"ignoreDeprecations": "${targetVersion}"`,
    ],
  ];
}

export function applyMiladyCopyPatches(elizaRoot) {
  let patchedFiles = 0;
  let staleFiles = 0;

  for (const relativePath of MILADY_COPY_PATCH_RELATIVE_PATHS) {
    const filePath = path.join(elizaRoot, relativePath);
    if (!existsSync(filePath)) {
      continue;
    }

    const raw = readFileSync(filePath, "utf8");
    if (raw.includes(INBOX_REPLY_HINT_PLATFORM_NEUTRAL)) {
      continue;
    }

    const next = raw
      .split(INBOX_REPLY_HINT_LEGACY)
      .join(INBOX_REPLY_HINT_PLATFORM_NEUTRAL);

    if (next === raw) {
      staleFiles += 1;
      continue;
    }

    writeFileSync(filePath, next);
    patchedFiles += 1;
  }

  if (patchedFiles > 0) {
    console.log(
      `[setup-upstreams] Applied ${patchedFiles} Milady copy patch(es) for inbox reply hint`,
    );
  } else if (staleFiles > 0) {
    console.warn(
      "[setup-upstreams] WARNING: inbox reply hint legacy string not found — patch may need updating",
    );
  }

  return patchedFiles;
}

function applyTextReplacements(filePath, replacements, { label }) {
  if (!existsSync(filePath)) {
    return 0;
  }

  const raw = readFileSync(filePath, "utf8");
  let next = raw;
  let patchedReplacements = 0;
  let staleReplacements = 0;

  for (const [from, to] of replacements) {
    if (next.includes(to)) {
      continue;
    }
    if (!next.includes(from)) {
      staleReplacements += 1;
      continue;
    }
    const replacementsApplied = next.split(from).length - 1;
    next = next.split(from).join(to);
    patchedReplacements += replacementsApplied;
  }

  if (next !== raw) {
    writeFileSync(filePath, next);
    console.log(
      `[setup-upstreams] Applied ${label} (${patchedReplacements} replacement${patchedReplacements === 1 ? "" : "s"})`,
    );
  } else if (staleReplacements > 0) {
    console.warn(
      `[setup-upstreams] WARNING: ${label} no longer matches upstream source`,
    );
  }

  return patchedReplacements;
}

export function applyPluginAnthropicBunRuntimePatch(elizaRoot) {
  let patchedReplacements = 0;
  patchedReplacements += applyTextReplacements(
    path.join(elizaRoot, PLUGIN_ANTHROPIC_INIT_RELATIVE_PATH),
    PLUGIN_ANTHROPIC_INIT_BUN_REPLACEMENTS,
    { label: "plugin-anthropic Bun runtime init patch" },
  );
  patchedReplacements += applyTextReplacements(
    path.join(elizaRoot, PLUGIN_ANTHROPIC_CLAUDE_CLI_RELATIVE_PATH),
    PLUGIN_ANTHROPIC_CLAUDE_CLI_BUN_REPLACEMENTS,
    { label: "plugin-anthropic Bun runtime CLI patch" },
  );
  return patchedReplacements;
}

export function applyPluginAnthropicCliUsagePatch(elizaRoot) {
  return applyTextReplacements(
    path.join(elizaRoot, PLUGIN_ANTHROPIC_CLAUDE_CLI_RELATIVE_PATH),
    PLUGIN_ANTHROPIC_CLAUDE_CLI_REPLACEMENTS,
    { label: "plugin-anthropic Claude CLI usage patch" },
  );
}

export function applyTypeScriptIgnoreDeprecationsCompatPatch(
  elizaRoot,
  { repoRoot = DEFAULT_REPO_ROOT } = {},
) {
  let patchedReplacements = 0;
  const targetVersion = resolveTypeScriptIgnoreDeprecationsTarget(elizaRoot, {
    fallbackRoot: repoRoot,
  });
  const tsConfigReplacements =
    buildIgnoreDeprecationsCompatibilityReplacements(targetVersion);
  for (const relativePath of TS_IGNORE_DEPRECATIONS_COMPAT_FILES) {
    patchedReplacements += applyTextReplacements(
      path.join(elizaRoot, relativePath),
      tsConfigReplacements,
      {
        label: `TypeScript ignoreDeprecations compatibility patch (${relativePath})`,
      },
    );
  }
  for (const relativePath of TSUP_IGNORE_DEPRECATIONS_COMPAT_FILES) {
    patchedReplacements += applyTextReplacements(
      path.join(elizaRoot, relativePath),
      buildIgnoreDeprecationsCompatibilityReplacements("5.0"),
      {
        label: `tsup ignoreDeprecations compatibility patch (${relativePath})`,
      },
    );
  }
  return patchedReplacements;
}

export function applyLifeOpsLucideCompatPatch(elizaRoot) {
  return applyTextReplacements(
    path.join(elizaRoot, LIFEOPS_SETTINGS_SECTION_RELATIVE_PATH),
    LIFEOPS_LUCIDE_GITHUB_REPLACEMENTS,
    { label: "LifeOps lucide-react icon compatibility patch" },
  );
}

function uniqueLinks(links) {
  const deduped = new Map();
  for (const link of links) {
    deduped.set(link.linkPath, link);
  }
  return [...deduped.values()];
}

function uniquePaths(paths) {
  return [...new Set(paths.map((targetPath) => path.resolve(targetPath)))];
}

function walkWorkspaceFiles(dirPath, visit) {
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (
        [
          ".git",
          "android",
          "build",
          "dist",
          "ios",
          "node_modules",
          "out",
          "target",
        ].includes(entry.name)
      ) {
        continue;
      }
      walkWorkspaceFiles(entryPath, visit);
      continue;
    }

    visit(entryPath);
  }
}

function collectPackageJsonPaths(rootDir) {
  const packageJsonPaths = [path.join(rootDir, "package.json")];

  for (const rootName of ["packages", "plugins", "apps"]) {
    walkWorkspaceFiles(path.join(rootDir, rootName), (entryPath) => {
      if (path.basename(entryPath) === "package.json") {
        packageJsonPaths.push(entryPath);
      }
    });
  }

  return packageJsonPaths;
}

function getMissingOptionalElizaPlugins(
  elizaRoot,
  { pathExists = existsSync } = {},
) {
  return OPTIONAL_ELIZA_PLUGIN_PACKAGES.filter(({ workspaceEntry }) => {
    return !pathExists(path.join(elizaRoot, workspaceEntry, "package.json"));
  });
}

function getPresentOptionalElizaPlugins(
  elizaRoot,
  { pathExists = existsSync } = {},
) {
  return OPTIONAL_ELIZA_PLUGIN_PACKAGES.filter(({ workspaceEntry }) => {
    return pathExists(path.join(elizaRoot, workspaceEntry, "package.json"));
  });
}

export function getTemporaryElizaWorkspaceEntries(
  elizaRoot,
  { pathExists = existsSync } = {},
) {
  const optionalPluginWorkspaceEntries = getPresentOptionalElizaPlugins(
    elizaRoot,
    { pathExists },
  ).map(({ workspaceEntry }) => workspaceEntry);

  const unpublishedStubWorkspaceEntries =
    UNPUBLISHED_ELIZA_PLUGIN_CI_STUBS.filter(
      ({ stubRelativePath, workspaceEntry }) => {
        return (
          pathExists(path.join(elizaRoot, stubRelativePath, "package.json")) &&
          !pathExists(path.join(elizaRoot, workspaceEntry, "package.json"))
        );
      },
    ).map(({ stubRelativePath }) => stubRelativePath);

  const cloudBillingWorkspace = "cloud/packages/services/billing";
  const cloudBillingPackageJson = path.join(
    elizaRoot,
    cloudBillingWorkspace,
    "package.json",
  );
  const cloudBillingWorkspaceEntry =
    pathExists(cloudBillingPackageJson) &&
    !optionalPluginWorkspaceEntries.includes(cloudBillingWorkspace) &&
    !unpublishedStubWorkspaceEntries.includes(cloudBillingWorkspace)
      ? [cloudBillingWorkspace]
      : [];

  return [
    ...optionalPluginWorkspaceEntries,
    ...unpublishedStubWorkspaceEntries,
    ...cloudBillingWorkspaceEntry,
  ];
}

async function withTemporaryOptionalElizaPluginWorkspaces(elizaRoot, callback) {
  const packageJsonPath = path.join(elizaRoot, "package.json");
  const raw = readFileSync(packageJsonPath, "utf8");
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse ${packageJsonPath} while staging optional eliza plugin workspaces`,
      { cause: error },
    );
  }

  if (!Array.isArray(pkg.workspaces)) {
    return callback();
  }

  const missingWorkspaceEntries = getTemporaryElizaWorkspaceEntries(
    elizaRoot,
  ).filter((workspaceEntry) => !pkg.workspaces.includes(workspaceEntry));

  if (missingWorkspaceEntries.length === 0) {
    return callback();
  }

  pkg.workspaces = [...pkg.workspaces, ...missingWorkspaceEntries];
  writePackageJson(packageJsonPath, raw, pkg);
  console.log(
    `[setup-upstreams] Temporarily enabling eliza workspace entries (${missingWorkspaceEntries.join(", ")})`,
  );

  try {
    return await callback();
  } finally {
    writeFileSync(packageJsonPath, raw);
  }
}

async function maybeInitOptionalElizaPluginSubmodules(elizaRoot) {
  const missing = getMissingOptionalElizaPlugins(elizaRoot);
  if (missing.length === 0 || !existsSync(path.join(elizaRoot, ".git"))) {
    return missing;
  }

  try {
    await runCommand(
      "git",
      [
        "submodule",
        "update",
        "--init",
        "--recursive",
        ...missing.map(({ submodulePath }) => submodulePath),
      ],
      {
        cwd: elizaRoot,
        label: "git submodule update (optional eliza plugins)",
      },
    );
  } catch {
    // If these optional submodules are unavailable in CI, we fall back to
    // published packages below instead of hard-failing the whole setup.
  }

  return getMissingOptionalElizaPlugins(elizaRoot);
}

function shouldApplyOptionalElizaPluginFallback(env = process.env) {
  const localUpstreamsDisabled = LOCAL_UPSTREAM_SKIP_ENVS.some(
    (key) => env[key] === "1",
  );
  return env.CI === "true" && localUpstreamsDisabled;
}

function applyOptionalElizaPluginFallback(elizaRoot, missingPlugins) {
  if (missingPlugins.length === 0) {
    return 0;
  }

  const missingWorkspaceEntries = new Set(
    missingPlugins.map(({ workspaceEntry }) => workspaceEntry),
  );
  const missingPackageNames = new Set(
    missingPlugins.map(({ packageName }) => packageName),
  );
  let changedFiles = 0;

  for (const packageJsonPath of collectPackageJsonPaths(elizaRoot)) {
    const raw = readFileSync(packageJsonPath, "utf8");
    let pkg;
    try {
      pkg = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `Failed to parse ${packageJsonPath} while applying optional eliza plugin fallback`,
        { cause: error },
      );
    }

    let changed = false;

    if (
      packageJsonPath === path.join(elizaRoot, "package.json") &&
      Array.isArray(pkg.workspaces)
    ) {
      const nextWorkspaces = pkg.workspaces.filter(
        (entry) => !missingWorkspaceEntries.has(entry),
      );
      if (nextWorkspaces.length !== pkg.workspaces.length) {
        pkg.workspaces = nextWorkspaces;
        changed = true;
      }
    }

    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      if (!pkg[section] || typeof pkg[section] !== "object") {
        continue;
      }
      for (const packageName of missingPackageNames) {
        if (pkg[section][packageName] === "workspace:*") {
          pkg[section][packageName] = OPTIONAL_ELIZA_PLUGIN_FALLBACK_TAG;
          changed = true;
        }
      }
    }

    if (!changed) {
      continue;
    }

    writePackageJson(packageJsonPath, raw, pkg);
    changedFiles += 1;
  }

  return changedFiles;
}

/**
 * Inject overrides into `eliza/package.json` for @elizaos/* plugins that live
 * in the root repo's CI stub directory but are not published on npm. Without
 * these overrides, `bun install --cwd eliza` fails to resolve the workspace:*
 * specifiers in eliza/packages/agent and eliza/packages/app-core because the
 * local plugin package uses a different npm scope (@miladyai/*).
 *
 * The overrides are idempotent: re-running is safe if they are already present.
 */
export function applyUnpublishedPluginStubOverrides(
  elizaRoot,
  { pathExists = existsSync } = {},
) {
  const packageJsonPath = path.join(elizaRoot, "package.json");
  if (!pathExists(packageJsonPath)) {
    return 0;
  }

  const raw = readFileSync(packageJsonPath, "utf8");
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return 0;
  }

  if (typeof pkg !== "object" || pkg === null) {
    return 0;
  }

  const overrides =
    typeof pkg.overrides === "object" && pkg.overrides !== null
      ? pkg.overrides
      : {};
  let changed = false;

  for (const {
    packageName,
    stubRelativePath,
    workspaceEntry,
  } of UNPUBLISHED_ELIZA_PLUGIN_CI_STUBS) {
    const stubAbsolutePath = path.resolve(elizaRoot, stubRelativePath);
    const stubPackageJsonPath = path.join(stubAbsolutePath, "package.json");
    const realWorkspacePackageJsonPath = path.join(
      elizaRoot,
      workspaceEntry,
      "package.json",
    );
    const specifier = `file:${stubRelativePath}`;
    const shouldUseStub =
      pathExists(stubPackageJsonPath) &&
      !pathExists(realWorkspacePackageJsonPath);

    if (!shouldUseStub) {
      if (overrides[packageName] === specifier) {
        delete overrides[packageName];
        changed = true;
      }
      continue;
    }

    if (overrides[packageName] === specifier) {
      continue;
    }
    overrides[packageName] = specifier;
    changed = true;
  }

  if (!changed) {
    return 0;
  }

  if (Object.keys(overrides).length === 0) {
    delete pkg.overrides;
  } else {
    pkg.overrides = overrides;
  }
  writePackageJson(packageJsonPath, raw, pkg);
  return UNPUBLISHED_ELIZA_PLUGIN_CI_STUBS.length;
}

function getForceEnvKey(env = process.env) {
  return LOCAL_UPSTREAM_FORCE_ENVS.find((key) => env[key] === "1") ?? null;
}

export function getRepoElizaRoot(repoRoot = DEFAULT_REPO_ROOT) {
  return path.resolve(repoRoot, "eliza");
}

export function getRepoPluginsRoot(repoRoot = DEFAULT_REPO_ROOT) {
  return path.resolve(repoRoot, "eliza", "plugins");
}

export function getElizaWorkspaceSkipReason(
  repoRoot = DEFAULT_REPO_ROOT,
  { env = process.env, pathExists = existsSync } = {},
) {
  const matchedSkipEnv =
    LOCAL_UPSTREAM_SKIP_ENVS.find((key) => env[key] === "1") ?? null;
  if (matchedSkipEnv) {
    return `${matchedSkipEnv}=1`;
  }

  const devWorkspaceMarkers = [
    path.join(repoRoot, ".git"),
    path.join(repoRoot, "tsconfig.json"),
    path.join(repoRoot, "apps", "app", "vite.config.ts"),
  ];

  const isDevCheckout = devWorkspaceMarkers.every((marker) =>
    pathExists(marker),
  );
  if (!isDevCheckout && !getForceEnvKey(env)) {
    return "non-development install";
  }

  return null;
}

export function shouldSetupElizaWorkspace(
  repoRoot = DEFAULT_REPO_ROOT,
  options,
) {
  return getElizaWorkspaceSkipReason(repoRoot, options) === null;
}

export function hasRequiredElizaWorkspaceFiles(
  elizaRoot,
  { pathExists = existsSync } = {},
) {
  return ELIZA_REQUIRED_FILES.every((relativePath) =>
    pathExists(path.join(elizaRoot, relativePath)),
  );
}

export function hasInstalledElizaDependencies(
  elizaRoot,
  { pathExists = existsSync } = {},
) {
  return (
    pathExists(path.join(elizaRoot, "node_modules", ".bun")) &&
    pathExists(path.join(elizaRoot, "node_modules", ".bin"))
  );
}

function getPackageLinkRootPaths(
  repoRoot,
  { elizaRoot = getRepoElizaRoot(repoRoot) } = {},
) {
  const roots = PACKAGE_LINK_ROOTS.map((segments) =>
    path.join(repoRoot, ...segments),
  );
  for (const packageDir of discoverElizaAppPackageDirs(elizaRoot)) {
    const packageNodeModules = path.join(packageDir, "node_modules");
    if (existsSync(packageNodeModules)) {
      roots.push(packageNodeModules);
    }
  }

  return uniquePaths(roots);
}

function getPackageLinkEntries(
  repoRoot,
  packageName,
  targetPath,
  linkRootPaths = getPackageLinkRootPaths(repoRoot),
) {
  if (typeof packageName !== "string" || packageName.length === 0) {
    return [];
  }

  const packageSegments = packageName.startsWith("@")
    ? packageName.split("/").filter(Boolean)
    : [packageName];

  if (
    packageSegments.length === 0 ||
    (packageName.startsWith("@") && packageSegments.length !== 2)
  ) {
    return [];
  }

  return linkRootPaths.map((rootPath) => ({
    linkPath: path.join(rootPath, ...packageSegments),
    targetPath,
  }));
}

function discoverElizaPackageDirsForParents(elizaRoot, parentDirs) {
  const packageDirs = [];
  for (const parentDir of parentDirs) {
    const searchRoot = path.join(elizaRoot, parentDir);
    if (!existsSync(searchRoot)) {
      continue;
    }

    let entries = [];
    try {
      entries = readdirSync(searchRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }
      const packageDir = path.join(searchRoot, entry.name);
      const packageJson = readPackageJson(packageDir);
      const packageName = packageJson?.name;
      if (
        packageName?.startsWith("@elizaos/") &&
        !packageName.endsWith("-root")
      ) {
        packageDirs.push(packageDir);
      }
    }
  }

  return packageDirs;
}

function discoverElizaAppPackageDirs(elizaRoot) {
  return discoverElizaPackageDirsForParents(elizaRoot, ["apps"]);
}

function discoverElizaPackageDirs(elizaRoot) {
  return discoverElizaPackageDirsForParents(elizaRoot, [
    "apps",
    "packages",
    "plugins",
  ]);
}

function discoverPluginPackageDirs(pluginsRoot) {
  if (!existsSync(pluginsRoot)) {
    return [];
  }

  const packageDirs = [];
  let entries = [];
  try {
    entries = readdirSync(pluginsRoot, { withFileTypes: true });
  } catch {
    return packageDirs;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }

    const repoDir = path.join(pluginsRoot, entry.name);
    const tsDir = path.join(repoDir, "typescript");
    const tsPackage = readPackageJson(tsDir);
    if (tsPackage?.name?.startsWith("@elizaos/")) {
      packageDirs.push(tsDir);
      continue;
    }

    const rootPackage = readPackageJson(repoDir);
    const rootName = rootPackage?.name;
    const shouldLinkRoot =
      typeof rootName === "string" &&
      rootName.startsWith("@") &&
      !rootName.endsWith("-root");

    if (shouldLinkRoot) {
      packageDirs.push(repoDir);
    }
  }

  return packageDirs;
}

export function getElizaPackageLinks(
  repoRoot = DEFAULT_REPO_ROOT,
  elizaRoot = getRepoElizaRoot(repoRoot),
  linkRootPaths = getPackageLinkRootPaths(repoRoot, { elizaRoot }),
) {
  const links = [];
  for (const packageDir of discoverElizaPackageDirs(elizaRoot)) {
    const packageJson = readPackageJson(packageDir);
    links.push(
      ...getPackageLinkEntries(
        repoRoot,
        packageJson?.name,
        packageDir,
        linkRootPaths,
      ),
    );
  }
  return uniqueLinks(links);
}

export function getPluginPackageLinks(
  repoRoot = DEFAULT_REPO_ROOT,
  pluginsRoot = getRepoPluginsRoot(repoRoot),
  linkRootPaths = getPackageLinkRootPaths(repoRoot, { pluginsRoot }),
) {
  const links = [];
  for (const packageDir of discoverPluginPackageDirs(pluginsRoot)) {
    const packageJson = readPackageJson(packageDir);
    links.push(
      ...getPackageLinkEntries(
        repoRoot,
        packageJson?.name,
        packageDir,
        linkRootPaths,
      ),
    );
  }
  return uniqueLinks(links);
}

export function getUpstreamPackageLinks(
  repoRoot = DEFAULT_REPO_ROOT,
  {
    elizaRoot = getRepoElizaRoot(repoRoot),
    pluginsRoot = getRepoPluginsRoot(repoRoot),
  } = {},
) {
  const combinedByTarget = new Map();
  const linkRootPaths = getPackageLinkRootPaths(repoRoot, {
    elizaRoot,
    pluginsRoot,
  });

  for (const link of getElizaPackageLinks(repoRoot, elizaRoot, linkRootPaths)) {
    combinedByTarget.set(link.linkPath, link);
  }

  for (const link of getPluginPackageLinks(
    repoRoot,
    pluginsRoot,
    linkRootPaths,
  )) {
    combinedByTarget.set(link.linkPath, link);
  }

  return [...combinedByTarget.values()];
}

function isBuildArtifactStale(
  manifestPath,
  artifactPath,
  { pathExists = existsSync, stat = statSync } = {},
) {
  if (!pathExists(artifactPath)) {
    return true;
  }

  try {
    return stat(manifestPath).mtimeMs > stat(artifactPath).mtimeMs;
  } catch {
    return true;
  }
}

async function ensureElizaPluginBuild(
  buildConfig,
  repoRoot = DEFAULT_REPO_ROOT,
  {
    pathExists = existsSync,
    stat = statSync,
    runCommandImpl = runCommand,
    log = console.log,
  } = {},
) {
  const manifestPath = path.join(repoRoot, buildConfig.manifest);
  if (!pathExists(manifestPath)) {
    return false;
  }

  const artifactPath = path.join(repoRoot, buildConfig.artifact);
  const stale = isBuildArtifactStale(manifestPath, artifactPath, {
    pathExists,
    stat,
  });
  if (!stale) {
    return false;
  }

  const reason = !pathExists(artifactPath)
    ? `${buildConfig.artifact} is missing`
    : `${buildConfig.artifact} is older than ${buildConfig.manifest}`;
  log(`[setup-upstreams] Building ${buildConfig.label} because ${reason}`);
  await runCommandImpl("bun", buildConfig.args, {
    cwd: path.join(repoRoot, buildConfig.cwd),
    label: `bun ${buildConfig.args.join(" ")} (${buildConfig.label})`,
  });
  return true;
}

export async function ensureElizaAgentSkillsPluginBuild(
  repoRoot = DEFAULT_REPO_ROOT,
  options = {},
) {
  return ensureElizaPluginBuild(
    ELIZA_AGENT_SKILLS_PLUGIN_BUILD,
    repoRoot,
    options,
  );
}

export async function ensureRequiredElizaPluginBuilds(
  repoRoot = DEFAULT_REPO_ROOT,
  options = {},
) {
  let builtAny = false;
  for (const buildConfig of ELIZA_REQUIRED_PLUGIN_BUILDS) {
    builtAny =
      (await ensureElizaPluginBuild(buildConfig, repoRoot, options)) ||
      builtAny;
  }
  return builtAny;
}

export function isPackageLinkCurrent(linkPath, targetPath) {
  if (!existsSync(linkPath) || !existsSync(targetPath)) {
    return false;
  }

  try {
    return realpathSync(linkPath) === realpathSync(targetPath);
  } catch {
    return false;
  }
}

function createLink(linkPath, targetPath, kind = "dir") {
  if (isPackageLinkCurrent(linkPath, targetPath)) {
    return false;
  }

  rmSync(linkPath, {
    force: true,
    recursive: true,
  });

  mkdirSync(path.dirname(linkPath), { recursive: true });

  const linkTarget =
    process.platform === "win32"
      ? targetPath
      : path.relative(path.dirname(linkPath), targetPath) || ".";
  const linkType =
    process.platform === "win32"
      ? kind === "dir"
        ? "junction"
        : "file"
      : kind;

  symlinkSync(linkTarget, linkPath, linkType);
  return true;
}

export function createPackageLink(linkPath, targetPath) {
  return createLink(linkPath, targetPath, "dir");
}

function createBinLink(linkPath, targetPath) {
  return createLink(linkPath, targetPath, "file");
}

function getPackageBinEntries(packageJson) {
  if (!packageJson) {
    return [];
  }

  if (typeof packageJson.bin === "string") {
    const packageBasename = packageJson.name?.split("/").pop();
    if (!packageBasename) {
      return [];
    }
    return [[packageBasename, packageJson.bin]];
  }

  if (!packageJson.bin || typeof packageJson.bin !== "object") {
    return [];
  }

  return Object.entries(packageJson.bin).filter(
    ([binName, binPath]) =>
      typeof binName === "string" &&
      binName.length > 0 &&
      typeof binPath === "string" &&
      binPath.length > 0,
  );
}

function ensurePackageBinLinks(
  packageDir,
  dependencyLinkPath,
  dependencyPackageDir,
) {
  let linkedBins = 0;
  const dependencyPackageJson = readPackageJson(dependencyPackageDir);
  const binEntries = getPackageBinEntries(dependencyPackageJson);
  if (binEntries.length === 0) {
    return linkedBins;
  }

  const packageBinDir = path.join(packageDir, "node_modules", ".bin");
  mkdirSync(packageBinDir, { recursive: true });

  for (const [binName, binRelativePath] of binEntries) {
    const targetFile = path.join(dependencyPackageDir, binRelativePath);
    if (!existsSync(targetFile)) {
      continue;
    }

    const binLinkPath = path.join(packageBinDir, binName);
    const binTargetPath = path.join(dependencyLinkPath, binRelativePath);
    if (createBinLink(binLinkPath, binTargetPath)) {
      linkedBins += 1;
    }
  }

  return linkedBins;
}

export function findInstalledPackageDir(
  repoRoot,
  packageName,
  preferredVersion,
  localTargetPath = null,
  { searchRoots = [repoRoot] } = {},
) {
  const resolvedLocalTarget =
    localTargetPath && existsSync(localTargetPath)
      ? realpathSync(localTargetPath)
      : null;
  const uniqueSearchRoots = [
    ...new Set(searchRoots.map((root) => path.resolve(root))),
  ];

  for (const searchRoot of uniqueSearchRoots) {
    const directPackagePath = path.join(
      searchRoot,
      "node_modules",
      ...packageName.split("/"),
    );
    try {
      const resolved = realpathSync(directPackagePath);
      if (existsSync(resolved) && resolved !== resolvedLocalTarget) {
        return directPackagePath;
      }
    } catch {}
  }

  const packagePrefix = `${packageName.replace("/", "+")}@`;
  const preferredPrefix =
    preferredVersion === undefined
      ? null
      : `${packageName.replace("/", "+")}@${preferredVersion}+`;

  for (const searchRoot of uniqueSearchRoots) {
    const bunCacheRoot = path.join(searchRoot, "node_modules", ".bun");
    if (!existsSync(bunCacheRoot)) {
      continue;
    }

    const matches = [];

    for (const entry of readdirSync(bunCacheRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(packagePrefix)) {
        continue;
      }

      const candidate = path.join(
        bunCacheRoot,
        entry.name,
        "node_modules",
        ...packageName.split("/"),
      );
      if (!existsSync(candidate)) {
        continue;
      }

      matches.push({
        candidate,
        preferred:
          preferredPrefix !== null && entry.name.startsWith(preferredPrefix),
      });
    }

    matches.sort(
      (left, right) => Number(right.preferred) - Number(left.preferred),
    );
    if (matches[0]?.candidate) {
      return matches[0].candidate;
    }
  }

  return null;
}

export function ensurePluginDependencyLinks(
  repoRoot,
  pluginsRoot = getRepoPluginsRoot(repoRoot),
) {
  let linkedDependencies = 0;
  const searchRoots = [repoRoot, getRepoElizaRoot(repoRoot)];

  for (const packageDir of discoverPluginPackageDirs(pluginsRoot)) {
    const packageJson = readPackageJson(packageDir);
    const packageName = packageJson?.name;
    if (!packageName?.startsWith("@elizaos/")) {
      continue;
    }

    rmSync(path.join(packageDir, "node_modules", ".bin"), {
      force: true,
      recursive: true,
    });

    const packageDependencies = {
      ...(packageJson.peerDependencies ?? {}),
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.optionalDependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    };
    const dependencyNames = Object.keys(packageDependencies);
    if (dependencyNames.length === 0) {
      continue;
    }

    for (const dependencyName of dependencyNames) {
      const installedDependencyDir = findInstalledPackageDir(
        repoRoot,
        dependencyName,
        undefined,
        null,
        { searchRoots },
      );
      if (!installedDependencyDir) {
        continue;
      }

      const dependencyLinkPath = path.join(
        packageDir,
        "node_modules",
        ...dependencyName.split("/"),
      );
      if (createPackageLink(dependencyLinkPath, installedDependencyDir)) {
        linkedDependencies += 1;
      }
      linkedDependencies += ensurePackageBinLinks(
        packageDir,
        dependencyLinkPath,
        installedDependencyDir,
      );
    }
  }

  if (linkedDependencies > 0) {
    console.log(
      `[setup-upstreams] Linked ${linkedDependencies} plugin dependency ${linkedDependencies === 1 ? "entry" : "entries"}`,
    );
  }

  return linkedDependencies;
}

export function getPublishedElizaPackageSpecs(repoRoot = DEFAULT_REPO_ROOT) {
  const rootPackageJson = readPackageJson(repoRoot);
  if (!rootPackageJson) {
    return [];
  }

  const collectedSpecs = new Map();
  for (const dependencyGroup of [
    rootPackageJson.dependencies,
    rootPackageJson.devDependencies,
    rootPackageJson.optionalDependencies,
    rootPackageJson.peerDependencies,
  ]) {
    if (!dependencyGroup || typeof dependencyGroup !== "object") {
      continue;
    }

    for (const [packageName, version] of Object.entries(dependencyGroup)) {
      if (
        !packageName.startsWith("@elizaos/") ||
        typeof version !== "string" ||
        version.startsWith("workspace:")
      ) {
        continue;
      }
      collectedSpecs.set(packageName, version);
    }
  }

  return [...collectedSpecs.entries()];
}

export function ensurePublishedElizaPackageLinks(repoRoot = DEFAULT_REPO_ROOT) {
  let linkedEntries = 0;

  for (const [packageName, preferredVersion] of getPublishedElizaPackageSpecs(
    repoRoot,
  )) {
    const installedPackageDir = findInstalledPackageDir(
      repoRoot,
      packageName,
      preferredVersion,
    );
    if (!installedPackageDir) {
      continue;
    }

    for (const { linkPath, targetPath } of getPackageLinkEntries(
      repoRoot,
      packageName,
      installedPackageDir,
    )) {
      if (path.resolve(linkPath) === path.resolve(targetPath)) {
        continue;
      }

      if (createPackageLink(linkPath, targetPath)) {
        linkedEntries += 1;
      }
    }
  }

  if (linkedEntries > 0) {
    console.log(
      `[setup-upstreams] Linked ${linkedEntries} published @elizaos package ${linkedEntries === 1 ? "entry" : "entries"}`,
    );
  }

  return linkedEntries;
}

async function ensureRepoLocalEliza(repoRoot) {
  const elizaRoot = getRepoElizaRoot(repoRoot);
  if (hasRequiredElizaWorkspaceFiles(elizaRoot)) {
    return elizaRoot;
  }

  if (existsSync(path.join(repoRoot, ".git"))) {
    console.log("[setup-upstreams] Initializing tracked submodules");
    try {
      await runCommand(
        "git",
        ["submodule", "update", "--init", "--recursive", "--", "eliza"],
        {
          cwd: repoRoot,
          label: "git submodule update eliza",
        },
      );
    } catch (error) {
      if (existsSync(elizaRoot)) {
        throw error;
      }

      console.warn(
        `[setup-upstreams] Could not initialize eliza as a tracked submodule. Falling back to a direct clone (${error instanceof Error ? error.message : String(error)}).`,
      );
    }
  }

  if (!hasRequiredElizaWorkspaceFiles(elizaRoot) && !existsSync(elizaRoot)) {
    console.log(
      `[setup-upstreams] Cloning ${ELIZA_GIT_URL} (${ELIZA_BRANCH}) into ${toDisplayPath(elizaRoot)}`,
    );
    await runCommand(
      "git",
      [
        "clone",
        "--branch",
        ELIZA_BRANCH,
        "--single-branch",
        ELIZA_GIT_URL,
        elizaRoot,
      ],
      {
        cwd: repoRoot,
        label: "git clone eliza",
      },
    );
  }

  if (!hasRequiredElizaWorkspaceFiles(elizaRoot)) {
    throw new Error(
      `Repo-local eliza workspace at ${toDisplayPath(elizaRoot)} is missing required files after setup.`,
    );
  }

  return elizaRoot;
}

async function ensureElizaDependencies(elizaRoot) {
  if (hasInstalledElizaDependencies(elizaRoot)) {
    await bootstrapBundledBunInstall(elizaRoot);
    return;
  }

  const missingOptionalPlugins =
    await maybeInitOptionalElizaPluginSubmodules(elizaRoot);
  if (
    missingOptionalPlugins.length > 0 &&
    shouldApplyOptionalElizaPluginFallback()
  ) {
    const changedFiles = applyOptionalElizaPluginFallback(
      elizaRoot,
      missingOptionalPlugins,
    );
    console.log(
      `[setup-upstreams] Falling back to published optional eliza plugins for CI (${missingOptionalPlugins
        .map(({ packageName }) => packageName)
        .join(", ")}); updated ${changedFiles} package.json file${
        changedFiles === 1 ? "" : "s"
      }.`,
    );
  }

  const stubOverrides = applyUnpublishedPluginStubOverrides(elizaRoot);
  if (stubOverrides > 0) {
    console.log(
      `[setup-upstreams] Added ${stubOverrides} unpublished plugin stub override(s) to eliza/package.json`,
    );
  }

  console.log(
    `[setup-upstreams] Installing eliza workspace dependencies in ${toDisplayPath(elizaRoot)}`,
  );
  await withTemporaryOptionalElizaPluginWorkspaces(elizaRoot, async () => {
    await runElizaInstallWithRetry(elizaRoot);
    await bootstrapBundledBunInstall(elizaRoot);
  });
}

export function getElizaInstallArgs(env = process.env) {
  return env.MILADY_NO_VISION_DEPS === "1"
    ? ["install", "--ignore-scripts"]
    : ["install"];
}

export async function runElizaInstallWithRetry(
  elizaRoot,
  {
    env = process.env,
    retryDelayMs = ELIZA_INSTALL_RETRY_DELAY_MS,
    runCommandImpl = runCommand,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  const installArgs = getElizaInstallArgs(env);

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await runCommandImpl("bun", installArgs, {
        cwd: elizaRoot,
        label: "bun install (eliza)",
      });
      return;
    } catch (error) {
      if (attempt >= 2) {
        throw error;
      }

      console.warn(
        `[setup-upstreams] bun install (eliza) failed on attempt ${attempt}; retrying once after ${retryDelayMs}ms to recover from transient dependency fetch errors`,
      );
      await wait(retryDelayMs);
    }
  }
}

export async function bootstrapBundledBunInstall(
  workspaceRoot,
  {
    env = process.env,
    pathExists = existsSync,
    runCommandImpl = runCommand,
  } = {},
) {
  if (env.MILADY_NO_VISION_DEPS !== "1") {
    return false;
  }

  const bunExecutableRelativePath = path.join(
    "node_modules",
    "bun",
    "bin",
    "bun.exe",
  );
  const bunExecutablePath = path.join(workspaceRoot, bunExecutableRelativePath);
  if (pathExists(bunExecutablePath)) {
    try {
      await runCommandImpl(bunExecutableRelativePath, ["--version"], {
        cwd: workspaceRoot,
        label: `${bunExecutableRelativePath} --version (eliza bun bootstrap probe)`,
      });
      return false;
    } catch {}
  }

  const bunInstallScriptRelativePath = path.join(
    "node_modules",
    "bun",
    "install.js",
  );
  const bunInstallScriptPath = path.join(
    workspaceRoot,
    bunInstallScriptRelativePath,
  );

  if (!pathExists(bunInstallScriptPath)) {
    throw new Error(
      `[setup-upstreams] Expected ${bunInstallScriptRelativePath} after bun install --ignore-scripts in ${toDisplayPath(
        workspaceRoot,
      )}, but it was missing.`,
    );
  }

  await runCommandImpl("node", [bunInstallScriptRelativePath], {
    cwd: workspaceRoot,
    label: "node node_modules/bun/install.js (eliza bun bootstrap)",
  });
  return true;
}

async function ensureElizaGeneratedKeywordData(elizaRoot) {
  const generatedKeywordDataPath = path.join(
    elizaRoot,
    "packages",
    "typescript",
    "src",
    "i18n",
    "generated",
    "validation-keyword-data.ts",
  );

  if (existsSync(generatedKeywordDataPath)) {
    return;
  }

  console.log("[setup-upstreams] Generating eliza i18n keyword data");
  await runCommand(
    "node",
    ["packages/shared/scripts/generate-keywords.mjs", "--target", "ts"],
    {
      cwd: elizaRoot,
      label: "node packages/shared/scripts/generate-keywords.mjs --target ts",
    },
  );
}

async function ensureElizaBuildOutputs(elizaRoot) {
  await ensureElizaGeneratedKeywordData(elizaRoot);

  for (const step of ELIZA_BUILD_STEPS) {
    if (existsSync(path.join(elizaRoot, step.check))) {
      continue;
    }

    console.log(`[setup-upstreams] Building ${step.label}`);
    await runCommand("bun", step.args, {
      cwd: path.join(elizaRoot, step.cwd),
      label: `bun ${step.args.join(" ")} (${step.label})`,
    });
  }
}

/**
 * Ensure plugin-anthropic's tsconfig.build.json explicitly loads @types/bun.
 *
 * When tsc runs `bun run build` for plugin-anthropic on fresh CI checkouts,
 * it reports TS2868 "Cannot find name 'Bun'" on init.ts / utils/claude-cli.ts
 * because the build config extends tsconfig.json but does not carry the
 * `compilerOptions.types` array forward deterministically. We force the
 * setting in-place so every CI/dev checkout sees a build config that
 * resolves @types/bun without relying on extends inheritance.
 *
 * Idempotent: only writes when the desired types list is not already present.
 */
export function ensurePluginAnthropicBunTypes(
  pluginsRoot,
  { pathExists = existsSync } = {},
) {
  const buildConfigPath = path.join(
    pluginsRoot,
    "plugin-anthropic",
    "typescript",
    "tsconfig.build.json",
  );

  if (!pathExists(buildConfigPath)) {
    return false;
  }

  const raw = readFileSync(buildConfigPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn(
      `[setup-upstreams] Could not parse ${toDisplayPath(buildConfigPath)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }

  const compilerOptions =
    parsed && typeof parsed === "object" && parsed.compilerOptions
      ? parsed.compilerOptions
      : {};
  const existingTypes = Array.isArray(compilerOptions.types)
    ? compilerOptions.types
    : null;

  if (existingTypes?.includes("bun")) {
    return false;
  }

  const nextTypes = existingTypes ? [...existingTypes] : ["node"];
  if (!nextTypes.includes("bun")) {
    nextTypes.push("bun");
  }

  const nextCompilerOptions = {
    ...compilerOptions,
    types: nextTypes,
  };
  const nextParsed = {
    ...parsed,
    compilerOptions: nextCompilerOptions,
  };

  const indent = raw.match(/^(\s+)"/m)?.[1] ?? "\t";
  writeFileSync(
    buildConfigPath,
    `${JSON.stringify(nextParsed, null, indent)}\n`,
  );
  console.log(
    `[setup-upstreams] Patched ${toDisplayPath(buildConfigPath)} to load @types/bun`,
  );
  return true;
}

export async function ensurePluginBuildOutputs(
  pluginsRoot,
  { pathExists = existsSync, runCommandImpl = runCommand } = {},
) {
  ensurePluginAnthropicBunTypes(pluginsRoot, { pathExists });
  for (const packageDir of discoverPluginPackageDirs(pluginsRoot)) {
    const packageJson = readPackageJson(packageDir);
    if (!packageJson?.name?.startsWith("@elizaos/")) {
      continue;
    }

    const hasBuildScript =
      packageJson.scripts && typeof packageJson.scripts.build === "string";
    if (!hasBuildScript || pathExists(path.join(packageDir, "dist"))) {
      continue;
    }

    console.log(`[setup-upstreams] Building ${packageJson.name}`);
    await runCommandImpl("bun", ["run", "build"], {
      cwd: packageDir,
      label: `bun run build (${packageJson.name})`,
    });
  }
}

export function linkUpstreamPackages(
  repoRoot = DEFAULT_REPO_ROOT,
  {
    elizaRoot = getRepoElizaRoot(repoRoot),
    pluginsRoot = getRepoPluginsRoot(repoRoot),
  } = {},
) {
  let updatedLinks = 0;
  for (const { linkPath, targetPath } of getUpstreamPackageLinks(repoRoot, {
    elizaRoot,
    pluginsRoot,
  })) {
    if (createPackageLink(linkPath, targetPath)) {
      updatedLinks += 1;
    }
  }
  return updatedLinks;
}

export async function setupUpstreams(repoRoot = DEFAULT_REPO_ROOT) {
  const skipReason = getElizaWorkspaceSkipReason(repoRoot);
  if (skipReason) {
    if (skipReason.endsWith("=1")) {
      ensurePublishedElizaPackageLinks(repoRoot);
      // Strip missing optional plugin workspace entries from eliza/package.json
      // so that any subsequent `bun install --cwd eliza` doesn't fail on
      // workspace paths that don't exist when plugin submodules are absent.
      // Guard: eliza/ may have been renamed by disable-local-eliza-workspace.mjs.
      const elizaRoot = getRepoElizaRoot(repoRoot);
      if (existsSync(path.join(elizaRoot, "package.json"))) {
        const missingPlugins = getMissingOptionalElizaPlugins(elizaRoot);
        if (missingPlugins.length > 0) {
          const patched = applyOptionalElizaPluginFallback(
            elizaRoot,
            missingPlugins,
          );
          if (patched > 0) {
            console.log(
              `[setup-upstreams] Stripped ${missingPlugins.length} missing optional plugin workspace(s) from eliza/package.json`,
            );
          }
        }
        const stubOverrides = applyUnpublishedPluginStubOverrides(elizaRoot);
        if (stubOverrides > 0) {
          console.log(
            `[setup-upstreams] Added ${stubOverrides} unpublished plugin stub override(s) to eliza/package.json`,
          );
        }
        applyMiladyCopyPatches(elizaRoot);
        applyTypeScriptIgnoreDeprecationsCompatPatch(elizaRoot);
        applyLifeOpsLucideCompatPatch(elizaRoot);
      }
    }
    console.log(`[setup-upstreams] Skipping: ${skipReason}`);
    return { skipped: true, reason: skipReason };
  }

  if (!commandExists("git")) {
    throw new Error(
      "git is required to initialize repo-local upstream sources",
    );
  }

  if (!commandExists("bun")) {
    throw new Error(
      "bun is required to install and link repo-local upstream sources",
    );
  }

  const elizaRoot = await ensureRepoLocalEliza(repoRoot);
  applyMiladyCopyPatches(elizaRoot);
  applyTypeScriptIgnoreDeprecationsCompatPatch(elizaRoot);
  applyLifeOpsLucideCompatPatch(elizaRoot);
  await ensureElizaDependencies(elizaRoot);
  await ensureElizaBuildOutputs(elizaRoot);

  const pluginsRoot = getRepoPluginsRoot(repoRoot);
  ensurePluginDependencyLinks(repoRoot, pluginsRoot);
  applyPluginAnthropicBunRuntimePatch(elizaRoot);
  applyPluginAnthropicCliUsagePatch(elizaRoot);
  await ensurePluginBuildOutputs(pluginsRoot);
  const updatedLinks = linkUpstreamPackages(repoRoot, {
    elizaRoot,
    pluginsRoot,
  });

  if (updatedLinks === 0) {
    console.log(
      "[setup-upstreams] Repo-local @elizaos package links already up to date",
    );
  } else {
    console.log(
      `[setup-upstreams] Linked ${updatedLinks} repo-local @elizaos package ${updatedLinks === 1 ? "entry" : "entries"}`,
    );
  }

  return {
    skipped: false,
    elizaRoot,
    pluginsRoot: existsSync(pluginsRoot) ? pluginsRoot : null,
    linkedEntries: updatedLinks,
  };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  setupUpstreams().catch((error) => {
    console.error(
      `[setup-upstreams] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
