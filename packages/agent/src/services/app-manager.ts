/**
 * App Manager — manages app lifecycle: discover, install plugin, show viewer.
 *
 * Apps are hosted services. The manager's job is:
 * 1. List/search apps from the registry
 * 2. Install the game's plugin onto the agent (triggers restart)
 * 3. Return the viewer URL so the UI can embed the game client in an iframe
 *
 * @module services/app-manager
 */

import crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import {
  generateWalletKeys,
  getWalletAddressesWithSteward,
} from "../api/wallet";
import {
  type AppLaunchDiagnostic,
  type AppLaunchResult,
  type AppRunCapabilityAvailability,
  type AppRunActionResult,
  type AppRunAwaySummary,
  type AppRunEvent,
  type AppRunSummary,
  type AppSessionState,
  type AppSessionJsonValue,
  type AppStopResult,
  type AppViewerAuthMessage,
  hasAppInterface,
  type InstalledAppInfo,
  packageNameToAppDisplayName,
  packageNameToAppRouteSlug,
} from "../contracts/apps";
import { importAppPlugin, importAppRouteModule } from "./app-package-modules";
import { readAppRunStore, writeAppRunStore } from "./app-run-store";
import type {
  InstallProgressLike,
  PluginManagerLike,
  RegistryPluginInfo,
  RegistrySearchResult,
} from "./plugin-manager-types";
import { getPluginInfo, getRegistryPlugins } from "./registry-client";
import { resolveAppOverride } from "./registry-client-app-meta";
import { scoreEntries, toSearchResults } from "./registry-client-queries.js";

const LOCAL_PLUGINS_DIR = "plugins";

export type {
  AppLaunchResult,
  AppRunActionResult,
  AppRunSummary,
  AppStopResult,
  AppViewerAuthMessage,
  InstalledAppInfo,
} from "../contracts/apps";

const DEFAULT_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";
const HYPERSCAPE_APP_ROUTE_SLUG = "hyperscape";
const HYPERSCAPE_AUTH_MESSAGE_TYPE = "HYPERSCAPE_AUTH";
const LOCAL_DEV_HYPERSCAPE_CLIENT_URL = "http://localhost:3333";
const PRODUCTION_HYPERSCAPE_CLIENT_URL = "https://hyperscape.gg";
const LOCAL_DEV_HYPERSCAPE_API_BASE_URL = "http://localhost:5555";
const PRODUCTION_HYPERSCAPE_API_BASE_URL = "https://hyperscape.gg";
const RS_2004SCAPE_APP_ROUTE_SLUG = "2004scape";
const RS_2004SCAPE_AUTH_MESSAGE_TYPE = "RS_2004SCAPE_AUTH";
const DEFAULT_RS_SDK_SERVER_URL = "https://rs-sdk-demo.fly.dev";
const BABYLON_APP_ROUTE_SLUG = "babylon";
const LOCAL_DEV_BABYLON_CLIENT_URL = "http://localhost:3000";
const PRODUCTION_BABYLON_CLIENT_URL = "https://staging.babylon.market";
const BABYLON_AGENT_SESSION_TOKEN_KEY = "BABYLON_AGENT_SESSION_TOKEN";
const BABYLON_AGENT_SESSION_EXPIRES_AT_KEY = "BABYLON_AGENT_SESSION_EXPIRES_AT";
const SAFE_APP_URL_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_APP_URL_TEMPLATE_KEYS = new Set([
  "BOT_NAME",
  "HYPERSCAPE_CHARACTER_ID",
  "HYPERSCAPE_CLIENT_URL",
  "BABYLON_CLIENT_URL",
  "RS_SDK_BOT_NAME",
  "RS_SDK_BOT_PASSWORD",
  "RS_SDK_SERVER_URL",
]);
const RUN_REFRESH_MIN_INTERVAL_MS = 5_000;
const MAX_RUN_EVENTS = 20;

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

type AppViewerConfig = NonNullable<AppLaunchResult["viewer"]>;

interface RegistryAppPlugin extends RegistryPluginInfo {
  viewer?: {
    url: string;
    embedParams?: Record<string, string>;
    postMessageAuth?: boolean;
    sandbox?: string;
  };
  launchType?: "connect" | "local";
  launchUrl?: string;
  displayName?: string;
  runtimePlugin?: string;
  session?: {
    mode: AppSessionState["mode"];
    features?: Array<
      "commands" | "telemetry" | "pause" | "resume" | "suggestions"
    >;
  };
}

interface ActiveAppSession {
  runId: string;
  appName: string;
  pluginName: string;
  launchType: string;
  launchUrl: string | null;
  viewerUrl: string | null;
  startedAt: string;
}

interface AppManagerOptions {
  stateDir?: string;
}

interface HyperscapeWalletCandidate {
  address: string;
  walletType: "evm" | "solana";
  source: string;
}

interface HyperscapeWalletAuthResponse {
  success?: boolean;
  authToken?: string;
  characterId?: string;
  accountId?: string;
  error?: string;
}

function isAppRegistryPlugin(
  plugin: RegistryPluginInfo,
): plugin is RegistryAppPlugin {
  return hasAppInterface(plugin);
}

function isHyperscapeAppName(appName: string): boolean {
  return packageNameToAppRouteSlug(appName) === HYPERSCAPE_APP_ROUTE_SLUG;
}

function is2004scapeAppName(appName: string): boolean {
  return packageNameToAppRouteSlug(appName) === RS_2004SCAPE_APP_ROUTE_SLUG;
}

function isBabylonAppName(appName: string): boolean {
  return packageNameToAppRouteSlug(appName) === BABYLON_APP_ROUTE_SLUG;
}

/**
 * Quick TCP-level probe to check if the 2004scape game server is reachable.
 * Returns true if a connection can be established within the timeout.
 */
