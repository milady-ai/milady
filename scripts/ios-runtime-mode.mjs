#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DEFAULT_ELIZA_CLOUD_BASE = "https://www.elizacloud.ai";

const VALID_MODES = new Set(["remote-mac", "cloud", "cloud-hybrid"]);

function readString(env, keys) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function apiBaseToDeviceBridgeUrl(apiBase) {
  const parsed = new URL(apiBase);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.pathname = "/api/local-inference/device-bridge";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export function resolveLanHost(networkInterfaces = os.networkInterfaces()) {
  for (const interfaces of Object.values(networkInterfaces)) {
    for (const iface of interfaces ?? []) {
      const family = iface.family;
      const isIpv4 = family === "IPv4" || family === 4;
      if (isIpv4 && !iface.internal && iface.address) {
        return iface.address;
      }
    }
  }
  throw new Error(
    "Could not find a LAN IPv4 address. Set MILADY_IOS_REMOTE_API_BASE explicitly.",
  );
}

function resolveCloudBase(env) {
  return stripTrailingSlash(
    readString(env, [
      "MILADY_IOS_CLOUD_BASE",
      "VITE_ELIZA_CLOUD_BASE",
      "VITE_MILADY_CLOUD_BASE",
      "VITE_CLOUD_BASE",
    ]) ?? DEFAULT_ELIZA_CLOUD_BASE,
  );
}

function resolveRemoteApiBase(env, networkInterfaces) {
  const explicit = readString(env, [
    "MILADY_IOS_REMOTE_API_BASE",
    "MILADY_IOS_API_BASE",
    "VITE_MILADY_IOS_API_BASE",
    "VITE_MILADY_MOBILE_API_BASE",
    "VITE_ELIZA_IOS_API_BASE",
  ]);
  if (explicit) return stripTrailingSlash(explicit);

  const port =
    readString(env, [
      "MILADY_IOS_REMOTE_API_PORT",
      "MILADY_API_PORT",
      "ELIZA_API_PORT",
    ]) ?? "31337";
  return `http://${resolveLanHost(networkInterfaces)}:${port}`;
}

export function buildModeEnv(
  mode,
  { env = process.env, networkInterfaces = os.networkInterfaces() } = {},
) {
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Unsupported iOS runtime mode: ${mode}`);
  }

  const next = {
    VITE_MILADY_IOS_RUNTIME_MODE: mode,
    VITE_ELIZA_CLOUD_BASE: resolveCloudBase(env),
  };

  if (mode === "remote-mac") {
    next.VITE_MILADY_IOS_API_BASE = resolveRemoteApiBase(
      env,
      networkInterfaces,
    );
    const token = readString(env, [
      "MILADY_IOS_REMOTE_API_TOKEN",
      "MILADY_IOS_API_TOKEN",
      "MILADY_API_TOKEN",
      "VITE_MILADY_IOS_API_TOKEN",
      "VITE_MILADY_MOBILE_API_TOKEN",
      "VITE_ELIZA_IOS_API_TOKEN",
    ]);
    if (token) next.VITE_MILADY_IOS_API_TOKEN = token;
    return next;
  }

  if (mode === "cloud") return next;

  const apiBase = readString(env, [
    "MILADY_IOS_API_BASE",
    "VITE_MILADY_IOS_API_BASE",
    "VITE_MILADY_MOBILE_API_BASE",
    "VITE_ELIZA_IOS_API_BASE",
  ]);
  if (apiBase) next.VITE_MILADY_IOS_API_BASE = stripTrailingSlash(apiBase);

  const explicitBridgeUrl = readString(env, [
    "MILADY_IOS_DEVICE_BRIDGE_URL",
    "VITE_MILADY_DEVICE_BRIDGE_URL",
    "VITE_ELIZA_DEVICE_BRIDGE_URL",
  ]);
  if (explicitBridgeUrl) {
    next.VITE_MILADY_DEVICE_BRIDGE_URL = explicitBridgeUrl;
  } else {
    const bridgeApiBase =
      readString(env, ["MILADY_IOS_DEVICE_BRIDGE_API_BASE"]) ?? apiBase;
    if (bridgeApiBase) {
      next.VITE_MILADY_DEVICE_BRIDGE_URL =
        apiBaseToDeviceBridgeUrl(bridgeApiBase);
    }
  }

  const pairingToken = readString(env, [
    "MILADY_IOS_DEVICE_BRIDGE_TOKEN",
    "ELIZA_DEVICE_PAIRING_TOKEN",
    "VITE_MILADY_DEVICE_BRIDGE_TOKEN",
    "VITE_ELIZA_DEVICE_BRIDGE_TOKEN",
  ]);
  if (pairingToken) next.VITE_MILADY_DEVICE_BRIDGE_TOKEN = pairingToken;

  return next;
}

function printSummary(mode, envPatch) {
  console.log(`[ios-runtime] mode: ${mode}`);
  console.log(`[ios-runtime] cloud: ${envPatch.VITE_ELIZA_CLOUD_BASE}`);
  if (envPatch.VITE_MILADY_IOS_API_BASE) {
    console.log(`[ios-runtime] api: ${envPatch.VITE_MILADY_IOS_API_BASE}`);
  }
  if (envPatch.VITE_MILADY_DEVICE_BRIDGE_URL) {
    console.log(
      `[ios-runtime] device bridge: ${envPatch.VITE_MILADY_DEVICE_BRIDGE_URL}`,
    );
  }
  if (
    envPatch.VITE_MILADY_IOS_API_TOKEN ||
    envPatch.VITE_MILADY_DEVICE_BRIDGE_TOKEN
  ) {
    console.log("[ios-runtime] token: configured");
  }
}

function usage() {
  console.error(
    "Usage: node scripts/ios-runtime-mode.mjs <remote-mac|cloud|cloud-hybrid> [--open]",
  );
}

export function runCli(argv = process.argv.slice(2)) {
  const mode = argv.find((arg) => !arg.startsWith("-"));
  const open = argv.includes("--open");
  if (!mode || !VALID_MODES.has(mode)) {
    usage();
    return 1;
  }

  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const envPatch = buildModeEnv(mode);
  printSummary(mode, envPatch);

  const build = spawnSync("bun", ["run", "build:ios"], {
    cwd: repoRoot,
    env: { ...process.env, ...envPatch },
    stdio: "inherit",
  });
  if (build.status !== 0) return build.status ?? 1;

  if (!open) return 0;

  const capOpen = spawnSync("bun", ["x", "capacitor", "open", "ios"], {
    cwd: path.join(repoRoot, "apps", "app"),
    env: { ...process.env, ...envPatch },
    stdio: "inherit",
  });
  return capOpen.status ?? 1;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exitCode = runCli();
}
