#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

if (!fs.existsSync(path.join(repoRoot, "eliza", "package.json"))) {
  console.log(
    "[align-eliza-ci-node-modules] eliza checkout is absent; package-mode install does not need local alignment",
  );
  process.exit(0);
}

function compareVersions(left, right) {
  const leftParts = String(left)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  const rightParts = String(right)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return String(left).localeCompare(String(right));
}

function nodeModulesRoots() {
  return [
    path.join(repoRoot, "node_modules"),
    path.join(repoRoot, "eliza", "node_modules"),
  ];
}

function normalizePathForCompare(candidate) {
  return path.resolve(candidate);
}

function isExcludedPackagePath(candidate, excludedPaths) {
  const normalized = normalizePathForCompare(candidate);
  return excludedPaths.some(
    (excludedPath) => normalizePathForCompare(excludedPath) === normalized,
  );
}

function resolveBunStorePackage(packageName) {
  let best = null;
  for (const nodeModulesRoot of nodeModulesRoots()) {
    const store = path.join(nodeModulesRoot, ".bun");
    if (!fs.existsSync(store)) {
      continue;
    }

    for (const entry of fs.readdirSync(store).sort()) {
      const packageDir = path.join(
        store,
        entry,
        "node_modules",
        ...packageName.split("/"),
      );
      const packageJsonPath = path.join(packageDir, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }

      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
        if (pkg.name !== packageName) {
          continue;
        }
        const version = typeof pkg.version === "string" ? pkg.version : "0.0.0";
        if (!best || compareVersions(version, best.version) > 0) {
          best = { packageDir, version };
        }
      } catch {}
    }
  }

  return best?.packageDir ?? null;
}

function resolveInstalledPackage(packageName, { excludedPaths = [] } = {}) {
  for (const nodeModulesRoot of nodeModulesRoots()) {
    const direct = path.join(nodeModulesRoot, ...packageName.split("/"));
    if (isExcludedPackagePath(direct, excludedPaths)) {
      continue;
    }
    if (fs.existsSync(direct)) {
      return direct;
    }
  }

  const storePackage = resolveBunStorePackage(packageName);
  if (storePackage) {
    return storePackage;
  }

  return null;
}

function resolvePackageBinDirs(packageNames) {
  const dirs = [];
  for (const packageName of packageNames) {
    const packageDir = resolveInstalledPackage(packageName);
    if (!packageDir) {
      continue;
    }
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(packageDir, "package.json"), "utf8"),
      );
      const binEntries =
        typeof pkg.bin === "string"
          ? [pkg.bin]
          : pkg.bin && typeof pkg.bin === "object"
            ? Object.values(pkg.bin)
            : [];
      for (const binEntry of binEntries) {
        if (typeof binEntry !== "string") {
          continue;
        }
        dirs.push(path.dirname(path.join(packageDir, binEntry)));
      }
    } catch {}
  }
  return [...new Set(dirs)];
}