async function is2004scapeServerReachable(
  serverUrl: string,
  timeoutMs = 2000,
): Promise<boolean> {
  try {
    const url = new URL(serverUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url.href, {
      method: "HEAD",
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timer);
    return res !== null;
  } catch {
    return false;
  }
}

function resolveDisplayViewerInfo(
  viewer: RegistryPluginInfo["viewer"],
): RegistryPluginInfo["viewer"] {
  if (!viewer) return viewer;

  const embedParams = viewer.embedParams
    ? Object.fromEntries(
        Object.entries(viewer.embedParams)
          .map(([key, value]) => [key, substituteTemplateVars(value).trim()])
          .filter(([, value]) => value.length > 0),
      )
    : undefined;

  return {
    ...viewer,
    url: substituteTemplateVars(viewer.url),
    embedParams,
  };
}

function flattenAppInfo<T extends RegistryPluginInfo>(appInfo: T): T {
  const meta = appInfo.appMeta;
  if (!meta) return appInfo;
  return {
    ...appInfo,
    displayName: meta.displayName ?? appInfo.displayName,
    launchType: meta.launchType ?? appInfo.launchType,
    launchUrl:
      substituteTemplateVars(meta.launchUrl ?? appInfo.launchUrl ?? "") || null,
    icon: meta.icon ?? appInfo.icon,
    category: meta.category ?? appInfo.category,
    capabilities: meta.capabilities ?? appInfo.capabilities,
    uiExtension: meta.uiExtension ?? appInfo.uiExtension,
    viewer: resolveDisplayViewerInfo(meta.viewer ?? appInfo.viewer),
    session: meta.session ?? appInfo.session,
  };
}

function resolvePluginPackageName(appInfo: RegistryPluginInfo): string {
  const npmPackage = appInfo.npm.package.trim();
  return npmPackage && npmPackage.length > 0 ? npmPackage : appInfo.name;
}

function mergeAppMeta(
  appInfo: RegistryPluginInfo,
  meta: RegistryPluginInfo["appMeta"],
): void {
  if (!meta) return;
  appInfo.viewer = meta.viewer ?? appInfo.viewer;
  appInfo.launchUrl = meta.launchUrl ?? appInfo.launchUrl;
  appInfo.launchType = meta.launchType ?? appInfo.launchType;
  appInfo.displayName = meta.displayName ?? appInfo.displayName;
  appInfo.category = meta.category ?? appInfo.category;
  appInfo.capabilities = meta.capabilities ?? appInfo.capabilities;
  appInfo.icon = meta.icon ?? appInfo.icon;
  appInfo.runtimePlugin = meta.runtimePlugin ?? appInfo.runtimePlugin;
  appInfo.session = meta.session ?? appInfo.session;
}

function mergeLocalRegistryInfo<T extends RegistryPluginInfo>(
  appInfo: T,
  localInfo: RegistryPluginInfo,
): T {
  appInfo.localPath = localInfo.localPath ?? appInfo.localPath;
  appInfo.kind = localInfo.kind ?? appInfo.kind;
  appInfo.appMeta = localInfo.appMeta ?? appInfo.appMeta;
  if (!appInfo.description && localInfo.description) {
    appInfo.description = localInfo.description;
  }
  if (!appInfo.homepage && localInfo.homepage) {
    appInfo.homepage = localInfo.homepage;
  }
  mergeAppMeta(appInfo, localInfo.appMeta);
  return appInfo;
}

function isAutoInstallable(appInfo: RegistryPluginInfo): boolean {
  const supportsRuntime =
    appInfo.supports.v0 || appInfo.supports.v1 || appInfo.supports.v2;
  const hasVersion = Boolean(
    appInfo.npm.v0Version || appInfo.npm.v1Version || appInfo.npm.v2Version,
  );
  return supportsRuntime && hasVersion;
}

/**
 * Check if a plugin exists locally in the plugins/ directory.
 * Local plugins don't need to be installed - they're already available.
 */
function isLocalPlugin(appInfo: RegistryPluginInfo): boolean {
  const pluginsDir = path.resolve(process.cwd(), LOCAL_PLUGINS_DIR);
  if (!fs.existsSync(pluginsDir)) {
    return false;
  }

  // Check for directory names that match the app
  // E.g., @elizaos/app-babylon -> app-babylon
  const bareName = appInfo.name.replace(/^@[^/]+\//, "");
  const possibleDirs = [bareName, appInfo.name.replace("/", "-")];

  for (const dirName of possibleDirs) {
    const pluginPath = path.join(pluginsDir, dirName);
    const pluginJsonPath = path.join(pluginPath, "elizaos.plugin.json");
    if (fs.existsSync(pluginJsonPath)) {
      return true;
    }
  }

  return false;
}

function getTemplateFallbackValue(key: string): string | undefined {
  if (key === "HYPERSCAPE_CLIENT_URL") {
    const runtimeClientUrl = process.env.HYPERSCAPE_CLIENT_URL?.trim();
    if (runtimeClientUrl && runtimeClientUrl.length > 0) {
      return runtimeClientUrl;
    }
    return isProductionRuntime()
      ? PRODUCTION_HYPERSCAPE_CLIENT_URL
      : LOCAL_DEV_HYPERSCAPE_CLIENT_URL;
  }
  if (key === "BABYLON_CLIENT_URL") {
    const runtimeClientUrl =
      process.env.BABYLON_CLIENT_URL?.trim() ??
      process.env.BABYLON_APP_URL?.trim() ??
      process.env.BABYLON_API_URL?.trim();
    if (runtimeClientUrl && runtimeClientUrl.length > 0) {
      return runtimeClientUrl;
    }
    return isProductionRuntime()
      ? PRODUCTION_BABYLON_CLIENT_URL
      : LOCAL_DEV_BABYLON_CLIENT_URL;
  }
  if (key === "RS_SDK_BOT_NAME") {
    const runtimeBotName = process.env.BOT_NAME?.trim();
    if (runtimeBotName && runtimeBotName.length > 0) {
      return runtimeBotName;
    }
    return "testbot";
  }
  if (key === "RS_SDK_SERVER_URL") {
    return DEFAULT_RS_SDK_SERVER_URL;
  }
  return undefined;
}

function resolveSettingLike(
  runtime: IAgentRuntime | null | undefined,
  key: string,
): string | undefined {
  const fromRuntime = runtime?.getSetting?.(key);
  if (typeof fromRuntime === "string" && fromRuntime.trim().length > 0) {
    return fromRuntime.trim();
  }
  const fromEnv = process.env[key];
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return undefined;
}

function isEvmAddress(value: string | null | undefined): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

function isLikelySolanaAddress(
  value: string | null | undefined,
): value is string {
  return (
    typeof value === "string" &&
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim())
  );
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function resolveHyperscapeApiBaseUrl(runtime?: IAgentRuntime | null): string {
  const runtimeUrl = resolveSettingLike(runtime, "HYPERSCAPE_API_URL");
  if (runtimeUrl) {
    return runtimeUrl.replace(/\/+$/, "");
  }
  return isProductionRuntime()
    ? PRODUCTION_HYPERSCAPE_API_BASE_URL
    : LOCAL_DEV_HYPERSCAPE_API_BASE_URL;
}

function resolve2004scapeServerUrl(runtime?: IAgentRuntime | null): string {
  const runtimeUrl = resolveSettingLike(runtime, "RS_SDK_SERVER_URL");
  if (runtimeUrl) {
    return runtimeUrl.replace(/\/+$/, "");
  }
  return DEFAULT_RS_SDK_SERVER_URL;
}

function extractWalletCandidateFromRecord(
  record: unknown,
): HyperscapeWalletCandidate | null {
  const objectRecord = readObject(record);
  if (!objectRecord) return null;

  const directWalletAddresses = readObject(objectRecord.walletAddresses);
  const characterRecord = readObject(objectRecord.character);
  const characterSettings = readObject(characterRecord?.settings);
  const characterWalletAddresses = readObject(characterRecord?.walletAddresses);
  const characterSecrets = readObject(characterSettings?.secrets);

  const evmAddressCandidates = [
    directWalletAddresses?.evm,
    objectRecord.walletAddress,
    characterWalletAddresses?.evm,
    characterRecord?.walletAddress,
    characterSettings?.evmAddress,
    characterSecrets?.EVM_PUBLIC_KEY,
  ];
  for (const candidate of evmAddressCandidates) {
    if (typeof candidate === "string" && isEvmAddress(candidate)) {
      return {
        address: candidate.trim(),
        walletType: "evm",
        source: "runtime-agent-record",
      };
    }
  }

  const solanaAddressCandidates = [
    directWalletAddresses?.solana,
    characterWalletAddresses?.solana,
    characterSettings?.solanaAddress,
    characterSecrets?.SOLANA_PUBLIC_KEY,
  ];
  for (const candidate of solanaAddressCandidates) {
    if (typeof candidate === "string" && isLikelySolanaAddress(candidate)) {
      return {
        address: candidate.trim(),
        walletType: "solana",
        source: "runtime-agent-record",
      };
    }
  }

  return null;
}

async function resolveRuntimeWalletCandidate(
  runtime: IAgentRuntime | null,
): Promise<HyperscapeWalletCandidate | null> {
  if (!runtime) return null;

  const runtimeLike = runtime as IAgentRuntime & {
    getAgent?: (agentId: IAgentRuntime["agentId"]) => Promise<unknown>;
  };
  if (typeof runtimeLike.getAgent === "function") {
    const agentRecord = await runtimeLike.getAgent(runtime.agentId);
    const candidate = extractWalletCandidateFromRecord(agentRecord);
    if (candidate) {
      return candidate;
    }
  }

  const characterRecord = runtime.character as unknown;
  const characterCandidate = extractWalletCandidateFromRecord({
    character: characterRecord,
  });
  if (characterCandidate) {
    return {
      ...characterCandidate,
      source: "runtime-character",
    };
  }

  const managedEvmAddress = resolveSettingLike(
    runtime,
    "ELIZA_MANAGED_EVM_ADDRESS",
  );
  if (isEvmAddress(managedEvmAddress)) {
    return {
      address: managedEvmAddress.trim(),
      walletType: "evm",
      source: "runtime-setting",
    };
  }

  const managedSolanaAddress = resolveSettingLike(
    runtime,
    "ELIZA_MANAGED_SOLANA_ADDRESS",
  );
  if (isLikelySolanaAddress(managedSolanaAddress)) {
    return {
      address: managedSolanaAddress.trim(),
      walletType: "solana",
      source: "runtime-setting",
    };
  }

  return null;
}

async function resolveHyperscapeWalletCandidate(
  runtime: IAgentRuntime | null,
): Promise<HyperscapeWalletCandidate | null> {
  const runtimeWallet = await resolveRuntimeWalletCandidate(runtime);
  if (runtimeWallet) {
    return runtimeWallet;
  }

  const walletAddresses = await getWalletAddressesWithSteward();
  if (isEvmAddress(walletAddresses.evmAddress)) {
    return {
      address: walletAddresses.evmAddress.trim(),
      walletType: "evm",
      source: "wallet-env",
    };
  }
  if (isLikelySolanaAddress(walletAddresses.solanaAddress)) {
    return {
      address: walletAddresses.solanaAddress.trim(),
      walletType: "solana",
      source: "wallet-env",
    };
  }

  return null;
}

function persistRuntimeSecret(
  runtime: IAgentRuntime | null,
  key: string,
  value: string,
): void {
  process.env[key] = value;
  if (!runtime) return;

  runtime.setSetting(key, value, true);

  const character = runtime.character as {
    settings?: { secrets?: Record<string, string> };
    secrets?: Record<string, string>;
  };
  if (!character.settings) {
    character.settings = {};
  }
  if (!character.settings.secrets) {
    character.settings.secrets = {};
  }
  character.settings.secrets[key] = value;
  if (!character.secrets) {
    character.secrets = {};
  }
  character.secrets[key] = value;
}

function provisionRuntimeWalletCandidate(
  runtime: IAgentRuntime | null,
): HyperscapeWalletCandidate | null {
  if (!runtime) {
    return null;
  }

  const keys = generateWalletKeys();
  persistRuntimeSecret(runtime, "EVM_PRIVATE_KEY", keys.evmPrivateKey);
  persistRuntimeSecret(runtime, "SOLANA_PRIVATE_KEY", keys.solanaPrivateKey);

  return {
    address: keys.evmAddress,
    walletType: "evm",
    source: "runtime-generated",
  };
}

function persistHyperscapeCredential(
  runtime: IAgentRuntime | null,
  key:
    | "HYPERSCAPE_AUTH_TOKEN"
    | "HYPERSCAPE_CHARACTER_ID"
    | "HYPERSCAPE_ACCOUNT_ID",
  value: string,
  secret = false,
): void {
  process.env[key] = value;
  if (!runtime) return;

  runtime.setSetting(key, value, secret);

  const character = runtime.character as {
    settings?: { secrets?: Record<string, string> };
    secrets?: Record<string, string>;
  };
  if (!character.settings) {
    character.settings = {};
  }
  if (!character.settings.secrets) {
    character.settings.secrets = {};
  }
  character.settings.secrets[key] = value;
  if (!character.secrets) {
    character.secrets = {};
  }
  character.secrets[key] = value;
}

async function authenticateHyperscapeWallet(
  runtime: IAgentRuntime,
  wallet: HyperscapeWalletCandidate,
): Promise<{
  authToken: string;
  characterId: string;
  accountId?: string;
}> {
  const url = new URL(
    "/api/agents/wallet-auth",
    resolveHyperscapeApiBaseUrl(runtime),
  );
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      walletAddress: wallet.address,
      walletType: wallet.walletType,
      agentName: runtime.character?.name || "Agent",
      agentId: runtime.agentId,
    }),
    signal: AbortSignal.timeout(1_500),
  });

  const text = await response.text();
  const data =
    text.trim().length > 0
      ? (JSON.parse(text) as HyperscapeWalletAuthResponse)
      : null;

  if (!response.ok) {
    const detail =
      data && typeof data.error === "string" && data.error.trim().length > 0
        ? data.error.trim()
        : text.trim();
    throw new Error(
      detail.length > 0
        ? `Hyperscape wallet auth failed (${response.status}): ${detail}`
        : `Hyperscape wallet auth failed with status ${response.status}`,
    );
  }

  if (!data?.success || !data.authToken || !data.characterId) {
    throw new Error("Hyperscape wallet auth returned an invalid response.");
  }

  return {
    authToken: data.authToken,
    characterId: data.characterId,
    ...(data.accountId ? { accountId: data.accountId } : {}),
  };
}

