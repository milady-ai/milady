#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLocalElizaDisabled } from "./lib/eliza-package-mode.mjs";
import { resolveElizaAppCoreScript } from "./lib/resolve-eliza-app-core-script.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const MIN_NODE_MAJOR = 22;

function isCodexBundledNode(candidate) {
  return (
    process.platform === "darwin" &&
    (candidate ?? "")
      .replace(/\\/g, "/")
      .includes("/Applications/Codex.app/Contents/Resources/node")
  );
}

function validateNodeExecutable(candidate) {
  if (!candidate?.trim() || isCodexBundledNode(candidate)) {
    return false;
  }
  const probe = spawnSync(
    candidate,
    [
      "-e",
      "process.stdout.write(process.versions.bun ? 'bun' : 'node:' + (process.versions.node || ''))",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const version = /^node:(\d+)(?:\.|$)/.exec(probe.stdout?.trim() ?? "")?.[1];
  return (
    probe.status === 0 &&
    version !== undefined &&
    Number.parseInt(version, 10) >= MIN_NODE_MAJOR
  );
}

function resolveBuildExec() {
  const pathCandidates = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((dir) =>
      path.join(dir, process.platform === "win32" ? "node.exe" : "node"),
    );
  const candidates = [
    process.env.ELIZA_NODE_PATH,
    process.env.npm_node_execpath,
    process.execPath,
    ...pathCandidates,
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ];
  for (const candidate of candidates) {
    if (validateNodeExecutable(candidate)) {
      return candidate;
    }
  }
  const bun = spawnSync("bun", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (bun.status === 0) {
    return "bun";
  }
  throw new Error(
    `A standard Node.js ${MIN_NODE_MAJOR}+ binary or Bun is required for the production build. Install Node.js ${MIN_NODE_MAJOR}+ or set ELIZA_NODE_PATH=/absolute/path/to/node.`,
  );
}

const buildExec = resolveBuildExec();

function run(command, args, cwd = repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        MILADY_REPO_ROOT: process.env.MILADY_REPO_ROOT?.trim() || repoRoot,
      },
      stdio: "inherit",
      shell: false,
    });
    child.on("error", (error) => {
      reject(new Error(`${command} failed to start: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited due to signal ${signal}`));
        return;
      }
      if ((code ?? 1) !== 0) {
        reject(new Error(`${command} exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}

if (!isLocalElizaDisabled()) {
  await run(buildExec, [
    resolveElizaAppCoreScript("run-production-build.mjs", { repoRoot }),
    ...process.argv.slice(2),
  ]);
} else {
  const tsdownCli = require.resolve("tsdown/run");
  const vitePackageRoot = path.dirname(require.resolve("vite/package.json"));
  const viteCli = path.join(vitePackageRoot, "bin", "vite.js");

  await run(buildExec, ["scripts/ensure-elizaos-optional-app-stubs.mjs"]);
  await run(buildExec, ["scripts/patch-elizaos-package-styles.mjs"]);
  await run(buildExec, [
    "scripts/patch-elizaos-plugin-browser-bridge-package.mjs",
  ]);
  await run(buildExec, [
    tsdownCli,
    "--config-loader",
    "native",
    "--fail-on-warn",
    "false",
  ]);
  await run(buildExec, [
    "scripts/patch-elizaos-app-core-native-browser-package.mjs",
  ]);
  await run(buildExec, [viteCli, "build"], path.join(repoRoot, "apps/app"));
  await run("bun", ["scripts/write-build-info.ts"]);
}
