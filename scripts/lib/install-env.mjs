import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const MIN_NODE_MAJOR = 22;
const MAX_NATIVE_PREBUILD_NODE_MAJOR = 24;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseMajor(version) {
  const match = String(version ?? "").match(/^v?(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeVersion(version) {
  return String(version ?? "")
    .trim()
    .replace(/^v/, "");
}

export function parseNodeProbeOutput(stdout) {
  const [resolvedExecutable, version] = String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!resolvedExecutable || !version) return null;
  return { executable: resolvedExecutable, version };
}

function probeNode(executable, env) {
  if (!executable) return null;
  const result = spawnSync(
    executable,
    ["-p", "process.execPath + '\\n' + process.version"],
    {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (result.status !== 0) return null;
  return parseNodeProbeOutput(result.stdout);
}

function probePython(executable, env) {
  if (!executable) return null;
  const result = spawnSync(executable, ["-c", "import plistlib"], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error?.code === "ENOENT") return null;
  return { executable, plistlib: result.status === 0 };
}

function readRequiredNodeVersion(rootDir) {
  try {
    return readFileSync(path.join(rootDir, ".nvmrc"), "utf8").trim();
  } catch {
    return "22.22.0";
  }
}

function nodeCandidatesForVersion(requiredVersion, env) {
  const home = env.HOME || env.USERPROFILE || "";
  const nvmDir = env.NVM_DIR || (home ? path.join(home, ".nvm") : "");
  const normalized = normalizeVersion(requiredVersion);
  return unique([
    env.MILADY_NODE_PATH,
    env.npm_config_node,
    nvmDir
      ? path.join(nvmDir, "versions", "node", `v${normalized}`, "bin", "node")
      : null,
    home
      ? path.join(
          home,
          ".nvm",
          "versions",
          "node",
          `v${normalized}`,
          "bin",
          "node",
        )
      : null,
    "/opt/homebrew/opt/node@22/bin/node",
    "/usr/local/opt/node@22/bin/node",
    process.execPath,
    "node",
  ]).filter((candidate) => candidate === "node" || existsSync(candidate));
}

function pythonCandidates(env) {
  return unique([
    env.PYTHON,
    env.npm_config_python,
    "/usr/bin/python3",
    "python3.13",
    "python3.12",
    "python3.11",
    "python3",
  ]);
}

export function selectNodeCandidate({
  requiredVersion,
  activeNode,
  candidates,
}) {
  const required = normalizeVersion(requiredVersion);
  const exact = candidates.find(
    (candidate) => normalizeVersion(candidate.version) === required,
  );
  if (exact) return exact;

  const activeMajor = parseMajor(activeNode?.version);
  if (
    activeNode &&
    activeMajor !== null &&
    activeMajor >= MIN_NODE_MAJOR &&
    activeMajor <= MAX_NATIVE_PREBUILD_NODE_MAJOR
  ) {
    return activeNode;
  }

  return null;
}

export function selectPythonCandidate(candidates) {
  return candidates.find((candidate) => candidate.plistlib) ?? null;
}

export function buildPathWithNodeBin(
  nodeExecutable,
  currentPath = "",
  delimiter = path.delimiter,
) {
  const nodeBin = path.dirname(nodeExecutable);
  const parts = currentPath.split(delimiter).filter(Boolean);
  return [nodeBin, ...parts.filter((part) => part !== nodeBin)].join(delimiter);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\"'\"'")}'`;
}

export function writeInstallLifecycleNodeShim({
  rootDir,
  nodeExecutable,
  pythonExecutable = null,
  platform = process.platform,
}) {
  const binDir = path.join(rootDir, "node_modules", ".bin");
  mkdirSync(binDir, { recursive: true });

  if (platform === "win32") {
    const shimPath = path.join(binDir, "node.cmd");
    const pythonLines = pythonExecutable
      ? [
          `if not defined PYTHON set "PYTHON=${pythonExecutable}"`,
          `if not defined npm_config_python set "npm_config_python=${pythonExecutable}"`,
        ]
      : [];
    writeFileSync(
      shimPath,
      ["@echo off", ...pythonLines, `"${nodeExecutable}" %*`, ""].join("\r\n"),
    );
    return shimPath;
  }

  const shimPath = path.join(binDir, "node");
  const pythonLines = pythonExecutable
    ? [
        `if [ -z "\${PYTHON:-}" ]; then export PYTHON=${shellQuote(pythonExecutable)}; fi`,
        `if [ -z "\${npm_config_python:-}" ]; then export npm_config_python=${shellQuote(pythonExecutable)}; fi`,
      ]
    : [];
  writeFileSync(
    shimPath,
    [
      "#!/bin/sh",
      ...pythonLines,
      `exec ${shellQuote(nodeExecutable)} "$@"`,
      "",
    ].join("\n"),
  );
  chmodSync(shimPath, 0o755);
  return shimPath;
}

export function shouldSkipInstallPreflight(env = process.env) {
  return (
    env.MILADY_INSTALL_SKIP_PREFLIGHT === "1" || env.GITHUB_ACTIONS === "true"
  );
}

function readinessResult(ok, code, base) {
  return { ok, code, ...base };
}

function getNodeReadinessCode(activeNode) {
  const activeMajor = parseMajor(activeNode?.version);
  if (!activeNode) return "missing-node";
  if (
    activeMajor === null ||
    activeMajor < MIN_NODE_MAJOR ||
    activeMajor > MAX_NATIVE_PREBUILD_NODE_MAJOR
  ) {
    return "unsupported-node";
  }
  return null;
}

function getPythonReadinessCode({
  configuredPython,
  defaultPython,
  fallbackPython,
}) {
  if (configuredPython && !configuredPython.plistlib) {
    return "broken-configured-python";
  }
  if (
    !configuredPython &&
    defaultPython &&
    !defaultPython.plistlib &&
    fallbackPython?.plistlib &&
    defaultPython.executable !== fallbackPython.executable
  ) {
    return "broken-path-python";
  }
  return null;
}

export function evaluateInstallReadiness({
  requiredVersion,
  activeNode,
  configuredPython = null,
  defaultPython = null,
  fallbackPython = null,
} = {}) {
  const required = normalizeVersion(requiredVersion);
  const base = {
    requiredVersion: required,
    activeNode: activeNode ?? null,
    configuredPython,
    defaultPython,
    fallbackPython,
  };
  const code =
    getNodeReadinessCode(activeNode) ??
    getPythonReadinessCode({
      configuredPython,
      defaultPython,
      fallbackPython,
    });

  return code
    ? readinessResult(false, code, base)
    : readinessResult(true, "ready", base);
}

export function formatInstallReadinessError(readiness) {
  if (readiness.ok) return "";

  const required = readiness.requiredVersion || "22.22.0";
  const python = readiness.fallbackPython?.executable ?? "/usr/bin/python3";
  const fixedInstall =
    `export PATH="$HOME/.nvm/versions/node/v${required}/bin:$PATH"; ` +
    `PYTHON=${python} npm_config_python=${python} bun install`;
  const lines = [];

  if (readiness.code === "missing-node") {
    lines.push("[milady-preinstall] No active Node.js executable was found.");
  }

  if (readiness.code === "unsupported-node") {
    lines.push(
      `[milady-preinstall] Active Node ${readiness.activeNode.version} via ${readiness.activeNode.executable} is not supported for Milady native install scripts.`,
    );
    lines.push(
      `[milady-preinstall] Use Node v${required} from .nvmrc, or another active Node major from ${MIN_NODE_MAJOR}-${MAX_NATIVE_PREBUILD_NODE_MAJOR}.`,
    );
  }

  if (readiness.code === "broken-configured-python") {
    lines.push(
      `[milady-preinstall] Configured Python ${readiness.configuredPython.executable} cannot import plistlib, which node-gyp needs on macOS.`,
    );
  }

  if (readiness.code === "broken-path-python") {
    lines.push(
      `[milady-preinstall] PATH python ${readiness.defaultPython.executable} cannot import plistlib, which node-gyp needs on macOS.`,
    );
  }

  lines.push("[milady-preinstall] Run: ./install --profile packages");
  lines.push(`[milady-preinstall] Or run: ${fixedInstall}`);
  return lines.join("\n");
}

function getConfiguredPython(baseEnv) {
  const executable = baseEnv.PYTHON || baseEnv.npm_config_python || null;
  if (!executable) return null;
  return (
    probePython(executable, baseEnv) ?? {
      executable,
      plistlib: false,
    }
  );
}

function getFallbackPythonChecks(configuredPython, baseEnv) {
  if (configuredPython) {
    return {
      defaultPython: null,
      fallbackPython: null,
    };
  }

  return {
    defaultPython: probePython("python3", baseEnv),
    fallbackPython: probePython("/usr/bin/python3", baseEnv),
  };
}

export function evaluateCurrentInstallEnvironment({
  rootDir,
  baseEnv = process.env,
} = {}) {
  const requiredVersion = readRequiredNodeVersion(rootDir ?? process.cwd());
  const activeNode = probeNode("node", baseEnv);
  const configuredPython = getConfiguredPython(baseEnv);
  const { defaultPython, fallbackPython } = getFallbackPythonChecks(
    configuredPython,
    baseEnv,
  );

  return evaluateInstallReadiness({
    requiredVersion,
    activeNode,
    configuredPython,
    defaultPython,
    fallbackPython,
  });
}

export function resolveInstallEnvironment({
  rootDir,
  baseEnv = process.env,
} = {}) {
  const requiredVersion = readRequiredNodeVersion(rootDir ?? process.cwd());
  const activeNode = probeNode("node", baseEnv);
  const candidates = nodeCandidatesForVersion(requiredVersion, baseEnv)
    .map((candidate) => probeNode(candidate, baseEnv))
    .filter(Boolean);
  const selectedNode = selectNodeCandidate({
    requiredVersion,
    activeNode,
    candidates,
  });
  const selectedPython = selectPythonCandidate(
    pythonCandidates(baseEnv)
      .map((candidate) => probePython(candidate, baseEnv))
      .filter(Boolean),
  );
  const env = { ...baseEnv };
  const diagnostics = [];

  if (selectedNode) {
    env.PATH = buildPathWithNodeBin(selectedNode.executable, env.PATH ?? "");
    env.MILADY_NODE_PATH = selectedNode.executable;
    env.npm_config_node = selectedNode.executable;
    diagnostics.push(
      `Node ${selectedNode.version} via ${selectedNode.executable}`,
    );
  } else {
    const active = activeNode
      ? `${activeNode.version} via ${activeNode.executable}`
      : "not found";
    return {
      ok: false,
      env,
      diagnostics,
      error: `Node ${requiredVersion} from .nvmrc was not found and active Node is unsupported for native install scripts (${active}). Install it with: nvm install ${requiredVersion}`,
    };
  }

  if (selectedPython) {
    env.PYTHON = selectedPython.executable;
    env.npm_config_python = selectedPython.executable;
    diagnostics.push(`Python for node-gyp via ${selectedPython.executable}`);
  }

  return {
    ok: true,
    env,
    diagnostics,
    error: null,
    node: selectedNode,
    python: selectedPython ?? null,
  };
}
