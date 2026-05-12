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

function resolveBunStorePackage(packageName) {
  const store = path.join(repoRoot, "node_modules", ".bun");
  if (!fs.existsSync(store)) {
    return null;
  }

  let best = null;
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

  return best?.packageDir ?? null;
}

function resolveInstalledPackage(packageName) {
  const direct = path.join(repoRoot, "node_modules", ...packageName.split("/"));
  if (fs.existsSync(direct)) {
    return direct;
  }

  const storePackage = resolveBunStorePackage(packageName);
  if (storePackage) {
    return storePackage;
  }

  return null;
}

function linkRootPackage(packageName, targets) {
  const source = resolveInstalledPackage(packageName);
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

function ensureBuiltLocalPackage(
  packageName,
  sourceRel,
  outputRelPaths,
  { optional = false } = {},
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
  if (missingOutputs.length === 0) {
    return;
  }

  console.log(
    `[align-eliza-ci-node-modules] building ${packageName}; missing ${missingOutputs.join(", ")}`,
  );
  const result = spawnSync("bun", ["run", "build"], {
    cwd: source,
    env: process.env,
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
  "@elizaos/plugin-streaming",
  "eliza/plugins/plugin-streaming",
  [
    "node_modules/@elizaos/plugin-streaming",
    "eliza/node_modules/@elizaos/plugin-streaming",
    "eliza/packages/agent/node_modules/@elizaos/plugin-streaming",
  ],
);

ensureBuiltLocalPackage("@elizaos/core", "eliza/packages/core", [
  "dist/index.node.js",
  "dist/index.d.ts",
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
  { optional: true },
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
  ["typescript/dist/index.js", "typescript/dist/index.d.ts"],
  { optional: true },
);

ensureBuiltLocalPackage(
  "@elizaos/plugin-streaming",
  "eliza/plugins/plugin-streaming",
  ["dist/index.js", "dist/index.d.ts"],
  { optional: true },
);