async function prepareHyperscapeLaunch(
  runtime: IAgentRuntime | null,
): Promise<AppLaunchDiagnostic[]> {
  if (!runtime) return [];

  const authToken = resolveSettingLike(runtime, "HYPERSCAPE_AUTH_TOKEN");
  const characterId = resolveSettingLike(runtime, "HYPERSCAPE_CHARACTER_ID");
  if (authToken && characterId) {
    return [];
  }

  const wallet =
    (await resolveHyperscapeWalletCandidate(runtime)) ??
    provisionRuntimeWalletCandidate(runtime);
  if (!wallet) {
    return [];
  }

  try {
    const result = await authenticateHyperscapeWallet(runtime, wallet);
    persistHyperscapeCredential(
      runtime,
      "HYPERSCAPE_AUTH_TOKEN",
      result.authToken,
      true,
    );
    persistHyperscapeCredential(
      runtime,
      "HYPERSCAPE_CHARACTER_ID",
      result.characterId,
    );
    if (result.accountId) {
      persistHyperscapeCredential(
        runtime,
        "HYPERSCAPE_ACCOUNT_ID",
        result.accountId,
      );
    }
    return [];
  } catch (error) {
    return [
      {
        code: "hyperscape-auth-provisioning-failed",
        severity: "warning",
        message:
          error instanceof Error
            ? error.message
            : "Hyperscape wallet auth failed.",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// 2004scape credential auto-provisioning
// ---------------------------------------------------------------------------

function persist2004scapeCredential(
  runtime: IAgentRuntime | null,
  key: "RS_SDK_BOT_NAME" | "RS_SDK_BOT_PASSWORD",
  value: string,
  secret = false,
): void {
  process.env[key] = value;
  if (!runtime) return;

  try {
    runtime.setSetting(key, value, secret);
  } catch (err) {
    logger.error(
      `[app-manager] Failed to persist 2004scape credential "${key}": ${err}`,
    );
  }

  const character = runtime.character as {
    settings?: { secrets?: Record<string, string> };
    secrets?: Record<string, string>;
  };
  if (!character.settings) {
    character.settings = {};
  }
  if (!character.settings.secrets) {
    character.settings.secrets = {};
  }
  character.settings.secrets[key] = value;
  if (!character.secrets) {
    character.secrets = {};
  }
  character.secrets[key] = value;
}

/**
 * Derive a 2004scape-safe username from the agent's display name.
 * Rules: lowercase alphanumeric only, max 12 chars.
 */
function derive2004scapeUsername(agentName: string): string {
  return (
    agentName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 12) || "agent"
  );
}

function generateRandomPassword(length = 16): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
async function prepare2004scapeLaunch(
  runtime: IAgentRuntime | null,
): Promise<AppLaunchDiagnostic[]> {
  if (!runtime) return [];

  const existingName = resolveSettingLike(runtime, "RS_SDK_BOT_NAME");
  const existingPassword = resolveSettingLike(runtime, "RS_SDK_BOT_PASSWORD");

  // Both present — nothing to do.
  if (existingName && existingPassword) {
    return [];
  }

  // One present but not the other — respect what the user set,
  // only fill in the missing half.
  const agentDisplayName = runtime.character?.name || "agent";
  const username = existingName || derive2004scapeUsername(agentDisplayName);
  const password = existingPassword || generateRandomPassword();

  if (!existingName) {
    persist2004scapeCredential(runtime, "RS_SDK_BOT_NAME", username);
  }
  if (!existingPassword) {
    persist2004scapeCredential(runtime, "RS_SDK_BOT_PASSWORD", password, true);
  }

  logger.info(
    `[app-manager] Auto-provisioned 2004scape credentials for "${username}"`,
  );

  return [];
}

// ---------------------------------------------------------------------------
// Babylon credential auto-provisioning
// ---------------------------------------------------------------------------

function persistBabylonCredential(
  runtime: IAgentRuntime | null,
  key: string,
  value: string,
  secret = false,
): void {
  process.env[key] = value;
  if (!runtime) return;

  try {
    runtime.setSetting(key, value, secret);
  } catch (err) {
    logger.error(
      `[app-manager] Failed to persist Babylon credential "${key}": ${err}`,
    );
  }

  const character = runtime.character as {
    settings?: { secrets?: Record<string, string> };
    secrets?: Record<string, string>;
  };
  if (!character.settings) {
    character.settings = {};
  }
  if (!character.settings.secrets) {
    character.settings.secrets = {};
  }
  character.settings.secrets[key] = value;
  if (!character.secrets) {
    character.secrets = {};
  }
  character.secrets[key] = value;
}

function resolveBabylonApiBaseUrl(runtime: IAgentRuntime | null): string {
  return (
    resolveSettingLike(runtime, "BABYLON_API_URL") ??
    resolveSettingLike(runtime, "BABYLON_APP_URL") ??
    resolveSettingLike(runtime, "BABYLON_CLIENT_URL") ??
    (isProductionRuntime()
      ? PRODUCTION_BABYLON_CLIENT_URL
      : LOCAL_DEV_BABYLON_CLIENT_URL)
  ).replace(/\/+$/, "");
}

/**
 * Probe Babylon for dev credentials. In development mode, Babylon generates
 * deterministic credentials from the server hostname. We can discover them
 * by calling the health/auth probe endpoints.
 */
async function probeBabylonDevCredentials(
  baseUrl: string,
): Promise<{ agentId: string; agentSecret: string } | null> {
  // Try well-known dev agent IDs with common dev secrets
  const devAgentIds = [
    "babylon-agent-alice",
    "babylon-test-agent",
    "dev-admin-local",
  ];
  // Dev secrets are deterministic from hostname — try multiple hostname sources
  const nodeCrypto = await import("node:crypto");
  const os = await import("node:os");
  const hostnames = new Set<string>();
  // Add all likely hostname sources
  hostnames.add("localhost");
  hostnames.add("0.0.0.0");
  if (process.env.HOSTNAME) hostnames.add(process.env.HOSTNAME);
  try {
    hostnames.add(os.hostname());
  } catch {
    /* ignore */
  }
  const devSecrets: string[] = [];
  for (const hostname of hostnames) {
    if (!hostname) continue;
    const hash = nodeCrypto
      .createHash("sha256")
      .update(`babylon-dev:${hostname}:agent`)
      .digest("hex")
      .substring(0, 32);
    devSecrets.push(`dev_agent_${hash}`);
  }

  for (const agentId of devAgentIds) {
    for (const agentSecret of devSecrets) {
      try {
        const response = await fetch(new URL("/api/agents/auth", baseUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, agentSecret }),
          signal: AbortSignal.timeout(3_000),
        });
        if (response.ok) {
          const data = (await response.json()) as {
            success?: boolean;
            sessionToken?: string;
          };
          if (data.success || data.sessionToken) {
            logger.info(
              `[app-manager] Babylon dev credentials discovered (agentId=${agentId})`,
            );
            return { agentId, agentSecret };
          }
        }
      } catch {
        // Connection failed — Babylon not reachable
        return null;
      }
    }
  }
  return null;
}

async function authenticateBabylonAgentSession(
  baseUrl: string,
  agentId: string,
  agentSecret: string,
): Promise<{ sessionToken: string; expiresAt?: string } | null> {
  const response = await fetch(new URL("/api/agents/auth", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId,
      agentSecret,
    }),
    signal: AbortSignal.timeout(3_000),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    success?: boolean;
    sessionToken?: string;
    expiresAt?: string;
  };
  if (!data.sessionToken) {
    return null;
  }

  return {
    sessionToken: data.sessionToken,
    expiresAt:
      typeof data.expiresAt === "string" && data.expiresAt.trim().length > 0
        ? data.expiresAt
        : undefined,
  };
}

/**
 * Auto-provision Babylon credentials on app launch.
 *
 * Flow:
 * 1. If BABYLON_AGENT_ID + BABYLON_AGENT_SECRET are already set, skip.
 * 2. In dev mode: probe Babylon for dev credentials and auto-configure.
 * 3. In production: warn the user to set credentials manually.
 */
