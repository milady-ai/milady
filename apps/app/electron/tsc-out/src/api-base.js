"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeApiBase = normalizeApiBase;
exports.resolveExternalApiBase = resolveExternalApiBase;
exports.createApiBaseInjectionScript = createApiBaseInjectionScript;
exports.createApiBaseInjector = createApiBaseInjector;
const EXTERNAL_API_BASE_ENV_KEYS = [
  // Test override must win so e2e runs are deterministic regardless of host env.
  "MILADY_ELECTRON_TEST_API_BASE",
  "MILADY_ELECTRON_API_BASE",
  "MILADY_API_BASE_URL",
  "MILADY_API_BASE",
];
function readEnvValue(env, key) {
  const value = env[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
function normalizeApiBase(raw) {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch (_a) {
    return null;
  }
}
function resolveExternalApiBase(env) {
  const invalidSources = [];
  for (const key of EXTERNAL_API_BASE_ENV_KEYS) {
    const rawValue = readEnvValue(env, key);
    if (!rawValue) continue;
    const normalized = normalizeApiBase(rawValue);
    if (normalized) {
      return {
        base: normalized,
        source: key,
        invalidSources,
      };
    }
    invalidSources.push(key);
  }
  return {
    base: null,
    source: null,
    invalidSources,
  };
}
function createApiBaseInjectionScript(base, apiToken) {
  const trimmedToken =
    apiToken === null || apiToken === void 0 ? void 0 : apiToken.trim();
  const tokenSnippet = trimmedToken
    ? `window.__MILADY_API_TOKEN__ = ${JSON.stringify(trimmedToken)};`
    : "";
  const baseSnippet = `window.__MILADY_API_BASE__ = ${JSON.stringify(base)};`;
  return `${baseSnippet}${tokenSnippet}`;
}
function createApiBaseInjector(target, options = {}) {
  let lastInjectedBase = null;
  return {
    async inject(base) {
      var _a, _b, _c;
      if (!base || target.isDestroyed()) return false;
      const script = createApiBaseInjectionScript(
        base,
        (_a = options.getApiToken) === null || _a === void 0
          ? void 0
          : _a.call(options),
      );
      try {
        await target.executeJavaScript(script);
        lastInjectedBase = base;
        (_b = options.onInjected) === null || _b === void 0
          ? void 0
          : _b.call(options);
        return true;
      } catch (err) {
        (_c = options.onInjectionError) === null || _c === void 0
          ? void 0
          : _c.call(options, err);
        return false;
      }
    },
    getLastInjectedBase() {
      return lastInjectedBase;
    },
  };
}
