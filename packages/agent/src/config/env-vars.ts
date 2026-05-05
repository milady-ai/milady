import type { ElizaConfig } from "./types.js";

/**
 * Environment variable keys that must NEVER be synced from config → process.env.
 *
 * Mirrors the BLOCKED_ENV_KEYS set in server.ts.  This is a defense-in-depth
 * gate: even if a blocked key is somehow persisted into eliza.config.json
 * (e.g. via an API bypass or manual file edit), it will not be loaded into the
 * process environment on startup.
 *
 * Categories:
 *   - Process-level code injection (NODE_OPTIONS, LD_PRELOAD, …)
 *   - TLS / proxy hijack (NODE_TLS_REJECT_UNAUTHORIZED, HTTP_PROXY, …)
 *   - Module resolution (NODE_PATH)
 *   - Privilege escalation tokens (ELIZA_API_TOKEN, …)
 *   - Wallet private keys
 *   - System paths
 */
const BLOCKED_STARTUP_ENV_KEYS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS",
  "NODE_EXTRA_CA_CERTS",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "NODE_PATH",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "CURL_CA_BUNDLE",
  "PATH",
  "HOME",
  "SHELL",
  "MILADY_API_TOKEN",
  "ELIZA_API_TOKEN",
  "MILADY_WALLET_EXPORT_TOKEN",
  "ELIZA_WALLET_EXPORT_TOKEN",
  "MILADY_TERMINAL_RUN_TOKEN",
  "ELIZA_TERMINAL_RUN_TOKEN",
  "HYPERSCAPE_AUTH_TOKEN",
  "EVM_PRIVATE_KEY",
  "SOLANA_PRIVATE_KEY",
  "GITHUB_TOKEN",
  "DATABASE_URL",
  "POSTGRES_URL",
]);

/**
 * Maps connector config fields to the environment variables expected by
 * elizaOS plugins. Keep this aligned with runtime/eliza.ts.
 */
export const CONNECTOR_ENV_MAP: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  discord: {
    token: "DISCORD_API_TOKEN",
    botToken: "DISCORD_API_TOKEN",
    applicationId: "DISCORD_APPLICATION_ID",
  },
  telegram: {
    botToken: "TELEGRAM_BOT_TOKEN",
  },
  telegramAccount: {
    phone: "TELEGRAM_ACCOUNT_PHONE",
    appId: "TELEGRAM_ACCOUNT_APP_ID",
    appHash: "TELEGRAM_ACCOUNT_APP_HASH",
    deviceModel: "TELEGRAM_ACCOUNT_DEVICE_MODEL",
    systemVersion: "TELEGRAM_ACCOUNT_SYSTEM_VERSION",
  },
  slack: {
    botToken: "SLACK_BOT_TOKEN",
    appToken: "SLACK_APP_TOKEN",
    userToken: "SLACK_USER_TOKEN",
  },
  signal: {
    authDir: "SIGNAL_AUTH_DIR",
    account: "SIGNAL_ACCOUNT_NUMBER",
    httpUrl: "SIGNAL_HTTP_URL",
    cliPath: "SIGNAL_CLI_PATH",
  },
  whatsapp: {
    authDir: "WHATSAPP_AUTH_DIR",
    sessionPath: "WHATSAPP_AUTH_DIR",
    dmPolicy: "WHATSAPP_DM_POLICY",
    groupPolicy: "WHATSAPP_GROUP_POLICY",
  },
  msteams: {
    appId: "MSTEAMS_APP_ID",
    appPassword: "MSTEAMS_APP_PASSWORD",
  },
  mattermost: {
    botToken: "MATTERMOST_BOT_TOKEN",
    baseUrl: "MATTERMOST_BASE_URL",
  },
  googlechat: {
    serviceAccountKey: "GOOGLE_CHAT_SERVICE_ACCOUNT_KEY",
  },
  blooio: {
    apiKey: "BLOOIO_API_KEY",
    fromNumber: "BLOOIO_PHONE_NUMBER",
    webhookSecret: "BLOOIO_WEBHOOK_SECRET",
    webhookUrl: "BLOOIO_WEBHOOK_URL",
    webhookPort: "BLOOIO_WEBHOOK_PORT",
  },
};

export function collectConfigEnvVars(
  cfg?: ElizaConfig,
): Record<string, string> {
  const envConfig = cfg?.env;
  if (!envConfig) {
    return {};
  }

  const entries: Record<string, string> = {};

  if (envConfig.vars) {
    for (const [key, value] of Object.entries(envConfig.vars)) {
      if (!value) {
        continue;
      }
      if (BLOCKED_STARTUP_ENV_KEYS.has(key.toUpperCase())) {
        continue;
      }
      entries[key] = value as string;
    }
  }

  for (const [key, value] of Object.entries(envConfig)) {
    if (key === "shellEnv" || key === "vars") {
      continue;
    }
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    if (BLOCKED_STARTUP_ENV_KEYS.has(key.toUpperCase())) {
      continue;
    }
    entries[key] = value;
  }

  return entries;
}