async function prepareBabylonLaunch(
  runtime: IAgentRuntime | null,
): Promise<AppLaunchDiagnostic[]> {
  const existingId =
    resolveSettingLike(runtime, "BABYLON_AGENT_ID") ??
    process.env.BABYLON_AGENT_ID?.trim();
  const existingSecret =
    resolveSettingLike(runtime, "BABYLON_AGENT_SECRET") ??
    process.env.BABYLON_AGENT_SECRET?.trim();

  // Already configured — nothing to do
  if (existingId && existingSecret) {
    // Verify the credentials work by attempting auth
    const baseUrl = resolveBabylonApiBaseUrl(runtime);
    try {
      const session = await authenticateBabylonAgentSession(
        baseUrl,
        existingId,
        existingSecret,
      );
      if (session) {
        persistBabylonCredential(
          runtime,
          BABYLON_AGENT_SESSION_TOKEN_KEY,
          session.sessionToken,
          true,
        );
        if (session.expiresAt) {
          persistBabylonCredential(
            runtime,
            BABYLON_AGENT_SESSION_EXPIRES_AT_KEY,
            session.expiresAt,
            true,
          );
        }
        logger.info(
          `[app-manager] Babylon credentials verified (agentId=${existingId})`,
        );
        return [];
      }
      return [
        {
          code: "babylon-auth-failed",
          severity: "warning",
          message:
            "Babylon credentials are set but authentication failed. Check BABYLON_AGENT_ID and BABYLON_AGENT_SECRET.",
        },
      ];
    } catch {
      return [
        {
          code: "babylon-unreachable",
          severity: "warning",
          message: `Cannot reach Babylon at ${baseUrl}. Is the server running?`,
        },
      ];
    }
  }

  // No credentials — try auto-provisioning in dev mode
  if (!isProductionRuntime()) {
    const baseUrl = resolveBabylonApiBaseUrl(runtime);

    // First check if Babylon is even reachable
    try {
      await fetch(new URL("/api/health", baseUrl), {
        signal: AbortSignal.timeout(3_000),
      });
    } catch {
      return [
        {
          code: "babylon-unreachable",
          severity: "warning",
          message: `Cannot reach Babylon at ${baseUrl}. Start the Babylon dev server and re-launch.`,
        },
      ];
    }

    // Try dev credentials
    const devCreds = await probeBabylonDevCredentials(baseUrl);
    if (devCreds) {
      persistBabylonCredential(runtime, "BABYLON_AGENT_ID", devCreds.agentId);
      persistBabylonCredential(
        runtime,
        "BABYLON_AGENT_SECRET",
        devCreds.agentSecret,
        true,
      );
      const session = await authenticateBabylonAgentSession(
        baseUrl,
        devCreds.agentId,
        devCreds.agentSecret,
      );
      if (session) {
        persistBabylonCredential(
          runtime,
          BABYLON_AGENT_SESSION_TOKEN_KEY,
          session.sessionToken,
          true,
        );
        if (session.expiresAt) {
          persistBabylonCredential(
            runtime,
            BABYLON_AGENT_SESSION_EXPIRES_AT_KEY,
            session.expiresAt,
            true,
          );
        }
      }
      logger.info(
        `[app-manager] Auto-provisioned Babylon dev credentials (agentId=${devCreds.agentId})`,
      );
      return [];
    }

    return [
      {
        code: "babylon-no-agent-id",
        severity: "warning",
        message:
          "Could not auto-provision Babylon credentials. Set BABYLON_AGENT_ID and BABYLON_AGENT_SECRET in your environment.",
      },
    ];
  }

  // Production without credentials
  return [
    {
      code: "babylon-no-agent-id",
      severity: "warning",
      message:
        "BABYLON_AGENT_ID is not set. Set BABYLON_AGENT_ID and BABYLON_AGENT_SECRET for full Babylon integration.",
    },
  ];
}

function substituteTemplateVars(raw: string): string {
  return raw.replace(/\{([A-Z0-9_]+)\}/g, (_full, key: string) => {
    if (!ALLOWED_APP_URL_TEMPLATE_KEYS.has(key)) {
      return getTemplateFallbackValue(key) ?? "";
    }

    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
    return getTemplateFallbackValue(key) ?? "";
  });
}

function buildViewerUrl(
  baseUrl: string,
  embedParams?: Record<string, string>,
): string {
  if (!embedParams || Object.keys(embedParams).length === 0) {
    return substituteTemplateVars(baseUrl);
  }
  const resolvedBaseUrl = substituteTemplateVars(baseUrl);
  const [beforeHash, hashPartRaw] = resolvedBaseUrl.split("#", 2);
  const [pathPart, queryPartRaw] = beforeHash.split("?", 2);
  const queryParams = new URLSearchParams(queryPartRaw ?? "");
  for (const [key, rawValue] of Object.entries(embedParams)) {
    const nextValue = substituteTemplateVars(rawValue).trim();
    if (!nextValue) {
      queryParams.delete(key);
      continue;
    }
    queryParams.set(key, nextValue);
  }
  const query = queryParams.toString();
  const hash = hashPartRaw ? `#${hashPartRaw}` : "";
  return `${pathPart}${query.length > 0 ? `?${query}` : ""}${hash}`;
}