function linkRootPackage(packageName, targets) {
  const absoluteTargets = targets.map((targetRel) =>
    path.join(repoRoot, targetRel),
  );
  const source = resolveInstalledPackage(packageName, {
    excludedPaths: absoluteTargets,
  });
  if (!source) {
    throw new Error(`missing root package install: ${packageName}`);
  }

  for (const targetRel of targets) {
    const target = path.join(repoRoot, targetRel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    fs.symlinkSync(source, target, "dir");
    console.log(
      `[align-eliza-ci-node-modules] ${targetRel} -> ${path.relative(
        path.dirname(target),
        source,
      )}`,
    );
  }
}

function linkLocalPackage(packageName, sourceRel, targets) {
  const source = path.join(repoRoot, sourceRel);
  if (!fs.existsSync(path.join(source, "package.json"))) {
    throw new Error(
      `missing local package source for ${packageName}: ${source}`,
    );
  }

  for (const targetRel of targets) {
    const target = path.join(repoRoot, targetRel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    fs.symlinkSync(source, target, "dir");
    console.log(
      `[align-eliza-ci-node-modules] ${targetRel} -> ${path.relative(
        path.dirname(target),
        source,
      )}`,
    );
  }
}

function linkOptionalLocalPackage(packageName, sourceRel, targets) {
  const source = path.join(repoRoot, sourceRel, "package.json");
  if (!fs.existsSync(source)) {
    console.log(
      `[align-eliza-ci-node-modules] skipping ${packageName}; missing ${sourceRel}/package.json`,
    );
    return;
  }

  linkLocalPackage(packageName, sourceRel, targets);
}

function resolveFirstLocalPackageSource(packageName, sourceRelCandidates) {
  for (const sourceRel of sourceRelCandidates) {
    const source = path.join(repoRoot, sourceRel, "package.json");
    if (fs.existsSync(source)) {
      return sourceRel;
    }
  }

  console.log(
    `[align-eliza-ci-node-modules] skipping ${packageName}; missing ${sourceRelCandidates
      .map((candidate) => `${candidate}/package.json`)
      .join(" or ")}`,
  );
  return null;
}

function linkOptionalLocalPackageFromCandidates(
  packageName,
  sourceRelCandidates,
  targets,
) {
  const sourceRel = resolveFirstLocalPackageSource(
    packageName,
    sourceRelCandidates,
  );
  if (!sourceRel) return;
  linkLocalPackage(packageName, sourceRel, targets);
}

function discoverNativePluginPackages() {
  const pluginsDir = path.join(repoRoot, "eliza", "plugins");
  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  const packages = [];
  for (const entry of fs.readdirSync(pluginsDir).sort()) {
    if (!entry.startsWith("plugin-native-")) {
      continue;
    }
    const sourceRel = `eliza/plugins/${entry}`;
    const packageJsonPath = path.join(repoRoot, sourceRel, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      if (typeof pkg.name !== "string" || !pkg.name.startsWith("@elizaos/")) {
        continue;
      }
      packages.push([pkg.name, entry.replace(/^plugin-native-/, "")]);
    } catch {}
  }
  return packages;
}

function packageExportOutputRelPaths(sourceRel) {
  const packageJsonPath = path.join(repoRoot, sourceRel, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch {
    return [];
  }

  const rootExport = pkg.exports?.["."];
  const candidates =
    rootExport && typeof rootExport === "object"
      ? [rootExport.import, rootExport.require, rootExport.types]
      : [pkg.module, pkg.main, pkg.types];
  return [
    ...new Set(
      candidates
        .filter((entry) => typeof entry === "string")
        .filter((entry) => entry.startsWith("./dist/") || entry === "./dist")
        .map((entry) => entry.replace(/^\.\//, "")),
    ),
  ];
}

function ensureBuiltLocalPackage(
  packageName,
  sourceRel,
  outputRelPaths,
  { optional = false, outputChecks = [] } = {},
) {
  const source = path.join(repoRoot, sourceRel);
  if (!fs.existsSync(path.join(source, "package.json"))) {
    if (optional) {
      console.log(
        `[align-eliza-ci-node-modules] skipping ${packageName} build; missing ${sourceRel}/package.json`,
      );
      return;
    }
    throw new Error(
      `missing local package source for ${packageName}: ${source}`,
    );
  }

  const missingOutputs = outputRelPaths.filter(
    (outputRelPath) => !fs.existsSync(path.join(source, outputRelPath)),
  );
  const staleOutputs = outputChecks.filter(
    ({ path: outputRelPath, includes }) => {
      const outputPath = path.join(source, outputRelPath);
      if (!fs.existsSync(outputPath)) {
        return false;
      }
      return !fs.readFileSync(outputPath, "utf8").includes(includes);
    },
  );
  if (missingOutputs.length === 0 && staleOutputs.length === 0) {
    return;
  }

  const staleLabels = staleOutputs.map(
    ({ path: outputRelPath, includes }) =>
      `${outputRelPath} missing ${includes}`,
  );
  console.log(
    `[align-eliza-ci-node-modules] building ${packageName}; ${[
      missingOutputs.length > 0 ? `missing ${missingOutputs.join(", ")}` : null,
      staleLabels.length > 0 ? `stale ${staleLabels.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("; ")}`,
  );
  const result = spawnSync("bun", ["run", "build"], {
    cwd: source,
    env: {
      ...process.env,
      PATH: [
        path.join(repoRoot, "node_modules", ".bin"),
        ...resolvePackageBinDirs(["rollup", "typescript"]),
        process.env.PATH ?? "",
      ]
        .filter(Boolean)
        .join(path.delimiter),
    },
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `build failed for ${packageName} with exit code ${result.status ?? 1}`,
    );
  }

  const stillMissingOutputs = outputRelPaths.filter(
    (outputRelPath) => !fs.existsSync(path.join(source, outputRelPath)),
  );
  if (stillMissingOutputs.length > 0) {
    throw new Error(
      `build for ${packageName} did not create required output(s): ${stillMissingOutputs.join(", ")}`,
    );
  }

  const stillStaleOutputs = outputChecks.filter(
    ({ path: outputRelPath, includes }) => {
      const outputPath = path.join(source, outputRelPath);
      return (
        !fs.existsSync(outputPath) ||
        !fs.readFileSync(outputPath, "utf8").includes(includes)
      );
    },
  );
  if (stillStaleOutputs.length > 0) {
    throw new Error(
      `build for ${packageName} did not create required content: ${stillStaleOutputs
        .map(
          ({ path: outputRelPath, includes }) =>
            `${outputRelPath} missing ${includes}`,
        )
        .join(", ")}`,
    );
  }
}

const sharedTypeTargets = [
  "eliza/node_modules",
  "eliza/packages/app-core/node_modules",
  "eliza/packages/core/node_modules",
  "eliza/packages/ui/node_modules",
  "apps/app/node_modules",
  "apps/homepage/node_modules",
];

linkRootPackage("@biomejs", ["eliza/node_modules/@biomejs"]);

linkRootPackage("rollup", ["eliza/node_modules/rollup"]);
linkRootPackage("typescript", ["eliza/node_modules/typescript"]);
linkRootPackage("@rollup/plugin-node-resolve", [
  "eliza/node_modules/@rollup/plugin-node-resolve",
]);
linkRootPackage("llama-cpp-capacitor", [
  "eliza/node_modules/llama-cpp-capacitor",
]);

linkRootPackage("react", [
  "eliza/node_modules/react",
  "eliza/packages/app-core/node_modules/react",
  "eliza/packages/ui/node_modules/react",
  "apps/app/node_modules/react",
  "apps/homepage/node_modules/react",
]);

linkRootPackage("react-dom", [
  "eliza/node_modules/react-dom",
  "eliza/packages/app-core/node_modules/react-dom",
  "eliza/packages/ui/node_modules/react-dom",
  "apps/app/node_modules/react-dom",
  "apps/homepage/node_modules/react-dom",
]);

linkRootPackage(
  "@types/react",
  sharedTypeTargets.map((target) => `${target}/@types/react`),
);

linkRootPackage(
  "@types/react-dom",
  sharedTypeTargets.map((target) => `${target}/@types/react-dom`),
);

// bun-types is the real Bun declaration package (ffi, sqlite, etc.).
// @types/bun is a thin wrapper that references bun-types, so keep each alias
// pointed at its own installed package instead of cross-linking them.
linkRootPackage(
  "bun-types",
  sharedTypeTargets.map((target) => `${target}/bun-types`),
);

linkRootPackage(
  "@types/bun",
  sharedTypeTargets.map((target) => `${target}/@types/bun`),
);

linkRootPackage(
  "@types/node",
  sharedTypeTargets.map((target) => `${target}/@types/node`),
);

linkRootPackage("drizzle-orm", [
  "eliza/node_modules/drizzle-orm",
  "eliza/packages/app-core/node_modules/drizzle-orm",
  "eliza/plugins/plugin-sql/node_modules/drizzle-orm",
]);

linkLocalPackage("@elizaos/contracts", "eliza/packages/contracts", [
  "node_modules/@elizaos/contracts",
  "eliza/node_modules/@elizaos/contracts",
  "eliza/packages/core/node_modules/@elizaos/contracts",
  "eliza/packages/shared/node_modules/@elizaos/contracts",
]);

linkLocalPackage("@elizaos/core", "eliza/packages/core", [
  "node_modules/@elizaos/core",
  "eliza/node_modules/@elizaos/core",
  "eliza/packages/skills/node_modules/@elizaos/core",
  "apps/app/node_modules/@elizaos/core",
  "apps/homepage/node_modules/@elizaos/core",
]);

linkLocalPackage("@elizaos/skills", "eliza/packages/skills", [
  "node_modules/@elizaos/skills",
  "eliza/node_modules/@elizaos/skills",
  "eliza/packages/agent/node_modules/@elizaos/skills",
  "apps/app/node_modules/@elizaos/skills",
  "apps/homepage/node_modules/@elizaos/skills",
]);

linkLocalPackage("@elizaos/shared", "eliza/packages/shared", [
  "node_modules/@elizaos/shared",
  "eliza/node_modules/@elizaos/shared",
  "eliza/packages/agent/node_modules/@elizaos/shared",
  "apps/app/node_modules/@elizaos/shared",
  "apps/homepage/node_modules/@elizaos/shared",
]);

linkLocalPackage("@elizaos/ui", "eliza/packages/ui", [
  "node_modules/@elizaos/ui",
  "eliza/node_modules/@elizaos/ui",
  "eliza/packages/app-core/node_modules/@elizaos/ui",
  "apps/app/node_modules/@elizaos/ui",
  "apps/homepage/node_modules/@elizaos/ui",
]);

linkLocalPackage("@elizaos/agent", "eliza/packages/agent", [
  "node_modules/@elizaos/agent",
  "eliza/node_modules/@elizaos/agent",
  "eliza/plugins/plugin-app-manager/node_modules/@elizaos/agent",
  "apps/app/node_modules/@elizaos/agent",
  "apps/homepage/node_modules/@elizaos/agent",
]);

linkLocalPackage("@elizaos/app-core", "eliza/packages/app-core", [
  "node_modules/@elizaos/app-core",
  "eliza/node_modules/@elizaos/app-core",
  "eliza/packages/ui/node_modules/@elizaos/app-core",
  "apps/app/node_modules/@elizaos/app-core",
  "apps/homepage/node_modules/@elizaos/app-core",
]);

linkLocalPackage("@elizaos/cloud-routing", "eliza/packages/cloud-routing", [
  "node_modules/@elizaos/cloud-routing",
  "eliza/node_modules/@elizaos/cloud-routing",
  "eliza/packages/agent/node_modules/@elizaos/cloud-routing",
  "eliza/plugins/plugin-streaming/node_modules/@elizaos/cloud-routing",
]);

linkOptionalLocalPackage(
  "@elizaos/plugin-agent-skills",
  "eliza/plugins/plugin-agent-skills",
  [
    "node_modules/@elizaos/plugin-agent-skills",
    "eliza/node_modules/@elizaos/plugin-agent-skills",
    "eliza/packages/agent/node_modules/@elizaos/plugin-agent-skills",
  ],
);

linkOptionalLocalPackage(
  "@elizaos/plugin-browser-bridge",
  "eliza/plugins/plugin-browser-bridge",
  [
    "node_modules/@elizaos/plugin-browser-bridge",
    "eliza/node_modules/@elizaos/plugin-browser-bridge",
    "eliza/packages/agent/node_modules/@elizaos/plugin-browser-bridge",
  ],
);

linkOptionalLocalPackage("@elizaos/plugin-pdf", "eliza/plugins/plugin-pdf", [
  "node_modules/@elizaos/plugin-pdf",
  "eliza/node_modules/@elizaos/plugin-pdf",
  "eliza/packages/agent/node_modules/@elizaos/plugin-pdf",
]);

linkOptionalLocalPackage("@elizaos/plugin-sql", "eliza/plugins/plugin-sql", [
  "node_modules/@elizaos/plugin-sql",
  "eliza/node_modules/@elizaos/plugin-sql",
  "eliza/packages/agent/node_modules/@elizaos/plugin-sql",
  "eliza/packages/app-core/node_modules/@elizaos/plugin-sql",
]);

linkOptionalLocalPackage(
  "@elizaos/plugin-registry",
  "eliza/plugins/plugin-registry",
  [
    "node_modules/@elizaos/plugin-registry",
    "eliza/node_modules/@elizaos/plugin-registry",
    "eliza/packages/agent/node_modules/@elizaos/plugin-registry",
    "eliza/packages/app-core/node_modules/@elizaos/plugin-registry",
    "apps/app/node_modules/@elizaos/plugin-registry",
  ],
);

linkOptionalLocalPackage(
  "@elizaos/plugin-app-manager",
  "eliza/plugins/plugin-app-manager",
  [
    "node_modules/@elizaos/plugin-app-manager",
    "eliza/node_modules/@elizaos/plugin-app-manager",
    "eliza/packages/agent/node_modules/@elizaos/plugin-app-manager",
    "eliza/packages/app-core/node_modules/@elizaos/plugin-app-manager",
    "apps/app/node_modules/@elizaos/plugin-app-manager",
  ],
);

linkOptionalLocalPackage(
  "@elizaos/plugin-wallet",
  "eliza/plugins/plugin-wallet",
  [
    "node_modules/@elizaos/plugin-wallet",
    "eliza/node_modules/@elizaos/plugin-wallet",
    "eliza/packages/agent/node_modules/@elizaos/plugin-wallet",
  ],
);

const appNativePluginPackages = [
  ["@elizaos/capacitor-agent", "agent"],
  ["@elizaos/capacitor-appblocker", "appblocker"],
  ["@elizaos/capacitor-bun-runtime", "bun-runtime"],
  ["@elizaos/capacitor-calendar", "calendar"],
  ["@elizaos/capacitor-camera", "camera"],
  ["@elizaos/capacitor-canvas", "canvas"],
  ["@elizaos/capacitor-contacts", "contacts"],
  ["@elizaos/capacitor-desktop", "desktop"],
  ["@elizaos/capacitor-eliza-tasks", "eliza-tasks"],
  ["@elizaos/capacitor-gateway", "gateway"],
  ["@elizaos/capacitor-llama", "llama"],
  ["@elizaos/capacitor-location", "location"],
  ["@elizaos/capacitor-messages", "messages"],
  ["@elizaos/capacitor-mobile-agent-bridge", "mobile-agent-bridge"],
  ["@elizaos/capacitor-mobile-signals", "mobile-signals"],
  ["@elizaos/capacitor-network-policy", "network-policy"],
  ["@elizaos/capacitor-phone", "phone"],
  ["@elizaos/capacitor-screencapture", "screencapture"],
  ["@elizaos/capacitor-swabble", "swabble"],
  ["@elizaos/capacitor-system", "system"],
  ["@elizaos/capacitor-talkmode", "talkmode"],
  ["@elizaos/capacitor-websiteblocker", "websiteblocker"],
  ["@elizaos/capacitor-wifi", "wifi"],
  ["@elizaos/macosalarm", "macosalarm"],
  ["@elizaos/native-activity-tracker", "activity-tracker"],
  ["@elizaos/native-plugin-shared-types", "shared-types"],
];

const nativePluginPackages = new Map(appNativePluginPackages);
for (const [packageName, packageDir] of discoverNativePluginPackages()) {
  nativePluginPackages.set(packageName, packageDir);
}

const linkedNativePluginSources = [];
for (const [packageName, packageDir] of nativePluginPackages) {
  const sourceRelCandidates = [
    `eliza/plugins/plugin-native-${packageDir}`,
    `eliza/packages/native-plugins/${packageDir}`,
  ];
  const sourceRel = resolveFirstLocalPackageSource(
    packageName,
    sourceRelCandidates,
  );
  if (!sourceRel) {
    continue;
  }
  linkLocalPackage(
    packageName,
    sourceRel,
    [`node_modules/${packageName}`, `apps/app/node_modules/${packageName}`],
  );
  linkedNativePluginSources.push([packageName, sourceRel]);
}

linkOptionalLocalPackage(
  "@elizaos/plugin-streaming",
  "eliza/plugins/plugin-streaming",
  [
    "node_modules/@elizaos/plugin-streaming",
    "eliza/node_modules/@elizaos/plugin-streaming",
    "eliza/packages/agent/node_modules/@elizaos/plugin-streaming",
  ],
);

ensureBuiltLocalPackage("@elizaos/contracts", "eliza/packages/contracts", [
  "dist/index.js",
  "dist/index.d.ts",
]);

ensureBuiltLocalPackage("@elizaos/core", "eliza/packages/core", [
  "src/i18n/generated/validation-keyword-data.ts",
  "dist/index.node.js",
  "dist/index.d.ts",
]);

ensureBuiltLocalPackage(
  "@elizaos/shared",
  "eliza/packages/shared",
  ["dist/index.js", "dist/index.d.ts", "dist/utils/assistant-text.js"],
  {
    outputChecks: [
      { path: "dist/index.js", includes: "./utils/assistant-text.js" },
      { path: "dist/config/app-config.js", includes: "DEFAULT_APP_CONFIG" },
      {
        path: "dist/utils/assistant-text.js",
        includes: "extractAssistantReplyText",
      },
      {
        path: "dist/utils/assistant-text.d.ts",
        includes: "extractAssistantReplyText",
      },
    ],
  },
);

ensureBuiltLocalPackage(
  "@elizaos/ui",
  "eliza/packages/ui",
  [
    "dist/index.js",
    "dist/index.d.ts",
    "dist/onboarding/mobile-runtime-mode.js",
    "dist/onboarding/mobile-runtime-mode.d.ts",
  ],
  {
    outputChecks: [
      {
        path: "dist/onboarding/mobile-runtime-mode.js",
        includes: "isMobileLocalAgentIpcUrl",
      },
      {
        path: "dist/onboarding/mobile-runtime-mode.d.ts",
        includes: "isMobileLocalAgentIpcUrl",
      },
    ],
  },
);

ensureBuiltLocalPackage("@elizaos/app-core", "eliza/packages/app-core", [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/services/app-updates/update-policy.js",
  "dist/services/app-updates/update-policy.d.ts",
  "dist/platform/empty-node-module.js",
]);

ensureBuiltLocalPackage(
  "@elizaos/cloud-routing",
  "eliza/packages/cloud-routing",
  ["dist/index.js", "dist/index.d.ts"],
);

ensureBuiltLocalPackage(
  "@elizaos/plugin-agent-skills",
  "eliza/plugins/plugin-agent-skills",
  ["dist/index.js", "dist/index.d.ts"],
  {
    optional: true,
    outputChecks: [
      { path: "dist/index.js", includes: "discoverSkills" },
      { path: "dist/index.js", includes: "handleCuratedSkillsRoutes" },
      { path: "dist/index.js", includes: "handleSkillsRoutes" },
      { path: "dist/index.d.ts", includes: "discoverSkills" },
      { path: "dist/index.d.ts", includes: "handleCuratedSkillsRoutes" },
      { path: "dist/index.d.ts", includes: "handleSkillsRoutes" },
    ],
  },
);

ensureBuiltLocalPackage(
  "@elizaos/plugin-pdf",
  "eliza/plugins/plugin-pdf",
  ["dist/node/index.node.js", "dist/index.d.ts"],
  { optional: true },
);

ensureBuiltLocalPackage(
  "@elizaos/plugin-sql",
  "eliza/plugins/plugin-sql",
  ["src/dist/index.js", "src/dist/index.d.ts"],
  { optional: true },
);

ensureBuiltLocalPackage(
  "@elizaos/plugin-registry",
  "eliza/plugins/plugin-registry",
  ["dist/index.js", "dist/index.d.ts"],
  { optional: true },
);

ensureBuiltLocalPackage(
  "@elizaos/plugin-app-manager",
  "eliza/plugins/plugin-app-manager",
  ["dist/index.js"],
  { optional: true },
);

ensureBuiltLocalPackage(
  "@elizaos/plugin-wallet",
  "eliza/plugins/plugin-wallet",
  ["dist/index.mjs", "dist/index.d.ts", "dist/api/wallet-routes.d.ts"],
  {
    optional: true,
    outputChecks: [
      { path: "dist/index.mjs", includes: "handleWalletRoutes" },
      { path: "dist/index.d.ts", includes: "./api/wallet-routes.js" },
      { path: "dist/api/wallet-routes.d.ts", includes: "handleWalletRoutes" },
    ],
  },
);

ensureBuiltLocalPackage(
  "@elizaos/plugin-streaming",
  "eliza/plugins/plugin-streaming",
  ["dist/index.js", "dist/index.d.ts"],
  { optional: true },
);

for (const [packageName, sourceRel] of linkedNativePluginSources) {
  const outputRelPaths = packageExportOutputRelPaths(sourceRel);
  if (outputRelPaths.length === 0) {
    continue;
  }
  ensureBuiltLocalPackage(packageName, sourceRel, outputRelPaths, {
    optional: true,
  });
}