export function collectConnectorEnvVars(
  cfg?: ElizaConfig,
): Record<string, string> {
  const rawConnectors =
    cfg?.connectors ?? (cfg as Record<string, unknown> | undefined)?.channels;
  if (
    !rawConnectors ||
    typeof rawConnectors !== "object" ||
    Array.isArray(rawConnectors)
  ) {
    return {};
  }

  const connectors = rawConnectors as Record<string, unknown>;
  const entries: Record<string, string> = {};

  for (const [connectorName, envMap] of Object.entries(CONNECTOR_ENV_MAP)) {
    const connectorConfig = connectors[connectorName];
    if (
      !connectorConfig ||
      typeof connectorConfig !== "object" ||
      Array.isArray(connectorConfig)
    ) {
      continue;
    }

    const configObj = connectorConfig as Record<string, unknown>;

    // Mirror Discord token aliases so older plugins and settings surfaces
    // agree on a single configured state.
    if (connectorName === "discord") {
      const tokenValue =
        (typeof configObj.token === "string" && configObj.token.trim()) ||
        (typeof configObj.botToken === "string" && configObj.botToken.trim()) ||
        "";
      if (tokenValue) {
        entries.DISCORD_API_TOKEN = tokenValue;
        entries.DISCORD_BOT_TOKEN = tokenValue;
      }

      const intents =
        configObj.intents &&
        typeof configObj.intents === "object" &&
        !Array.isArray(configObj.intents)
          ? (configObj.intents as Record<string, unknown>)
          : undefined;
      if (intents) {
        const setIntent = (field: string, envKey: string): void => {
          const value = intents[field];
          if (typeof value === "boolean") {
            entries[envKey] = String(value);
          } else if (typeof value === "string" && value.trim()) {
            entries[envKey] = value.trim();
          }
        };

        setIntent("presence", "DISCORD_PRESENCE_INTENT");
        setIntent("guildMembers", "DISCORD_GUILD_MEMBERS_INTENT");
        setIntent("messageContent", "DISCORD_MESSAGE_CONTENT_INTENT");
      }
    }

    for (const [configField, envKey] of Object.entries(envMap)) {
      // Discord token/botToken are handled above with token-first precedence; the
      // env map maps both fields to DISCORD_API_TOKEN, so applying them here would
      // let botToken overwrite token.
      if (
        connectorName === "discord" &&
        (configField === "token" || configField === "botToken")
      ) {
        continue;
      }
      const value = configObj[configField];
      if (typeof value !== "string" || !value.trim()) {
        continue;
      }
      if (BLOCKED_STARTUP_ENV_KEYS.has(envKey.toUpperCase())) {
        continue;
      }
      entries[envKey] = value;
    }

    if (connectorName === "whatsapp") {
      const allowFrom = configObj.allowFrom;
      if (Array.isArray(allowFrom) && allowFrom.length > 0) {
        const normalized = allowFrom
          .map((value) => String(value).trim())
          .filter(Boolean);
        if (normalized.length > 0) {
          entries.WHATSAPP_ALLOW_FROM = normalized.join(",");
        }
      }

      const groupAllowFrom = configObj.groupAllowFrom;
      if (Array.isArray(groupAllowFrom) && groupAllowFrom.length > 0) {
        const normalized = groupAllowFrom
          .map((value) => String(value).trim())
          .filter(Boolean);
        if (normalized.length > 0) {
          entries.WHATSAPP_GROUP_ALLOW_FROM = normalized.join(",");
        }
      }

      const accounts = configObj.accounts;
      if (accounts && typeof accounts === "object" && !Array.isArray(accounts)) {
        const firstEnabledAccount = Object.values(
          accounts as Record<string, unknown>,
        ).find((account) => {
          if (!account || typeof account !== "object" || Array.isArray(account)) {
            return false;
          }
          const candidate = account as Record<string, unknown>;
          return candidate.enabled !== false && typeof candidate.authDir === "string";
        }) as Record<string, unknown> | undefined;

        if (
          firstEnabledAccount &&
          typeof firstEnabledAccount.authDir === "string" &&
          firstEnabledAccount.authDir.trim()
        ) {
          entries.WHATSAPP_AUTH_DIR = firstEnabledAccount.authDir.trim();
        }
      }
    }
  }

  return entries;
}
