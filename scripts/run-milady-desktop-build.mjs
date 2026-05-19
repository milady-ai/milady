#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const electrobunDir = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "platforms",
  "electrobun",
);
const [command = "build", ...args] = process.argv.slice(2);
const desktopEnv = {
  ...process.env,
  ELIZA_APP_NAME: process.env.ELIZA_APP_NAME || "Milady",
  ELIZA_APP_ID: process.env.ELIZA_APP_ID || "ai.milady.milady",
  ELIZA_URL_SCHEME: process.env.ELIZA_URL_SCHEME || "milady",
  ELIZA_NAMESPACE: process.env.ELIZA_NAMESPACE || "milady",
};

function fail(message, code = 1) {
  console.error(`[milady-desktop] ${message}`);
  process.exit(code);
}

function run(commandName, commandArgs, { cwd = repoRoot, label } = {}) {
  console.log(
    `[milady-desktop] ${label ?? [commandName, ...commandArgs].join(" ")}`,
  );
  const result = spawnSync(commandName, commandArgs, {
    cwd,
    env: desktopEnv,
    stdio: "inherit",
  });

  if (result.error) {
    fail(`${commandName} failed to start: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    fail(
      `${commandName} exited with code ${result.status ?? 1}`,
      result.status ?? 1,
    );
  }
}

function resolveBunExecutable() {
  const bunInstall = process.env.BUN_INSTALL?.trim();
  if (bunInstall) {
    const candidate = path.join(
      bunInstall,
      "bin",
      process.platform === "win32" ? "bun.exe" : "bun",
    );
    if (fs.existsSync(candidate)) return candidate;
  }

  if (process.platform === "win32") {
    const whereResult = spawnSync("where", ["bun"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    if (whereResult.status === 0 && whereResult.stdout) {
      const exePath = whereResult.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => /\.exe$/i.test(line) && fs.existsSync(line));
      if (exePath) return exePath;
    }
  }

  return "bun";
}

function runDesktopBuild(subcommand) {
  run(
    process.execPath,
    [
      "scripts/run-eliza-app-core-script.mjs",
      "desktop-build.mjs",
      subcommand,
      ...args,
    ],
    { label: `desktop-build ${subcommand}` },
  );
}

function applyLocalElizaPatches() {
  run(process.execPath, ["scripts/apply-eliza-ci-patches.mjs"], {
    label: "applying local eliza source patches",
  });
}

function publishAvatarAssets() {
  run(process.execPath, ["scripts/ensure-eliza-renderer-avatar-assets.mjs"], {
    label: "publishing renderer avatar assets",
  });
}

function findPackagedRuntimeRoots() {
  if (!fs.existsSync(electrobunDir)) {
    return [];
  }

  const roots = [];
  const searchRoots = ["build", "artifacts"].map((name) =>
    path.join(electrobunDir, name),
  );
  for (const searchRoot of searchRoots) {
    if (!fs.existsSync(searchRoot)) continue;
    const stack = [searchRoot];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (!entry.isDirectory()) continue;
        if (entry.name === "eliza-dist") {
          roots.push(fullPath);
          continue;
        }
        stack.push(fullPath);
      }
    }
  }
  return [...new Set(roots)];
}

function repairPackagedRuntimePayloads() {
  const runtimeSource = path.join(repoRoot, "eliza", "dist");
  const runtimeRoots = findPackagedRuntimeRoots();
  if (runtimeRoots.length === 0) {
    fail("No packaged eliza-dist runtime roots found after desktop package");
  }

  const payloads = [
    {
      relativePath: "node_modules",
      prunedDirs: [
        path.join("@elizaos", "core", "src"),
        path.join("@elizaos", "ui", "src"),
      ],
      requiredFiles: [
        path.join("@elizaos", "core", "dist", "node", "index.node.js"),
        path.join(
          "@elizaos",
          "app-core",
          "dist",
          "cli",
          "program",
          "register.capability-router.js",
        ),
        path.join(
          "@elizaos",
          "agent",
          "src",
          "services",
          "remote-capability-endpoint-provider.ts",
        ),
        path.join(
          "@elizaos",
          "agent",
          "src",
          "services",
          "remote-capability-endpoint-conformance.ts",
        ),
        path.join(
          "@elizaos",
          "agent",
          "src",
          "services",
          "remote-capability-url-endpoint-providers.ts",
        ),
        path.join("@elizaos", "ui", "dist", "index.js"),
        path.join(
          "@elizaos",
          "ui",
          "dist",
          "cloud-ui",
          "components",
          "docs",
          "index.js",
        ),
        path.join("@elizaos", "plugin-app-manager", "dist", "index.js"),
        path.join("@elizaos", "plugin-calendly", "dist", "index.js"),
        path.join("@elizaos", "plugin-companion", "dist", "index.js"),
        path.join("@elizaos", "plugin-discord", "dist", "index.js"),
        path.join("@elizaos", "plugin-google", "dist", "index.js"),
        path.join("@elizaos", "plugin-health", "dist", "index.js"),
        path.join(
          "@elizaos",
          "plugin-health",
          "dist",
          "health-bridge",
          "health-bridge.js",
        ),
        path.join("@elizaos", "plugin-lifeops", "dist", "index.js"),
        path.join("@elizaos", "plugin-registry", "dist", "index.js"),
        path.join("@elizaos", "plugin-wallet", "dist", "index.mjs"),
        path.join("@elizaos", "plugin-wallet-ui", "dist", "index.js"),
        path.join("googleapis", "build", "src", "apis", "docs", "v1.js"),
        path.join("three", "build", "three.webgpu.js"),
        path.join("three", "examples", "jsm", "loaders", "FBXLoader.js"),
        path.join("lucide-react", "package.json"),
        path.join("lucide-react", "dist", "esm", "lucide-react.mjs"),
        path.join("@lifi", "sdk", "package.json"),
      ],
      requiredText: [
        {
          file: path.join("@elizaos", "core", "dist", "node", "index.node.js"),
          text: "parseToonKeyValue",
        },
        {
          file: path.join(
            "@elizaos",
            "app-core",
            "dist",
            "cli",
            "program",
            "register.capability-router.js",
          ),
          text: "registerCapabilityRouterCommand",
        },
        {
          file: path.join(
            "@elizaos",
            "agent",
            "src",
            "services",
            "remote-capability-endpoint-provider.ts",
          ),
          text: "connectRemoteCapabilityEndpointProvider",
        },
        {
          file: path.join(
            "@elizaos",
            "agent",
            "src",
            "services",
            "remote-capability-endpoint-conformance.ts",
          ),
          text: "assertRemoteCapabilityEndpointConformance",
        },
        {
          file: path.join(
            "@elizaos",
            "agent",
            "src",
            "services",
            "remote-capability-url-endpoint-providers.ts",
          ),
          text: "homeMachineCapabilityEndpointProvider",
        },
        {
          file: path.join("@elizaos", "plugin-discord", "dist", "index.js"),
          text: "fetchDocumentFromUrl",
        },
        {
          file: path.join("@elizaos", "plugin-app-manager", "dist", "index.js"),
          text: "readAppRunStore",
        },
        {
          file: path.join("@elizaos", "plugin-calendly", "dist", "index.js"),
          text: "listCalendlyEventTypes",
        },
        {
          file: path.join(
            "@elizaos",
            "plugin-health",
            "dist",
            "health-bridge",
            "health-bridge.js",
          ),
          text: "detectHealthBackend",
        },
        {
          file: path.join("@elizaos", "plugin-wallet-ui", "dist", "index.js"),
          text: "BSC_GAS_READY_THRESHOLD",
        },
        {
          file: path.join("@elizaos", "plugin-wallet", "dist", "index.mjs"),
          text: "handleWalletRoutes",
        },
        {
          file: path.join("@elizaos", "plugin-registry", "dist", "index.js"),
          text: "handlePluginsCompatRoutes",
        },
      ],
      forbiddenText: [
        {
          file: path.join("@elizaos", "plugin-discord", "dist", "index.js"),
          text: "fetchKnowledgeFromUrl",
        },
      ],
    },
  ];

  for (const runtimeRoot of runtimeRoots) {
    for (const {
      relativePath,
      prunedDirs = [],
      requiredFiles,
      requiredText = [],
      forbiddenText = [],
    } of payloads) {
      const source = path.join(runtimeSource, relativePath);
      if (!fs.existsSync(source)) {
        fail(`Runtime payload source missing: ${source}`);
      }
      for (const requiredFile of requiredFiles) {
        const requiredPath = path.join(source, requiredFile);
        if (!fs.existsSync(requiredPath)) {
          fail(`Runtime payload source missing required file: ${requiredPath}`);
        }
      }
      for (const { file, text } of requiredText) {
        const filePath = path.join(source, file);
        if (!fs.existsSync(filePath)) {
          fail(`Runtime payload source missing required file: ${filePath}`);
        }
        const contents = fs.readFileSync(filePath, "utf8");
        if (!contents.includes(text)) {
          fail(
            `Runtime payload source ${filePath} missing expected text: ${text}`,
          );
        }
      }
      for (const { file, text } of forbiddenText) {
        const filePath = path.join(source, file);
        if (!fs.existsSync(filePath)) continue;
        const contents = fs.readFileSync(filePath, "utf8");
        if (contents.includes(text)) {
          fail(
            `Runtime payload source ${filePath} contains stale text: ${text}`,
          );
        }
      }

      const destination = path.join(runtimeRoot, relativePath);
      fs.rmSync(destination, { force: true, recursive: true });
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(source, destination, { dereference: true, recursive: true });
      for (const prunedDir of prunedDirs) {
        const prunedPath = path.join(destination, prunedDir);
        fs.rmSync(prunedPath, { force: true, recursive: true });
        if (fs.existsSync(prunedPath)) {
          fail(
            `Packaged runtime payload still contains pruned path: ${prunedPath}`,
          );
        }
      }
      console.log(
        `[milady-desktop] repaired packaged runtime payload: ${path.relative(repoRoot, destination)}`,
      );
    }
  }
}

function repairRuntimeEntry() {
  const distDir = path.join(repoRoot, "dist");
  const appCoreEntry = path.join(
    distDir,
    "node_modules",
    "@elizaos",
    "app-core",
    "dist",
    "entry.js",
  );
  if (!fs.existsSync(appCoreEntry)) {
    fail(`Packaged app-core entry not found: ${appCoreEntry}`);
  }

  const entrySource = [
    "// auto-generated by run-milady-desktop-build.mjs",
    "// Keep the packaged desktop runtime self-contained after dist is copied.",
    'import "./node_modules/@elizaos/app-core/dist/entry.js";',
    "",
  ].join("\n");

  fs.writeFileSync(path.join(distDir, "entry.js"), entrySource);
  fs.writeFileSync(path.join(distDir, "index.js"), entrySource);
}

function launchPackagedApp() {
  if (!fs.existsSync(electrobunDir)) {
    fail(`Electrobun directory not found: ${electrobunDir}`);
  }

  run(resolveBunExecutable(), ["x", "electrobun", "run"], {
    cwd: electrobunDir,
    label: "launching packaged Electrobun app",
  });
}

switch (command) {
  case "preflight":
    runDesktopBuild("preflight");
    break;
  case "stage":
    applyLocalElizaPatches();
    runDesktopBuild("stage");
    repairRuntimeEntry();
    publishAvatarAssets();
    break;
  case "package":
    applyLocalElizaPatches();
    repairRuntimeEntry();
    runDesktopBuild("package");
    repairPackagedRuntimePayloads();
    publishAvatarAssets();
    break;
  case "build":
    applyLocalElizaPatches();
    runDesktopBuild("stage");
    repairRuntimeEntry();
    publishAvatarAssets();
    runDesktopBuild("package");
    repairPackagedRuntimePayloads();
    publishAvatarAssets();
    break;
  case "run":
    applyLocalElizaPatches();
    runDesktopBuild("stage");
    repairRuntimeEntry();
    publishAvatarAssets();
    runDesktopBuild("package");
    repairPackagedRuntimePayloads();
    publishAvatarAssets();
    launchPackagedApp();
    break;
  default:
    fail(
      `Unknown command "${command}". Expected preflight, stage, package, build, or run.`,
    );
}
