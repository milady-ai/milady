#!/usr/bin/env node
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: replacement payloads contain literal template placeholders.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const LOG_PREFIX = "[patch-elizaos-app-core-native-browser-package]";

function resolveAppCoreDir() {
  try {
    return path.dirname(require.resolve("@elizaos/app-core/package.json"));
  } catch {
    return null;
  }
}

const appCoreDir = resolveAppCoreDir();
if (!appCoreDir) {
  console.warn(`${LOG_PREFIX} @elizaos/app-core is not installed; skipping.`);
  process.exit(0);
}

const packageAppCoreSrcDir = path.join(appCoreDir, "packages/app-core/src");
if (!fs.existsSync(path.join(packageAppCoreSrcDir, "api/client-cloud.js"))) {
  console.warn(
    `${LOG_PREFIX} @elizaos/app-core is linked to local source; package patch is not needed.`,
  );
  process.exit(0);
}

function patchFile(filePath, patcher) {
  if (!fs.existsSync(filePath)) {
    console.warn(`${LOG_PREFIX} ${filePath} does not exist; skipping.`);
    return false;
  }

  const original = fs.readFileSync(filePath, "utf8");
  const next = patcher(original);
  if (next === original) {
    return false;
  }

  fs.writeFileSync(filePath, next);
  console.log(
    `${LOG_PREFIX} patched ${path.relative(process.cwd(), filePath)}`,
  );
  return true;
}

function writeFileIfChanged(filePath, contents) {
  const original = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : null;
  if (original === contents) {
    return false;
  }

  fs.writeFileSync(filePath, contents);
  console.log(`${LOG_PREFIX} wrote ${path.relative(process.cwd(), filePath)}`);
  return true;
}

function findBunAppCorePackageDirs(primaryDir) {
  const bunDir = path.join(process.cwd(), "node_modules", ".bun");
  if (!fs.existsSync(bunDir)) {
    return [];
  }

  return fs
    .readdirSync(bunDir)
    .filter((entry) => entry.startsWith("@elizaos+app-core@"))
    .map((entry) =>
      path.join(bunDir, entry, "node_modules", "@elizaos", "app-core"),
    )
    .filter(
      (candidate) =>
        candidate !== primaryDir &&
        fs.existsSync(path.join(candidate, "package.json")),
    );
}

function findBunAppCoreNativeTransportPaths() {
  return findBunAppCorePackageDirs(appCoreDir).map((packageDir) =>
    path.join(
      packageDir,
      "packages",
      "app-core",
      "src",
      "api",
      "native-cloud-http-transport.js",
    ),
  );
}

const fallbackPackageExportSources = new Map([
  ["./api/client-types-chat", "api/client-types-chat"],
  ["./api/server-wallet-trade", "api/server-wallet-trade"],
  ["./api/wallet-export-guard", "api/wallet-export-guard"],
  ["./app-shell-components", "app-shell-components"],
  ["./browser", "browser"],
  ["./platform/is-native-server", "platform/is-native-server"],
  ["./runtime/app-route-plugin-registry", "runtime/app-route-plugin-registry"],
  ["./services/github-credentials", "services/github-credentials"],
  ["./services/n8n-mode", "services/n8n-mode"],
  ["./services/n8n-sidecar", "services/n8n-sidecar"],
  ["./widgets/registry", "widgets/registry"],
]);

function localAppCorePackageJsonPath() {
  const localPath = path.join(
    process.cwd(),
    "eliza",
    "packages",
    "app-core",
    "package.json",
  );
  return fs.existsSync(localPath) ? localPath : null;
}