function resolveViewerEmbedParams(
  embedParams?: Record<string, string>,
): Record<string, string> | undefined {
  if (!embedParams) return undefined;
  const resolved = Object.fromEntries(
    Object.entries(embedParams)
      .map(([key, value]) => [key, substituteTemplateVars(value).trim()])
      .filter(([, value]) => value.length > 0),
  );
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

function normalizeSafeAppUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/")) {
    // Disallow protocol-relative form (`//evil.test`) which escapes same-origin.
    return trimmed.startsWith("//") ? null : trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (!SAFE_APP_URL_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

function buildViewerAuthMessage(
  appName: string,
  postMessageAuth: boolean | undefined,
  runtime?: IAgentRuntime | null,
): AppViewerAuthMessage | undefined {
  if (!postMessageAuth) return undefined;

  if (isHyperscapeAppName(appName)) {
    const authToken = resolveSettingLike(runtime, "HYPERSCAPE_AUTH_TOKEN");
    if (!authToken) {
      return undefined;
    }
    const characterId = resolveSettingLike(runtime, "HYPERSCAPE_CHARACTER_ID");
    const agentId =
      typeof runtime?.agentId === "string" && runtime.agentId.trim().length > 0
        ? runtime.agentId
        : undefined;

    return {
      type: HYPERSCAPE_AUTH_MESSAGE_TYPE,
      authToken,
      agentId,
      characterId,
      followEntity: characterId,
    };
  }

  // Babylon auth — passes agent credentials to the viewer iframe
  if (isBabylonAppName(appName)) {
    const agentId =
      resolveSettingLike(runtime, "BABYLON_AGENT_ID") ??
      process.env.BABYLON_AGENT_ID?.trim();
    const sessionToken =
      resolveSettingLike(runtime, BABYLON_AGENT_SESSION_TOKEN_KEY) ??
      process.env[BABYLON_AGENT_SESSION_TOKEN_KEY]?.trim();
    if (!agentId || !sessionToken) {
      return undefined;
    }
    return {
      type: "BABYLON_AUTH",
      authToken: sessionToken,
      sessionToken,
      agentId,
      characterId: agentId,
    };
  }

  // 2004scape auth - uses auto-provisioned or user-supplied credentials
  if (is2004scapeAppName(appName)) {
    const username =
      resolveSettingLike(runtime, "RS_SDK_BOT_NAME") ||
      process.env.BOT_NAME?.trim() ||
      "testbot";
    const password =
      resolveSettingLike(runtime, "RS_SDK_BOT_PASSWORD") ||
      process.env.BOT_PASSWORD?.trim() ||
      "";

    if (!password) {
      logger.warn(
        "[app-manager] 2004scape credentials incomplete — no password set. " +
          "Launch the app to auto-provision credentials.",
      );
    }

    return {
      type: RS_2004SCAPE_AUTH_MESSAGE_TYPE,
      authToken: username,
      sessionToken: password,
    };
  }

  return undefined;
}

function buildViewerConfig(
  appInfo: RegistryAppPlugin,
  launchUrl: string | null,
  runtime?: IAgentRuntime | null,
): AppViewerConfig | null {
  const viewerInfo = appInfo.viewer;
  if (viewerInfo) {
    const requestedPostMessageAuth = Boolean(viewerInfo.postMessageAuth);
    const authMessage = buildViewerAuthMessage(
      appInfo.name,
      requestedPostMessageAuth,
      runtime,
    );
    const postMessageAuth = requestedPostMessageAuth && Boolean(authMessage);
    if (requestedPostMessageAuth && !authMessage) {
      logger.warn(
        `[app-manager] ${appInfo.name} requires postMessage auth but no auth payload was generated.`,
      );
    }
    const resolvedEmbedParams = {
      ...(resolveViewerEmbedParams(viewerInfo.embedParams) ?? {}),
    };
    if (
      isHyperscapeAppName(appInfo.name) &&
      authMessage?.followEntity &&
      !resolvedEmbedParams.followEntity
    ) {
      resolvedEmbedParams.followEntity = authMessage.followEntity;
    }
    const finalEmbedParams =
      Object.keys(resolvedEmbedParams).length > 0
        ? resolvedEmbedParams
        : undefined;
    const viewerUrl = normalizeSafeAppUrl(
      buildViewerUrl(viewerInfo.url, finalEmbedParams),
    );
    if (!viewerUrl) {
      throw new Error(
        `Refusing to launch app "${appInfo.name}": unsafe viewer URL`,
      );
    }

    return {
      url: viewerUrl,
      embedParams: finalEmbedParams,
      postMessageAuth,
      sandbox: viewerInfo.sandbox ?? DEFAULT_VIEWER_SANDBOX,
      authMessage,
    };
  }
  if (
    (appInfo.launchType === "connect" || appInfo.launchType === "local") &&
    launchUrl
  ) {
    const viewerUrl = normalizeSafeAppUrl(launchUrl);
    if (!viewerUrl) {
      throw new Error(
        `Refusing to launch app "${appInfo.name}": unsafe launch URL`,
      );
    }
    return {
      url: viewerUrl,
      sandbox: DEFAULT_VIEWER_SANDBOX,
    };
  }
  return null;
}

function buildAppSession(
  appInfo: RegistryAppPlugin,
  authMessage: AppViewerAuthMessage | undefined,
  runtime?: IAgentRuntime | null,
): AppSessionState | null {
  if (!appInfo.session) return null;

  const runtimeAgentId =
    typeof runtime?.agentId === "string" && runtime.agentId.trim().length > 0
      ? runtime.agentId
      : undefined;
  const sessionId =
    authMessage?.agentId ||
    runtimeAgentId ||
    authMessage?.characterId ||
    resolveSettingLike(runtime, "HYPERSCAPE_CHARACTER_ID");
  if (!sessionId) return null;
  const features = new Set(appInfo.session.features ?? []);
  const controls: AppSessionState["controls"] = [];
  if (features.has("pause")) {
    controls.push("pause");
  }
  if (features.has("resume")) {
    controls.push("resume");
  }
  const canSendCommands =
    features.has("commands") || features.has("suggestions");
  const summary = isBabylonAppName(appInfo.name)
    ? "Connecting to Babylon..."
    : "Connecting session...";

  return {
    sessionId,
    appName: appInfo.name,
    mode: appInfo.session.mode,
    status: "connecting",
    displayName: appInfo.displayName ?? appInfo.name,
    agentId: authMessage?.agentId ?? runtimeAgentId,
    characterId:
      authMessage?.characterId ??
      resolveSettingLike(runtime, "HYPERSCAPE_CHARACTER_ID"),
    followEntity:
      authMessage?.followEntity ?? authMessage?.characterId ?? undefined,
    canSendCommands,
    controls,
    summary,
  };
}

function buildUnavailableSession(
  run: AppRunSummary,
  status: "disconnected" | "offline",
  summary: string,
): AppSessionState | null {
  if (!run.session) return null;
  return {
    ...run.session,
    status,
    canSendCommands: false,
    controls: [],
    goalLabel: null,
    suggestedPrompts: [],
    telemetry: null,
    summary,
  };
}

async function resolveLaunchSession(
  appInfo: RegistryAppPlugin,
  viewer: AppLaunchResult["viewer"] | null,
  launchUrl: string | null,
  runtime: IAgentRuntime | null,
): Promise<AppSessionState | null> {
  const routeModule = await importAppRouteModule(appInfo.name);
  if (typeof routeModule?.resolveLaunchSession === "function") {
    return routeModule.resolveLaunchSession({
      appName: appInfo.name,
      launchUrl,
      runtime,
      viewer,
    });
  }

  return buildAppSession(appInfo, viewer?.authMessage, runtime);
}

function isRuntimePluginActive(
  appInfo: RegistryAppPlugin,
  runtime: IAgentRuntime | null,
): boolean {
  if (!runtime || !Array.isArray(runtime.plugins)) {
    return false;
  }

  const pluginNames = new Set<string>([
    appInfo.name,
    appInfo.runtimePlugin ?? resolvePluginPackageName(appInfo),
  ]);
  return runtime.plugins.some(
    (plugin) =>
      typeof plugin?.name === "string" && pluginNames.has(plugin.name),
  );
}

function hasRuntimeService(
  runtime: IAgentRuntime | null,
  serviceType: string,
): boolean {
  const runtimeLike = runtime as IAgentRuntime & {
    hasService?: (candidate: string) => boolean;
  };
  return (
    typeof runtimeLike?.hasService === "function" &&
    runtimeLike.hasService(serviceType)
  );
}

function isRuntimePluginReady(
  appInfo: RegistryAppPlugin,
  runtime: IAgentRuntime | null,
): boolean {
  if (isHyperscapeAppName(appInfo.name)) {
    return hasRuntimeService(runtime, "hyperscapeService");
  }
  return isRuntimePluginActive(appInfo, runtime);
}

function getRuntimePluginCandidates(appInfo: RegistryAppPlugin): string[] {
  const candidates = [
    appInfo.runtimePlugin,
    appInfo.name,
    resolvePluginPackageName(appInfo),
  ];
  return Array.from(
    new Set(
      candidates.filter(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.trim().length > 0,
      ),
    ),
  );
}

function collectHyperscapeLaunchDiagnostics(
  appInfo: RegistryAppPlugin,
  viewer: AppViewerConfig | null,
  session: AppSessionState | null,
  runtime: IAgentRuntime | null,
): AppLaunchDiagnostic[] {
  if (!isHyperscapeAppName(appInfo.name)) {
    return [];
  }

  const diagnostics: AppLaunchDiagnostic[] = [];
  const authToken = resolveSettingLike(runtime, "HYPERSCAPE_AUTH_TOKEN");
  const characterId = resolveSettingLike(runtime, "HYPERSCAPE_CHARACTER_ID");
  const requestedIframeAuth = Boolean(appInfo.viewer?.postMessageAuth);

  if (requestedIframeAuth && !viewer?.authMessage) {
    const missing: string[] = [];
    if (!authToken) missing.push("HYPERSCAPE_AUTH_TOKEN");
    if (!characterId) missing.push("HYPERSCAPE_CHARACTER_ID");
    diagnostics.push({
      code: "hyperscape-auth-unavailable",
      severity: "error",
      message:
        missing.length > 0
          ? `Hyperscape auto-sign-in is unavailable because ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not configured for this agent.`
          : "Hyperscape auto-sign-in is unavailable for this agent.",
    });
  }

  if (runtime && !session && !isRuntimePluginReady(appInfo, runtime)) {
    diagnostics.push({
      code: "hyperscape-runtime-bridge-inactive",
      severity: "warning",
      message:
        "The Hyperscape runtime bridge is not active in this agent, so Milady cannot attach to a live in-world session yet.",
    });
  }

  if (runtime && !session && characterId) {
    diagnostics.push({
      code: "hyperscape-session-not-found",
      severity: "warning",
      message:
        "No live Hyperscape session matched this agent. Start or reconnect the Hyperscape agent in-world, then launch again.",
    });
  }

  return diagnostics;
}

function collect2004scapeLaunchDiagnostics(
  appInfo: RegistryAppPlugin,
  viewer: AppViewerConfig | null,
  _session: AppSessionState | null,
  runtime: IAgentRuntime | null,
): AppLaunchDiagnostic[] {
  if (!is2004scapeAppName(appInfo.name)) {
    return [];
  }

  const diagnostics: AppLaunchDiagnostic[] = [];
  const botName = resolveSettingLike(runtime, "RS_SDK_BOT_NAME");
  const botPassword = resolveSettingLike(runtime, "RS_SDK_BOT_PASSWORD");

  if (!botName || !botPassword) {
    diagnostics.push({
      code: "2004scape-credentials-missing",
      severity: "warning",
      message:
        "2004scape bot credentials could not be generated. The viewer will load without auto-login.",
    });
  }

  if (viewer?.postMessageAuth && !viewer.authMessage) {
    diagnostics.push({
      code: "2004scape-auth-unavailable",
      severity: "error",
      message:
        "2004scape auto-sign-in requires RS_SDK_BOT_NAME and RS_SDK_BOT_PASSWORD to be configured.",
    });
  }

  return diagnostics;
}

function collectLaunchDiagnostics(
  appInfo: RegistryAppPlugin,
  viewer: AppViewerConfig | null,
  session: AppSessionState | null,
  runtime: IAgentRuntime | null,
): AppLaunchDiagnostic[] {
  if (isHyperscapeAppName(appInfo.name)) {
    return collectHyperscapeLaunchDiagnostics(
      appInfo,
      viewer,
      session,
      runtime,
    );
  }
  if (is2004scapeAppName(appInfo.name)) {
    return collect2004scapeLaunchDiagnostics(appInfo, viewer, session, runtime);
  }
  return [];
}

async function ensureRuntimePluginRegistered(
  appInfo: RegistryAppPlugin,
  runtime: IAgentRuntime | null,
  isLocal: boolean,
): Promise<boolean> {
  if (!runtime) {
    return false;
  }

  if (isRuntimePluginReady(appInfo, runtime)) {
    return true;
  }

  const pluginNames = getRuntimePluginCandidates(appInfo);
  for (const pluginPackageName of pluginNames) {
    const plugin = await importAppPlugin(pluginPackageName);
    if (!plugin) {
      continue;
    }

    await runtime.registerPlugin(plugin);
    if (isRuntimePluginReady(appInfo, runtime)) {
      return true;
    }
  }

  if (!isLocal) {
    return false;
  }

  throw new Error(
    `Local runtime plugin for "${appInfo.name}" could not be loaded.`,
  );
}

async function ensureHyperscapeServiceLoaded(
  appInfo: RegistryAppPlugin,
  runtime: IAgentRuntime | null,
): Promise<void> {
  if (!runtime || !isHyperscapeAppName(appInfo.name)) {
    return;
  }

  const runtimeLike = runtime as IAgentRuntime & {
    hasService?: (serviceType: string) => boolean;
    getServiceLoadPromise?: (serviceType: string) => Promise<unknown>;
  };

  if (
    typeof runtimeLike.hasService !== "function" ||
    !runtimeLike.hasService("hyperscapeService")
  ) {
    throw new Error(
      "Hyperscape service was not registered on the agent runtime.",
    );
  }

  if (typeof runtimeLike.getServiceLoadPromise === "function") {
    await runtimeLike.getServiceLoadPromise("hyperscapeService");
  }
}

function deriveRunHealth(
  status: string,
  summary: string | null,
): AppRunSummary["health"] {
  const normalized = status.trim().toLowerCase();

  if (
    normalized === "running" ||
    normalized === "connected" ||
    normalized === "active"
  ) {
    return {
      state: "healthy",
      message: summary,
    };
  }

  if (
    normalized === "stopped" ||
    normalized === "offline" ||
    normalized === "error" ||
    normalized === "failed"
  ) {
    return {
      state: "offline",
      message: summary,
    };
  }

  return {
    state: "degraded",
    message: summary,
  };
}

function buildRunEvent(input: {
  kind: AppRunEvent["kind"];
  message: string;
  severity?: AppRunEvent["severity"];
  status?: string | null;
  details?: Record<string, AppSessionJsonValue> | null;
  createdAt?: string;
}): AppRunEvent {
  return {
    eventId: crypto.randomUUID(),
    kind: input.kind,
    severity: input.severity ?? "info",
    message: input.message,
    createdAt: input.createdAt ?? new Date().toISOString(),
    status: input.status ?? null,
    details: input.details ?? null,
  };
}

function normalizeRunEvents(events: AppRunEvent[]): AppRunEvent[] {
  return [...events]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_RUN_EVENTS);
}

function deriveChatAvailability(
  session: AppSessionState | null,
): AppRunCapabilityAvailability {
  if (!session) {
    return "unknown";
  }
  return session.canSendCommands ? "available" : "unavailable";
}

function deriveControlAvailability(
  session: AppSessionState | null,
): AppRunCapabilityAvailability {
  if (!session) {
    return "unknown";
  }
  return session.canSendCommands || (session.controls?.length ?? 0) > 0
    ? "available"
    : "unavailable";
}

function deriveHealthFacetState(
  availability: AppRunCapabilityAvailability,
): AppRunSummary["healthDetails"]["auth"]["state"] {
  if (availability === "available") {
    return "healthy";
  }
  if (availability === "unavailable") {
    return "degraded";
  }
  return "unknown";
}

function deriveRunHealthDetails(run: AppRunSummary): AppRunSummary["healthDetails"] {
  const viewerState: AppRunSummary["healthDetails"]["viewer"]["state"] = !run.viewer
    ? "unknown"
    : run.viewerAttachment === "attached"
      ? "healthy"
      : run.viewerAttachment === "detached"
        ? "degraded"
        : "offline";
  const authState: AppRunSummary["healthDetails"]["auth"]["state"] = run.session
    ? run.viewerAttachment === "attached" || run.viewer == null
      ? "healthy"
      : "degraded"
    : "unknown";

  return {
    checkedAt: run.updatedAt,
    auth: {
      state: authState,
      message: run.session?.summary ?? run.summary,
    },
    runtime: {
      state: run.health.state,
      message: run.health.message,
    },
    viewer: {
      state: viewerState,
      message:
        run.viewerAttachment === "attached"
          ? "Viewer attached."
          : run.viewerAttachment === "detached"
            ? "Viewer detached."
            : "Viewer unavailable.",
    },
    chat: {
      state: deriveHealthFacetState(run.chatAvailability),
      message:
        run.chatAvailability === "available"
          ? "Operator chat is available."
          : run.chatAvailability === "unavailable"
            ? "Operator chat is unavailable."
            : "Operator chat availability is unknown.",
    },
    control: {
      state: deriveHealthFacetState(run.controlAvailability),
      message:
        run.controlAvailability === "available"
          ? "Control actions are available."
          : run.controlAvailability === "unavailable"
            ? "Control actions are unavailable."
            : "Control availability is unknown.",
    },
    message: run.health.message,
  };
}

function deriveAwaySummary(run: AppRunSummary): AppRunAwaySummary {
  const recent = run.recentEvents.slice(0, 3).map((event) => event.message);
  return {
    generatedAt: run.updatedAt,
    message:
      recent.length > 0
        ? recent.join(" ")
        : run.summary ?? `${run.displayName} is ${run.status}.`,
    eventCount: run.recentEvents.length,
    since: run.recentEvents.at(-1)?.createdAt ?? run.startedAt,
    until: run.recentEvents[0]?.createdAt ?? run.updatedAt,
  };
}

function normalizeRunSummary(run: AppRunSummary): AppRunSummary {
  const status = run.session?.status ?? run.status;
  const summary = run.session?.summary ?? run.summary;
  const next: AppRunSummary = {
    ...run,
    characterId: run.characterId ?? run.session?.characterId ?? null,
    agentId: run.agentId ?? run.session?.agentId ?? null,
    chatAvailability: deriveChatAvailability(run.session),
    controlAvailability: deriveControlAvailability(run.session),
    supportsViewerDetach:
      typeof run.supportsViewerDetach === "boolean"
        ? run.supportsViewerDetach
        : Boolean(run.supportsBackground),
    recentEvents: normalizeRunEvents(run.recentEvents),
    status,
    summary,
    lastHeartbeatAt: run.session ? run.updatedAt : run.lastHeartbeatAt,
    health: deriveRunHealth(status, summary),
  };

  return {
    ...next,
    awaySummary: deriveAwaySummary(next),
    healthDetails: deriveRunHealthDetails(next),
  };
}

function buildRunSummary(input: {
  runId: string;
  appName: string;
  displayName: string;
  pluginName: string;
  launchType: string;
  launchUrl: string | null;
  viewer: AppViewerConfig | null;
  session: AppSessionState | null;
  startedAt?: string;
  viewerAttachment?: AppRunSummary["viewerAttachment"];
}): AppRunSummary {
  const now = new Date().toISOString();
  const status =
    input.session?.status ?? (input.viewer ? "running" : "launching");
  const summary = input.session?.summary ?? null;
  const health = deriveRunHealth(status, summary);

  return normalizeRunSummary({
    runId: input.runId,
    appName: input.appName,
    displayName: input.displayName,
    pluginName: input.pluginName,
    launchType: input.launchType,
    launchUrl: input.launchUrl,
    viewer: input.viewer,
    session: input.session,
    characterId: input.session?.characterId ?? null,
    agentId: input.session?.agentId ?? null,
    status,
    summary,
    startedAt: input.startedAt ?? now,
    updatedAt: now,
    lastHeartbeatAt: input.session ? now : null,
    supportsBackground: true,
    viewerAttachment:
      input.viewerAttachment ?? (input.viewer ? "attached" : "unavailable"),
    chatAvailability: deriveChatAvailability(input.session),
    controlAvailability: deriveControlAvailability(input.session),
    supportsViewerDetach: true,
    recentEvents: [
      buildRunEvent({
        kind: "launch",
        message:
          summary ??
          `${input.displayName} launched with ${input.viewer ? "a viewer" : "no viewer"}.`,
        status,
        details: {
          runId: input.runId,
          appName: input.appName,
          viewerAttachment:
            input.viewerAttachment ?? (input.viewer ? "attached" : "unavailable"),
          characterId: input.session?.characterId ?? null,
          agentId: input.session?.agentId ?? null,
        },
      }),
    ],
    awaySummary: null,
    health,
    healthDetails: {
      checkedAt: now,
      auth: {
        state: "unknown",
        message: summary,
      },
      runtime: {
        state: health.state,
        message: summary,
      },
      viewer: {
        state: "unknown",
        message: null,
      },
      chat: {
        state: "unknown",
        message: null,
      },
      control: {
        state: "unknown",
        message: null,
      },
      message: summary,
    },
  });
}

function updateRunSummary(
  run: AppRunSummary,
  patch: Partial<AppRunSummary>,
  event?: Parameters<typeof buildRunEvent>[0],
): AppRunSummary {
  const updatedAt = new Date().toISOString();
  const next = normalizeRunSummary({
    ...run,
    ...patch,
    updatedAt,
    lastHeartbeatAt: patch.session ? updatedAt : run.lastHeartbeatAt,
    recentEvents: event
      ? normalizeRunEvents([
          buildRunEvent({
            ...event,
            createdAt: updatedAt,
          }),
          ...run.recentEvents,
        ])
      : run.recentEvents,
  } satisfies AppRunSummary);

  return next;
}

function sameRunIdentity(
  run: AppRunSummary,
  appName: string,
  session: AppSessionState | null,
  viewer: AppViewerConfig | null,
): boolean {
  if (run.appName !== appName) return false;
  if (session?.sessionId && run.session?.sessionId === session.sessionId) {
    return true;
  }
  return Boolean(viewer?.url && run.viewer?.url === viewer.url);
}

export class AppManager {
  private readonly activeSessions = new Map<string, ActiveAppSession>();
  private readonly runRefreshAt = new Map<string, number>();
  private readonly runRefreshInFlight = new Map<
    string,
    Promise<AppRunSummary>
  >();
  private readonly stateDir?: string;
  private appRuns = new Map<string, AppRunSummary>();

  constructor(options: AppManagerOptions = {}) {
    this.stateDir = options.stateDir;
    for (const run of readAppRunStore(this.stateDir)) {
      this.appRuns.set(run.runId, run);
    }
  }

  private persistRuns(): void {
    writeAppRunStore(Array.from(this.appRuns.values()), this.stateDir);
  }

  private listRunsSorted(): AppRunSummary[] {
    return [...this.appRuns.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  private storeRun(run: AppRunSummary): AppRunSummary {
    this.appRuns.set(run.runId, run);
    this.persistRuns();
    return run;
  }

  private removeRun(runId: string): AppRunSummary | null {
    const run = this.appRuns.get(runId) ?? null;
    if (!run) return null;
    this.appRuns.delete(runId);
    this.activeSessions.delete(runId);
    this.runRefreshAt.delete(runId);
    this.runRefreshInFlight.delete(runId);
    this.persistRuns();
    return run;
  }

  private findRun(runId: string): AppRunSummary | null {
    return this.appRuns.get(runId) ?? null;
  }

  private findMatchingRun(
    appName: string,
    session: AppSessionState | null,
    viewer: AppViewerConfig | null,
  ): AppRunSummary | null {
    for (const run of this.listRunsSorted()) {
      if (sameRunIdentity(run, appName, session, viewer)) {
        return run;
      }
    }
    return null;
  }

  private shouldSkipRunRefresh(run: AppRunSummary, force: boolean): boolean {
    if (force) return false;
    const lastRefreshAt = this.runRefreshAt.get(run.runId) ?? 0;
    return Date.now() - lastRefreshAt < RUN_REFRESH_MIN_INTERVAL_MS;
  }

  private async refreshRunSession(
    run: AppRunSummary,
    runtime: IAgentRuntime | null,
  ): Promise<AppRunSummary> {
    const routeModule = await importAppRouteModule(run.appName);
    if (typeof routeModule?.refreshRunSession !== "function") {
      return run;
    }

    try {
      const nextSession = await routeModule.refreshRunSession({
        appName: run.appName,
        launchUrl: run.launchUrl,
        runtime,
        viewer: run.viewer,
        runId: run.runId,
        session: run.session,
      });
      if (!nextSession) {
        const summary = "Run session is no longer available.";
        const nextRun = this.storeRun(
          updateRunSummary(run, {
            session: buildUnavailableSession(run, "offline", summary),
            status: "offline",
            summary,
          }, {
            kind: "health",
            severity: "warning",
            message: summary,
            status: "offline",
            details: {
              runId: run.runId,
              appName: run.appName,
            },
          }),
        );
        return nextRun;
      }
      const nextRun = this.storeRun(
        updateRunSummary(run, {
          session: nextSession,
          status: nextSession.status,
          summary: nextSession.summary ?? run.summary,
        }, {
          kind: "refresh",
          severity:
            nextSession.status === "running" ? "info" : "warning",
          message:
            nextSession.summary ??
            `${run.displayName} session refreshed.`,
          status: nextSession.status,
          details: {
            runId: run.runId,
            appName: run.appName,
            sessionId: nextSession.sessionId,
          },
        }),
      );
      return nextRun;
    } catch (error) {
      const message =
        error instanceof Error
          ? `Run verification failed: ${error.message}`
          : "Run verification failed.";
      const nextStatus = run.session ? "disconnected" : "offline";
      const nextRun = this.storeRun(
        updateRunSummary(run, {
          session: buildUnavailableSession(run, nextStatus, message),
          status: nextStatus,
          summary: message,
        }, {
          kind: "health",
          severity: "error",
          message,
          status: nextStatus,
          details: {
            runId: run.runId,
            appName: run.appName,
          },
        }),
      );
      return nextRun;
    }
  }

  private async refreshRun(
    run: AppRunSummary,
    runtime: IAgentRuntime | null,
    options: { force?: boolean } = {},
  ): Promise<AppRunSummary> {
    const force = options.force === true;
    if (this.shouldSkipRunRefresh(run, force)) {
      return this.findRun(run.runId) ?? run;
    }

    const inFlight = this.runRefreshInFlight.get(run.runId);
    if (inFlight) {
      return inFlight;
    }

    this.runRefreshAt.set(run.runId, Date.now());
    const refreshPromise = this.refreshRunSession(run, runtime).finally(() => {
      this.runRefreshInFlight.delete(run.runId);
    });
    this.runRefreshInFlight.set(run.runId, refreshPromise);
    return refreshPromise;
  }

  async listAvailable(
    pluginManager: PluginManagerLike,
  ): Promise<RegistryPluginInfo[]> {
    const registry = await pluginManager.refreshRegistry();
    // Merge in local workspace app entries that are discovered by our
    // registry-client but not by the elizaos
    // plugin-manager service.
    try {
      const localRegistry = await getRegistryPlugins();
      for (const [name, info] of localRegistry) {
        if (info.kind !== "app" && !info.appMeta) {
          continue;
        }

        const existing = registry.get(name) as RegistryAppPlugin | undefined;
        if (!existing) {
          registry.set(name, info);
          continue;
        }

        mergeLocalRegistryInfo(existing, info);
        registry.set(name, existing);
      }
    } catch {
      // local discovery is best-effort
    }
    const apps = Array.from(registry.values()).filter(isAppRegistryPlugin);
    return apps.map(flattenAppInfo);
  }

  async search(
    pluginManager: PluginManagerLike,
    query: string,
    limit = 15,
  ): Promise<RegistrySearchResult[]> {
    const registry = await pluginManager.refreshRegistry();
    const appEntries = Array.from(registry.values())
      .filter(isAppRegistryPlugin)
      .map(flattenAppInfo);
    const results = scoreEntries(
      appEntries,
      query,
      limit,
      (p) => [
        p.appMeta?.displayName?.toLowerCase() ??
          p.displayName?.toLowerCase() ??
          "",
      ],
      (p) => p.appMeta?.capabilities ?? p.capabilities ?? [],
    );
    return toSearchResults(results);
  }

  async getInfo(
    pluginManager: PluginManagerLike,
    name: string,
  ): Promise<RegistryPluginInfo | null> {
    let appInfo = await pluginManager.getRegistryPlugin(name);
    const localPluginInfo = await getPluginInfo(name);

    if (localPluginInfo) {
      if (!appInfo) {
        appInfo = mergeLocalRegistryInfo(
          { ...localPluginInfo },
          localPluginInfo,
        );
      } else {
        mergeLocalRegistryInfo(appInfo, localPluginInfo);
      }
    }

    if (!appInfo) return null;

    // Apply local app overrides (viewer URL, sandbox, embed params, etc.)
    // so displayName / launchType / viewer are populated even when the
    // npm registry has no metadata for this app.
    if (appInfo.appMeta) {
      appInfo.appMeta =
        resolveAppOverride(name, appInfo.appMeta) ?? appInfo.appMeta;
    } else {
      appInfo.appMeta = resolveAppOverride(name, undefined);
    }

    return flattenAppInfo(appInfo);
  }

  async listRuns(
    runtime: IAgentRuntime | null = null,
  ): Promise<AppRunSummary[]> {
    const runs = this.listRunsSorted();
    if (runs.length === 0) {
      return runs;
    }

    const refreshed = await Promise.all(
      runs.map((run) => this.refreshRun(run, runtime)),
    );
    return refreshed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getRun(
    runId: string,
    runtime: IAgentRuntime | null = null,
  ): Promise<AppRunSummary | null> {
    const run = this.findRun(runId);
    if (!run) {
      return null;
    }
    return this.refreshRun(run, runtime, { force: true });
  }

  async attachRun(
    runId: string,
    runtime: IAgentRuntime | null = null,
  ): Promise<AppRunActionResult> {
    const existingRun = this.findRun(runId);
    const run = existingRun
      ? await this.refreshRun(existingRun, runtime, { force: true })
      : null;
    if (!run) {
      return {
        success: false,
        message: `App run "${runId}" was not found.`,
      };
    }

    const updated = this.storeRun(
      updateRunSummary(run, {
        viewerAttachment: run.viewer ? "attached" : "unavailable",
      }, {
        kind: "attach",
        message:
          run.viewer
            ? `${run.displayName} viewer attached.`
            : `${run.displayName} viewer is unavailable.`,
        status: run.session?.status ?? run.status,
        details: {
          runId: run.runId,
          appName: run.appName,
        },
      }),
    );

    return {
      success: true,
      message: `${updated.displayName} attached.`,
      run: updated,
    };
  }

  async detachRun(runId: string): Promise<AppRunActionResult> {
    const run = this.findRun(runId);
    if (!run) {
      return {
        success: false,
        message: `App run "${runId}" was not found.`,
      };
    }

    const updated = this.storeRun(
      updateRunSummary(run, {
        viewerAttachment: run.viewer ? "detached" : "unavailable",
      }, {
        kind: "detach",
        message:
          run.viewer
            ? `${run.displayName} viewer detached.`
            : `${run.displayName} viewer is unavailable.`,
        status: run.session?.status ?? run.status,
        details: {
          runId: run.runId,
          appName: run.appName,
        },
      }),
    );

    return {
      success: true,
      message: `${updated.displayName} detached.`,
      run: updated,
    };
  }

  /**
   * Launch an app: install its plugin (if needed) and return the viewer URL.
   *
   * The plugin connects the agent to the game server. The viewer URL is what
   * the UI shows in an iframe so the user can watch the agent play.
   *
   * After installing a new plugin, the agent needs to restart. The UI should
   * handle this by showing "connecting..." while the runtime restarts.
   */
  async launch(
    pluginManager: PluginManagerLike,
    name: string,
    onProgress?: (progress: InstallProgressLike) => void,
    _runtime?: IAgentRuntime | null,
  ): Promise<AppLaunchResult> {
    let appInfo = (await pluginManager.getRegistryPlugin(
      name,
    )) as RegistryAppPlugin | null;
    let localPluginInfo: Awaited<ReturnType<typeof getPluginInfo>> | null =
      null;
    // Supplement with local registry metadata since the elizaos plugin-manager
    // service doesn't include our local workspace app discovery.
    try {
      localPluginInfo = await getPluginInfo(name);
      if (localPluginInfo) {
        if (!appInfo) {
          appInfo = mergeLocalRegistryInfo(
            { ...localPluginInfo } as RegistryAppPlugin,
            localPluginInfo,
          );
        } else {
          mergeLocalRegistryInfo(appInfo, localPluginInfo);
        }
      }
    } catch {
      // local lookup is best-effort
    }
    if (!appInfo) {
      throw new Error(`App "${name}" not found in the registry.`);
    }

    // Apply local app overrides (viewer URL, sandbox, embed params, etc.)
    // and flatten appMeta onto the top-level fields so launchUrl / viewer
    // are populated even when the npm registry has no metadata for this app.
    if (appInfo.appMeta) {
      appInfo.appMeta =
        resolveAppOverride(name, appInfo.appMeta) ?? appInfo.appMeta;
    } else {
      appInfo.appMeta = resolveAppOverride(name, undefined);
    }
    appInfo = flattenAppInfo(appInfo);

    // The app's plugin is what the agent needs to play the game.
    // It's the same npm package name as the app, or a separate plugin ref.
    const pluginName =
      appInfo.runtimePlugin ?? resolvePluginPackageName(appInfo);

    // Check if this is a local plugin (already present in plugins/ directory)
    const isLocal =
      Boolean(localPluginInfo?.localPath) || isLocalPlugin(appInfo);

    // Check if the plugin is already installed
    const installed = await pluginManager.listInstalledPlugins();
    const alreadyInstalled = installed.some((p) => p.name === pluginName);
    let pluginInstalled = alreadyInstalled || isLocal;

    let needsRestart = false;

    if (isLocal) {
      // Local plugins are already available, no installation needed
      logger.info(
        `[app-manager] Using local plugin for ${name}: ${pluginName}`,
      );
    } else if (!alreadyInstalled) {
      if (isAutoInstallable(appInfo)) {
        if (!_runtime) {
          throw new Error(
            `Launching "${name}" requires a running agent runtime because plugin "${pluginName}" is not installed.`,
          );
        }
        logger.info(`[app-manager] Installing plugin for app: ${pluginName}`);
        const result = await pluginManager.installPlugin(
          pluginName,
          onProgress,
        );
        if (!result.success) {
          throw new Error(
            `Failed to install plugin "${pluginName}": ${result.error}`,
          );
        }
        pluginInstalled = true;
        needsRestart = result.requiresRestart;
        logger.info(
          `[app-manager] Plugin installed: ${pluginName} v${result.version}`,
        );
      } else {
        logger.info(
          `[app-manager] Skipping plugin install for ${name}: no installable runtime package/version in registry metadata.`,
        );
      }
    } else {
      logger.info(`[app-manager] Plugin already installed: ${pluginName}`);
    }

    const launchPreparationDiagnostics: AppLaunchDiagnostic[] = [];
    if (isHyperscapeAppName(appInfo.name)) {
      launchPreparationDiagnostics.push(
        ...(await prepareHyperscapeLaunch(_runtime ?? null)),
      );
    }
    if (isBabylonAppName(appInfo.name)) {
      launchPreparationDiagnostics.push(
        ...(await prepareBabylonLaunch(_runtime ?? null)),
      );
      const babylonUrl = resolveBabylonApiBaseUrl(_runtime ?? null);
      const agentId = resolveSettingLike(_runtime, "BABYLON_AGENT_ID");
      logger.info(
        `[app-manager] Babylon launch: url=${babylonUrl} agentId=${agentId ?? "(none)"}`,
      );
    }
    if (is2004scapeAppName(appInfo.name)) {
      const rsSdkServerUrl = resolve2004scapeServerUrl(_runtime ?? null);
      const serverUp = await is2004scapeServerReachable(rsSdkServerUrl);
      if (!serverUp) {
        logger.info(
          `[app-manager] 2004scape server is not reachable at ${rsSdkServerUrl} — skipping plugin registration to avoid noisy SDK errors`,
        );
        launchPreparationDiagnostics.push({
          code: "2004scape-server-unreachable",
          severity: "warning",
          message: `2004scape game server is not running at ${rsSdkServerUrl}. Start the server and re-launch the app.`,
        });
      } else {
        launchPreparationDiagnostics.push(
          ...(await prepare2004scapeLaunch(_runtime ?? null)),
        );
      }
    }

    // Skip runtime plugin registration when the target service is unreachable
    // (e.g. 2004scape server down) to avoid error-level logs from the SDK init.
    const skipPluginRegistration =
      is2004scapeAppName(appInfo.name) &&
      launchPreparationDiagnostics.some(
        (d) => d.code === "2004scape-server-unreachable",
      );

    let runtimePluginRegistered = false;
    if (!skipPluginRegistration) {
      runtimePluginRegistered = await ensureRuntimePluginRegistered(
        appInfo,
        _runtime ?? null,
        isLocal,
      );
    }
    if (runtimePluginRegistered) {
      pluginInstalled = true;
    }
    await ensureHyperscapeServiceLoaded(appInfo, _runtime ?? null);

    // Build viewer config from registry app metadata
    const resolvedLaunchUrl = appInfo.launchUrl
      ? substituteTemplateVars(appInfo.launchUrl)
      : null;
    const launchUrl = resolvedLaunchUrl
      ? normalizeSafeAppUrl(resolvedLaunchUrl)
      : null;
    if (resolvedLaunchUrl && !launchUrl) {
      throw new Error(
        `Refusing to launch app "${appInfo.name}": unsafe launch URL`,
      );
    }
    const viewer = buildViewerConfig(appInfo, launchUrl, _runtime);
    const session = _runtime
      ? await resolveLaunchSession(appInfo, viewer, launchUrl, _runtime)
      : buildAppSession(appInfo, viewer?.authMessage, _runtime);
    const diagnostics = [
      ...launchPreparationDiagnostics,
      ...collectLaunchDiagnostics(appInfo, viewer, session, _runtime ?? null),
    ];
    const existingRun = this.findMatchingRun(name, session, viewer);
    const run = this.storeRun(
      existingRun
        ? updateRunSummary(existingRun, {
            displayName: appInfo.displayName ?? appInfo.name,
            pluginName,
            launchType: appInfo.launchType ?? "connect",
            launchUrl,
            viewer,
            session,
            viewerAttachment: viewer ? "attached" : "unavailable",
          }, {
            kind: "refresh",
            message:
              session?.summary ??
              `${appInfo.displayName ?? appInfo.name} launch state refreshed.`,
            status: session?.status ?? (viewer ? "running" : "launching"),
            details: {
              runId: existingRun.runId,
              appName: name,
              sessionId: session?.sessionId ?? null,
            },
          })
        : buildRunSummary({
            runId: crypto.randomUUID(),
            appName: name,
            displayName: appInfo.displayName ?? appInfo.name,
            pluginName,
            launchType: appInfo.launchType ?? "connect",
            launchUrl,
            viewer,
            session,
          }),
    );

    this.activeSessions.set(run.runId, {
      runId: run.runId,
      appName: name,
      pluginName,
      launchType: appInfo.launchType ?? "connect",
      launchUrl,
      viewerUrl: viewer?.url ?? null,
      startedAt: run.startedAt,
    });

    return {
      pluginInstalled,
      needsRestart,
      displayName: appInfo.displayName ?? appInfo.name,
      launchType: appInfo.launchType ?? "connect",
      launchUrl,
      viewer,
      session,
      run,
      diagnostics,
    };
  }

  async stop(
    pluginManager: PluginManagerLike,
    name: string,
    runId?: string,
  ): Promise<AppStopResult> {
    const stoppedAt = new Date().toISOString();

    if (runId) {
      const removedRun = this.removeRun(runId);
      if (!removedRun) {
        return {
          success: false,
          appName: name,
          runId,
          stoppedAt,
          pluginUninstalled: false,
          needsRestart: false,
          stopScope: "no-op",
          message: `App run "${runId}" was not found.`,
        };
      }

      return {
        success: true,
        appName: removedRun.appName,
        runId: removedRun.runId,
        stoppedAt,
        pluginUninstalled: false,
        needsRestart: false,
        stopScope: "viewer-session",
        message: `${removedRun.displayName} stopped.`,
      };
    }

    const runsForApp = this.listRunsSorted().filter(
      (run) => run.appName === name,
    );
    if (runsForApp.length === 0) {
      const appInfo = (await pluginManager.getRegistryPlugin(
        name,
      )) as RegistryAppPlugin | null;
      if (!appInfo) {
        throw new Error(`App "${name}" not found in the registry.`);
      }

      return {
        success: false,
        appName: name,
        runId: null,
        stoppedAt,
        pluginUninstalled: false,
        needsRestart: false,
        stopScope: "no-op",
        message: `No active app run found for "${name}".`,
      };
    }

    for (const run of runsForApp) {
      this.removeRun(run.runId);
    }

    return {
      success: true,
      appName: name,
      runId: null,
      stoppedAt,
      pluginUninstalled: false,
      needsRestart: false,
      stopScope: "viewer-session",
      message:
        runsForApp.length === 1
          ? `${runsForApp[0]?.displayName ?? name} stopped.`
          : `${runsForApp.length} app runs stopped for "${name}".`,
    };
  }

  /** List apps whose plugins are currently installed on the agent. */
  async listInstalled(
    pluginManager: PluginManagerLike,
  ): Promise<InstalledAppInfo[]> {
    const installed = await pluginManager.listInstalledPlugins();
    const registry = await pluginManager.refreshRegistry();
    const installedByName = new Map(
      installed.map((plugin) => [plugin.name, plugin] as const),
    );

    const appEntries = Array.from(registry.values())
      .filter(isAppRegistryPlugin)
      .map(flattenAppInfo);

    return appEntries
      .map((appInfo): InstalledAppInfo | null => {
        const pluginName =
          appInfo.runtimePlugin ?? resolvePluginPackageName(appInfo);
        const installedPlugin =
          installedByName.get(pluginName) ?? installedByName.get(appInfo.name);
        if (!installedPlugin) return null;

        return {
          name: appInfo.name,
          displayName:
            appInfo.displayName ?? packageNameToAppDisplayName(appInfo.name),
          pluginName,
          version: installedPlugin.version ?? "unknown",
          installedAt: installedPlugin.installedAt ?? "",
        };
      })
      .filter((app): app is InstalledAppInfo => app !== null);
  }
}