function toCompiledPackageExportSource(value) {
  if (typeof value !== "string") {
    return null;
  }
  if (!value.startsWith("./src/") || value.includes("*")) {
    return null;
  }

  const source = value.replace(/^\.\/src\//, "").replace(/\.(ts|tsx)$/, "");
  return source.endsWith(".css") ? null : source;
}

function packageExportSources() {
  const sources = new Map(fallbackPackageExportSources);
  const localPackageJsonPath = localAppCorePackageJsonPath();
  if (!localPackageJsonPath) {
    return sources;
  }

  const localPackageJson = JSON.parse(
    fs.readFileSync(localPackageJsonPath, "utf8"),
  );
  for (const [key, value] of Object.entries(localPackageJson.exports ?? {})) {
    const source = toCompiledPackageExportSource(value);
    if (source) {
      sources.set(key, source);
    }
  }
  return sources;
}

function compiledExportValue(source) {
  return {
    types: `./packages/app-core/src/${source}.d.ts`,
    import: `./packages/app-core/src/${source}.js`,
    default: `./packages/app-core/src/${source}.js`,
  };
}

function patchPackageJsonExports(packageJsonPath, sources) {
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  packageJson.exports ??= {};
  let patched = false;
  for (const [key, source] of sources) {
    if (packageJson.exports[key]) {
      continue;
    }

    const importPath = path.join(
      path.dirname(packageJsonPath),
      "packages",
      "app-core",
      "src",
      `${source}.js`,
    );
    const typesPath = path.join(
      path.dirname(packageJsonPath),
      "packages",
      "app-core",
      "src",
      `${source}.d.ts`,
    );
    if (!fs.existsSync(importPath) || !fs.existsSync(typesPath)) {
      continue;
    }

    packageJson.exports[key] = compiledExportValue(source);
    patched = true;
  }

  if (!patched) {
    return false;
  }

  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  console.log(
    `${LOG_PREFIX} patched exports in ${path.relative(process.cwd(), packageJsonPath)}`,
  );
  return true;
}

function appCorePackageSourcePath(packageDir, relativePath) {
  return path.join(packageDir, "packages", "app-core", "src", relativePath);
}

const appShellRegistrySource = `const APP_SHELL_PAGE_REGISTRY_KEY = Symbol.for("elizaos.app-core.app-shell-page-registry");
function getAppShellPageRegistryStore() {
    const globalObject = globalThis;
    const existing = globalObject[APP_SHELL_PAGE_REGISTRY_KEY];
    if (existing)
        return existing;
    const created = {
        entries: new Map(),
    };
    globalObject[APP_SHELL_PAGE_REGISTRY_KEY] = created;
    return created;
}
export function registerAppShellPage(registration) {
    getAppShellPageRegistryStore().entries.set(registration.id, registration);
}
export function listAppShellPages() {
    return [...getAppShellPageRegistryStore().entries.values()];
}
`;

const appShellRegistryTypesSource = `import type { ComponentType } from "react";
export interface AppShellPageRegistration {
    id: string;
    pluginId: string;
    label: string;
    icon?: string;
    path: string;
    order?: number;
    developerOnly?: boolean;
    group?: string;
    Component: ComponentType<unknown>;
}
export declare function registerAppShellPage(registration: AppShellPageRegistration): void;
export declare function listAppShellPages(): AppShellPageRegistration[];
`;

function replacePrototypeFunction(source, methodName, replacement) {
  const pattern = new RegExp(
    `^ElizaClient\\.prototype\\.${methodName} = async function \\(cloudApiBase(?:, sessionId)?\\) \\{[\\s\\S]*?^};`,
    "m",
  );
  return source.replace(pattern, replacement);
}

function replaceAnyPrototypeFunction(source, methodName, replacement) {
  const pattern = new RegExp(
    `^ElizaClient\\.prototype\\.${methodName} = async function \\([^)]*\\) \\{[\\s\\S]*?^};`,
    "m",
  );
  return source.replace(pattern, replacement);
}

const openExternalUrlPath = path.join(
  appCoreDir,
  "packages/app-core/src/utils/openExternalUrl.js",
);

const useCloudStatePath = path.join(
  appCoreDir,
  "packages/app-core/src/state/useCloudState.js",
);

const useOnboardingCallbacksPath = path.join(
  appCoreDir,
  "packages/app-core/src/state/useOnboardingCallbacks.js",
);

const clientCloudPath = path.join(
  appCoreDir,
  "packages/app-core/src/api/client-cloud.js",
);

const clientBasePath = path.join(
  appCoreDir,
  "packages/app-core/src/api/client-base.js",
);

const nativeCloudHttpTransportPath = path.join(
  appCoreDir,
  "packages/app-core/src/api/native-cloud-http-transport.js",
);

const runMobileBuildPath = path.join(
  appCoreDir,
  "scripts/run-mobile-build.mjs",
);

let changed = false;
const exportSources = packageExportSources();
const appCorePackageDirs = [
  appCoreDir,
  ...findBunAppCorePackageDirs(appCoreDir),
];

for (const packageDir of appCorePackageDirs) {
  changed =
    patchPackageJsonExports(
      path.join(packageDir, "package.json"),
      exportSources,
    ) || changed;
}

const nativeCloudHttpTransportSource = `import { Capacitor, CapacitorHttp } from "@capacitor/core";

const DIRECT_CLOUD_API_HOSTS = new Set([
    "api.elizacloud.ai",
    "elizacloud.ai",
    "www.elizacloud.ai",
    "dev.elizacloud.ai",
]);

function isNativeDirectCloudApiUrl(url) {
    try {
        const parsed = new URL(url);
        return (Capacitor.isNativePlatform() &&
            parsed.protocol === "https:" &&
            DIRECT_CLOUD_API_HOSTS.has(parsed.hostname.toLowerCase()));
    }
    catch {
        return false;
    }
}

function headersToRecord(headers) {
    if (!headers)
        return {};
    const record = {};
    new Headers(headers).forEach((value, key) => {
        record[key] = value;
    });
    return record;
}

function methodAllowsBody(method) {
    const normalized = method.toUpperCase();
    return normalized !== "GET" && normalized !== "HEAD";
}

function bodyToNativeData(body) {
    if (body === null || body === undefined)
        return undefined;
    if (typeof body === "string")
        return body;
    if (body instanceof URLSearchParams)
        return body.toString();
    return undefined;
}

function responseBody(data) {
    if (data === null || data === undefined)
        return "";
    if (typeof data === "string")
        return data;
    return JSON.stringify(data);
}

export async function requestWithNativeCloudHttp(url, init, context) {
    if (!isNativeDirectCloudApiUrl(url))
        return null;
    const method = init.method ?? "GET";
    const data = bodyToNativeData(init.body);
    if (init.body != null && data === undefined)
        return null;
    const result = await CapacitorHttp.request({
        url,
        method,
        headers: headersToRecord(init.headers),
        ...(methodAllowsBody(method) && data !== undefined ? { data } : {}),
        responseType: "text",
        ...(context?.timeoutMs
            ? {
                connectTimeout: context.timeoutMs,
                readTimeout: context.timeoutMs,
            }
            : {}),
    });
    return new Response(responseBody(result.data), {
        status: result.status,
        headers: result.headers,
    });
}
`;

changed =
  writeFileIfChanged(
    nativeCloudHttpTransportPath,
    nativeCloudHttpTransportSource,
  ) || changed;

for (const transportPath of findBunAppCoreNativeTransportPaths()) {
  changed =
    writeFileIfChanged(transportPath, nativeCloudHttpTransportSource) ||
    changed;
}

for (const packageDir of appCorePackageDirs) {
  changed =
    patchFile(
      appCorePackageSourcePath(packageDir, "app-shell-components.js"),
      (source) => {
        if (source.includes("registerAppShellPage")) {
          return source;
        }
        return `${source.trimEnd()}\n${appShellRegistrySource}`;
      },
    ) || changed;
  changed =
    patchFile(
      appCorePackageSourcePath(packageDir, "app-shell-components.d.ts"),
      (source) => {
        if (source.includes("registerAppShellPage")) {
          return source;
        }
        return `${source.trimEnd()}\n${appShellRegistryTypesSource}`;
      },
    ) || changed;
}

changed =
  patchFile(clientBasePath, (source) => {
    let next = source;

    if (!next.includes('from "./native-cloud-http-transport"')) {
      next = next.replace(
        'import { mergeStreamingText } from "../utils/streaming-text";',
        'import { mergeStreamingText } from "../utils/streaming-text";\nimport { requestWithNativeCloudHttp } from "./native-cloud-http-transport";',
      );
    }

    if (!next.includes("requestWithNativeCloudHttp(requestUrl")) {
      next = next.replace(
        "                return await fetch(requestUrl, requestInit);",
        "                const nativeCloudResponse = await requestWithNativeCloudHttp(requestUrl, requestInit, { timeoutMs });\n                if (nativeCloudResponse)\n                    return nativeCloudResponse;\n                return await fetch(requestUrl, requestInit);",
      );
    }

    return next;
  }) || changed;

changed =
  patchFile(openExternalUrlPath, (source) => {
    let next = source;

    if (!next.includes('from "@capacitor/core"')) {
      next = next.replace(
        'import { getElectrobunRendererRpc, invokeDesktopBridgeRequestWithTimeout, } from "../bridge/electrobun-rpc";',
        'import { Capacitor, registerPlugin } from "@capacitor/core";\nimport { getElectrobunRendererRpc, invokeDesktopBridgeRequestWithTimeout, } from "../bridge/electrobun-rpc";\nconst registeredCapacitorBrowser = registerPlugin("Browser");\nfunction getCapacitorBrowser() {\n    if (!Capacitor.isNativePlatform())\n        return null;\n    const cap = globalThis.Capacitor;\n    return cap?.Plugins?.Browser ?? registeredCapacitorBrowser;\n}',
      );
    }

    if (!next.includes("const capacitorBrowser = getCapacitorBrowser();")) {
      next = next.replace(
        "export async function openExternalUrl(url) {\n",
        "export async function openExternalUrl(url) {\n    const capacitorBrowser = getCapacitorBrowser();\n    if (capacitorBrowser) {\n        await capacitorBrowser.open({ url });\n        return;\n    }\n",
      );
    }

    next = next.replace(
      '    if (getElectrobunRendererRpc() !== undefined)\n        return null; // Desktop uses RPC\n    if (typeof window === "undefined" || typeof window.open !== "function")',
      '    if (getElectrobunRendererRpc() !== undefined)\n        return null; // Desktop uses RPC\n    if (Capacitor.isNativePlatform())\n        return null;\n    if (typeof window === "undefined" || typeof window.open !== "function")',
    );

    return next;
  }) || changed;

changed =
  patchFile(useCloudStatePath, (source) => {
    let next = source;

    if (!next.includes('from "@capacitor/core"')) {
      next = next.replace(
        'import { useCallback, useEffect, useRef, useState } from "react";',
        'import { Capacitor } from "@capacitor/core";\nimport { useCallback, useEffect, useRef, useState } from "react";',
      );
    }

    if (!next.includes("function isCapacitorAssetBase")) {
      next = next.replace(
        "const ELIZA_CLOUD_LOGIN_MAX_CONSECUTIVE_ERRORS = 3;\n// ── Helpers",
        'const ELIZA_CLOUD_LOGIN_MAX_CONSECUTIVE_ERRORS = 3;\nconst DEFAULT_DIRECT_CLOUD_BASE_URL = "https://www.elizacloud.ai";\n// ── Helpers',
      );
      next = next.replace(
        'function hasCloudLoginBackend() {\n    const explicitBase = typeof client.getBaseUrl === "function" ? client.getBaseUrl().trim() : "";\n    return Boolean(explicitBase) || isSameOriginLocalHttpBackend();\n}',
        'function isCapacitorNativeRuntime() {\n    return Capacitor.isNativePlatform();\n}\nfunction originsMatch(left, right) {\n    try {\n        return new URL(left).origin === new URL(right).origin;\n    }\n    catch {\n        return false;\n    }\n}\nfunction isConfiguredCloudSiteBase(baseUrl) {\n    const configuredCloudBase = getBootConfig().cloudApiBase?.trim() || DEFAULT_DIRECT_CLOUD_BASE_URL;\n    if (originsMatch(baseUrl, configuredCloudBase))\n        return true;\n    try {\n        const host = new URL(baseUrl).hostname.toLowerCase();\n        return (host === "api.elizacloud.ai" ||\n            host === "elizacloud.ai" ||\n            host === "www.elizacloud.ai" ||\n            host === "dev.elizacloud.ai");\n    }\n    catch {\n        return false;\n    }\n}\nfunction isCapacitorAssetBase(baseUrl) {\n    if (!isCapacitorNativeRuntime())\n        return false;\n    try {\n        const parsed = new URL(baseUrl);\n        if (parsed.pathname !== "/" || parsed.search || parsed.hash)\n            return false;\n        return ((parsed.protocol === "http:" || parsed.protocol === "https:") &&\n            parsed.hostname.toLowerCase() === "localhost" &&\n            parsed.port === "");\n    }\n    catch {\n        return false;\n    }\n}\nfunction hasCloudLoginBackend() {\n    const explicitBase = typeof client.getBaseUrl === "function" ? client.getBaseUrl().trim() : "";\n    if (explicitBase) {\n        return (!isConfiguredCloudSiteBase(explicitBase) &&\n            !isCapacitorAssetBase(explicitBase));\n    }\n    if (isCapacitorNativeRuntime())\n        return false;\n    return isSameOriginLocalHttpBackend();\n}',
      );
    }

    next = next.replace(
      '            const sessionId = resp.sessionId ?? "";\n            let pollInFlight = false;',
      '            const sessionId = resp.sessionId ?? "";\n            const authenticatedCloudApiBase = useDirectAuth && resp.apiBase ? resp.apiBase : cloudApiBase;\n            let pollInFlight = false;',
    );

    next = next.replace(
      "                        poll = await client.cloudLoginPollDirect(cloudApiBase, sessionId);",
      "                        poll = await client.cloudLoginPollDirect(authenticatedCloudApiBase, sessionId);",
    );

    next = next.replace(
      "                            setBootConfig({ ...cfg, cloudApiBase });",
      "                            setBootConfig({ ...cfg, cloudApiBase: authenticatedCloudApiBase });",
    );

    next = next.replace(
      '                        if (useDirectAuth) {\n                            if (!poll.token) {\n                                stopCloudLoginPolling("Eliza Cloud login completed, but the cloud session did not return an API key.");\n                                return;\n                            }\n                            try {\n                                await client.cloudLoginPersist(poll.token, {\n                                    organizationId: poll.organizationId,\n                                    userId: poll.userId,\n                                });\n                            }\n                            catch (cause) {\n                                stopCloudLoginPolling(formatCloudLoginPersistError(cause));\n                                return;\n                            }\n                        }',
      '                        if (useDirectAuth) {\n                            if (!poll.token) {\n                                stopCloudLoginPolling("Eliza Cloud login completed, but the cloud session did not return an API key.");\n                                return;\n                            }\n                            client.setToken(poll.token);\n                        }',
    );

    next = next.replace(
      '                        if (useDirectAuth) {\n                            if (!poll.token) {\n                                stopCloudLoginPolling("Eliza Cloud login completed, but the cloud session did not return an API key.");\n                                return;\n                            }\n                            client.setBaseUrl(authenticatedCloudApiBase, {\n                                persist: false,\n                            });\n                            client.setToken(poll.token);\n                        }',
      '                        if (useDirectAuth) {\n                            if (!poll.token) {\n                                stopCloudLoginPolling("Eliza Cloud login completed, but the cloud session did not return an API key.");\n                                return;\n                            }\n                            client.setToken(poll.token);\n                        }',
    );

    return next;
  }) || changed;

changed =
  patchFile(useOnboardingCallbacksPath, (source) => {
    let next = source;

    next = next.replace(
      '                    await client.provisionCloudSandbox({\n                        cloudApiBase,\n                        authToken,\n                        name: onboardingName,\n                        bio: style?.bio ?? ["An autonomous AI agent."],\n                        onProgress: (status, detail) => {\n                            console.log(`[Sandbox] ${status}: ${detail ?? ""}`);\n                        },\n                    });\n                    client.setBaseUrl(cloudApiBase);',
      '                    const provisionedAgent = await client.provisionCloudSandbox({\n                        cloudApiBase,\n                        authToken,\n                        name: onboardingName,\n                        bio: style?.bio ?? ["An autonomous AI agent."],\n                        onProgress: (status, detail) => {\n                            console.log(`[Sandbox] ${status}: ${detail ?? ""}`);\n                        },\n                    });\n                    client.setBaseUrl(provisionedAgent.bridgeUrl);',
    );

    next = next.replace(
      '                            kind: "cloud",\n                            apiBase: cloudApiBase,\n                            accessToken: authToken,',
      '                            kind: "cloud",\n                            apiBase: provisionedAgent.bridgeUrl,\n                            accessToken: authToken,',
    );

    return next;
  }) || changed;

changed =
  patchFile(clientCloudPath, (source) => {
    let next = source;

    if (!next.includes('from "@capacitor/core"')) {
      next = next.replace(
        'import { ElizaClient } from "./client-base";',
        'import { Capacitor, CapacitorHttp } from "@capacitor/core";\nimport { ElizaClient } from "./client-base";',
      );
    }

    if (!next.includes("function shouldUseNativeCloudHttp")) {
      next = next.replace(
        "// ---------------------------------------------------------------------------\n// Prototype augmentation",
        'function shouldUseNativeCloudHttp() {\n    return Capacitor.isNativePlatform();\n}\nfunction generateCloudLoginSessionId() {\n    if (typeof globalThis.crypto?.randomUUID === "function")\n        return globalThis.crypto.randomUUID();\n    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;\n}\n// ---------------------------------------------------------------------------\n// Prototype augmentation',
      );
    }

    if (!next.includes("DEFAULT_DIRECT_CLOUD_API_BASE_URL")) {
      next = next.replace(
        "const AGENT_TRANSFER_MIN_PASSWORD_LENGTH = 4;\n",
        'const AGENT_TRANSFER_MIN_PASSWORD_LENGTH = 4;\nconst DEFAULT_DIRECT_CLOUD_BASE_URL = "https://www.elizacloud.ai";\nconst DEFAULT_DIRECT_CLOUD_API_BASE_URL = "https://api.elizacloud.ai";\nconst DIRECT_ELIZA_CLOUD_WEB_HOSTS = new Set([\n    "elizacloud.ai",\n    "www.elizacloud.ai",\n    "dev.elizacloud.ai",\n]);\nconst DIRECT_ELIZA_CLOUD_API_HOST = "api.elizacloud.ai";\n',
      );
    }

    if (!next.includes("function resolveDirectCloudAuthApiBase")) {
      next = next.replace(
        "// ---------------------------------------------------------------------------\n// Prototype augmentation",
        'function resolveDirectCloudWebBase(cloudBase) {\n    const normalized = cloudBase.replace(/\\/+$/, "");\n    try {\n        const host = new URL(normalized).hostname.toLowerCase();\n        if (host === DIRECT_ELIZA_CLOUD_API_HOST) {\n            return DEFAULT_DIRECT_CLOUD_BASE_URL;\n        }\n    }\n    catch {\n        // Fall back to the provided base below.\n    }\n    return normalized;\n}\nfunction resolveDirectCloudAuthApiBase(cloudBase) {\n    const normalized = cloudBase.replace(/\\/+$/, "");\n    try {\n        const host = new URL(normalized).hostname.toLowerCase();\n        if (host === DIRECT_ELIZA_CLOUD_API_HOST || DIRECT_ELIZA_CLOUD_WEB_HOSTS.has(host)) {\n            return DEFAULT_DIRECT_CLOUD_API_BASE_URL;\n        }\n    }\n    catch {\n        // Fall back to the provided base below.\n    }\n    return normalized;\n}\n// ---------------------------------------------------------------------------\n// Prototype augmentation',
      );
    }

    if (!next.includes("function isDirectCloudBase")) {
      next = next.replace(
        "// ---------------------------------------------------------------------------\n// Prototype augmentation",
        'function originsMatch(left, right) {\n    try {\n        return new URL(left).origin === new URL(right).origin;\n    }\n    catch {\n        return false;\n    }\n}\nfunction isDirectCloudBase(client) {\n    const baseUrl = client.getBaseUrl().trim();\n    if (!baseUrl)\n        return false;\n    if (originsMatch(baseUrl, DEFAULT_DIRECT_CLOUD_API_BASE_URL) || originsMatch(baseUrl, DEFAULT_DIRECT_CLOUD_BASE_URL))\n        return true;\n    try {\n        const host = new URL(baseUrl).hostname.toLowerCase();\n        return host === DIRECT_ELIZA_CLOUD_API_HOST || DIRECT_ELIZA_CLOUD_WEB_HOSTS.has(host);\n    }\n    catch {\n        return false;\n    }\n}\nfunction stringOrNull(value) {\n    return typeof value === "string" && value.trim() ? value : null;\n}\nfunction toCloudCompatAgent(input) {\n    const id = stringOrNull(input.agentId) ?? stringOrNull(input.id) ?? "";\n    const agentName = stringOrNull(input.agentName) ?? stringOrNull(input.name) ?? id;\n    const bridgeUrl = input.bridgeUrl ?? input.bridge_url ?? null;\n    const webUiUrl = input.webUiUrl ?? input.web_ui_url ?? null;\n    const createdAt = stringOrNull(input.createdAt) ?? stringOrNull(input.created_at) ?? new Date(0).toISOString();\n    const updatedAt = stringOrNull(input.updatedAt) ?? stringOrNull(input.updated_at) ?? createdAt;\n    return {\n        agent_id: id,\n        agent_name: agentName,\n        node_id: null,\n        container_id: null,\n        headscale_ip: null,\n        bridge_url: bridgeUrl,\n        web_ui_url: webUiUrl,\n        status: stringOrNull(input.status) ?? "unknown",\n        agent_config: input.agentConfig ?? input.agent_config ?? {},\n        created_at: createdAt,\n        updated_at: updatedAt,\n        containerUrl: input.containerUrl ?? bridgeUrl ?? "",\n        webUiUrl,\n        database_status: stringOrNull(input.databaseStatus) ?? stringOrNull(input.database_status) ?? "unknown",\n        error_message: input.errorMessage ?? input.error_message ?? null,\n        last_heartbeat_at: input.lastHeartbeatAt ?? input.last_heartbeat_at ?? null,\n    };\n}\nfunction toCloudCompatJob(input) {\n    const status = (() => {\n        switch (input.status) {\n            case "completed":\n            case "failed":\n            case "retrying":\n                return input.status;\n            case "in_progress":\n            case "processing":\n                return "processing";\n            default:\n                return "queued";\n        }\n    })();\n    const id = stringOrNull(input.id) ?? "";\n    const createdAt = stringOrNull(input.createdAt) ?? new Date(0).toISOString();\n    const completedAt = input.completedAt ?? null;\n    return {\n        jobId: id,\n        type: stringOrNull(input.type) ?? "agent_provision",\n        status,\n        data: {},\n        result: input.result ?? null,\n        error: input.error ?? null,\n        createdAt,\n        startedAt: input.startedAt ?? null,\n        completedAt,\n        retryCount: input.attempts ?? 0,\n        id,\n        name: stringOrNull(input.type) ?? "agent_provision",\n        state: status,\n        created_on: createdAt,\n        completed_on: completedAt,\n    };\n}\n// ---------------------------------------------------------------------------\n// Prototype augmentation',
      );
    }

    next = replaceAnyPrototypeFunction(
      next,
      "getCloudCompatAgents",
      'ElizaClient.prototype.getCloudCompatAgents = async function () {\n    if (isDirectCloudBase(this)) {\n        const response = await this.fetch("/api/v1/eliza/agents");\n        return {\n            success: response.success,\n            data: (response.data ?? []).map(toCloudCompatAgent),\n        };\n    }\n    return this.fetch("/api/cloud/compat/agents");\n};',
    );

    next = replaceAnyPrototypeFunction(
      next,
      "createCloudCompatAgent",
      'ElizaClient.prototype.createCloudCompatAgent = async function (opts) {\n    if (isDirectCloudBase(this)) {\n        const response = await this.fetch("/api/v1/eliza/agents", {\n            method: "POST",\n            body: JSON.stringify({\n                agentName: opts.agentName,\n                ...(opts.agentConfig ? { agentConfig: opts.agentConfig } : {}),\n                ...(opts.environmentVars ? { environmentVars: opts.environmentVars } : {}),\n            }),\n        });\n        const agentId = response.data?.id ?? "";\n        return {\n            success: response.success,\n            data: {\n                agentId,\n                agentName: response.data?.agentName ?? opts.agentName,\n                jobId: "",\n                status: response.data?.status ?? "pending",\n                nodeId: null,\n                message: response.success ? "Agent created" : (response.error ?? ""),\n            },\n        };\n    }\n    return this.fetch("/api/cloud/compat/agents", {\n        method: "POST",\n        body: JSON.stringify(opts),\n    });\n};',
    );

    next = replaceAnyPrototypeFunction(
      next,
      "provisionCloudCompatAgent",
      'ElizaClient.prototype.provisionCloudCompatAgent = async function (agentId) {\n    if (isDirectCloudBase(this)) {\n        return this.fetch(`/api/v1/eliza/agents/${encodeURIComponent(agentId)}/provision`, { method: "POST" }, { allowNonOk: true });\n    }\n    return this.fetch(`/api/cloud/v1/app/agents/${encodeURIComponent(agentId)}/provision`, { method: "POST" }, { allowNonOk: true });\n};',
    );

    next = replaceAnyPrototypeFunction(
      next,
      "getCloudCompatAgent",
      "ElizaClient.prototype.getCloudCompatAgent = async function (agentId) {\n    if (isDirectCloudBase(this)) {\n        const response = await this.fetch(`/api/v1/eliza/agents/${encodeURIComponent(agentId)}`);\n        return {\n            success: response.success,\n            data: toCloudCompatAgent(response.data ?? { id: agentId }),\n        };\n    }\n    return this.fetch(`/api/cloud/compat/agents/${encodeURIComponent(agentId)}`);\n};",
    );

    next = replaceAnyPrototypeFunction(
      next,
      "getCloudCompatJobStatus",
      "ElizaClient.prototype.getCloudCompatJobStatus = async function (jobId) {\n    if (isDirectCloudBase(this)) {\n        const response = await this.fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`);\n        return {\n            success: response.success,\n            data: toCloudCompatJob(response.data ?? { id: jobId }),\n        };\n    }\n    return this.fetch(`/api/cloud/compat/jobs/${encodeURIComponent(jobId)}`);\n};",
    );

    next = replacePrototypeFunction(
      next,
      "cloudLoginDirect",
      'ElizaClient.prototype.cloudLoginDirect = async function (cloudApiBase) {\n    const sessionId = generateCloudLoginSessionId();\n    const cloudWebBase = resolveDirectCloudWebBase(cloudApiBase);\n    const authApiBase = resolveDirectCloudAuthApiBase(cloudApiBase);\n    try {\n        if (shouldUseNativeCloudHttp()) {\n            const res = await CapacitorHttp.post({\n                url: `${authApiBase}/api/auth/cli-session`,\n                headers: { "Content-Type": "application/json" },\n                data: { sessionId },\n                responseType: "json",\n                connectTimeout: 10000,\n                readTimeout: 10000,\n            });\n            if (res.status < 200 || res.status >= 300) {\n                return { ok: false, error: `Login failed (${res.status})` };\n            }\n            return {\n                ok: true,\n                apiBase: authApiBase,\n                sessionId,\n                browserUrl: `${cloudWebBase}/auth/cli-login?session=${encodeURIComponent(sessionId)}`,\n            };\n        }\n        const res = await fetch(`${authApiBase}/api/auth/cli-session`, {\n            method: "POST",\n            headers: { "Content-Type": "application/json" },\n            body: JSON.stringify({ sessionId }),\n        });\n        if (!res.ok) {\n            return { ok: false, error: `Login failed (${res.status})` };\n        }\n        return {\n            ok: true,\n            apiBase: authApiBase,\n            sessionId,\n            browserUrl: `${cloudWebBase}/auth/cli-login?session=${encodeURIComponent(sessionId)}`,\n        };\n    }\n    catch (err) {\n        return {\n            ok: false,\n            error: `Failed to reach Eliza Cloud: ${err instanceof Error ? err.message : String(err)}`,\n        };\n    }\n};',
    );

    next = replacePrototypeFunction(
      next,
      "cloudLoginPollDirect",
      'ElizaClient.prototype.cloudLoginPollDirect = async function (cloudApiBase, sessionId) {\n    const authApiBase = resolveDirectCloudAuthApiBase(cloudApiBase);\n    try {\n        let status;\n        let data;\n        if (shouldUseNativeCloudHttp()) {\n            const res = await CapacitorHttp.get({\n                url: `${authApiBase}/api/auth/cli-session/${encodeURIComponent(sessionId)}`,\n                responseType: "json",\n                connectTimeout: 10000,\n                readTimeout: 10000,\n            });\n            status = res.status;\n            data = typeof res.data === "object" && res.data !== null ? res.data : {};\n        }\n        else {\n            const res = await fetch(`${authApiBase}/api/auth/cli-session/${encodeURIComponent(sessionId)}`);\n            status = res.status;\n            if (!res.ok) {\n                if (res.status === 404) {\n                    return {\n                        status: "expired",\n                        error: "Auth session expired or not found",\n                    };\n                }\n                return {\n                    status: "error",\n                    error: `Poll failed (${res.status})`,\n                };\n            }\n            data = await res.json();\n        }\n        if (status < 200 || status >= 300) {\n            if (status === 404) {\n                return {\n                    status: "expired",\n                    error: "Auth session expired or not found",\n                };\n            }\n            return {\n                status: "error",\n                error: `Poll failed (${status})`,\n            };\n        }\n        if (data.status === "authenticated" && data.apiKey) {\n            return {\n                status: "authenticated",\n                organizationId: data.organizationId,\n                token: data.apiKey,\n                userId: data.userId,\n            };\n        }\n        return { status: data.status ?? "pending" };\n    }\n    catch {\n        return { status: "error", error: "Poll request failed" };\n    }\n};',
    );

    return next;
  }) || changed;

changed =
  patchFile(runMobileBuildPath, (source) => {
    if (source.includes('["CapacitorBrowser", "@capacitor/browser"]')) {
      return source;
    }

    return source.replace(
      /(\s+\["CapacitorKeyboard", "@capacitor\/keyboard"\],\n)(\s*\];)/,
      '$1  ["CapacitorBrowser", "@capacitor/browser"],\n$2',
    );
  }) || changed;

if (!changed) {
  console.log(`${LOG_PREFIX} package native browser path already compatible.`);
}
