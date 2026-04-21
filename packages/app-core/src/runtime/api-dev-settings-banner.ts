import process from "node:process";
import { prependDevSubsystemFigletHeading } from "@miladyai/shared/dev-settings-figlet-heading";
import {
  type DevSettingsRow,
  formatDevSettingsTable,
} from "@miladyai/shared/dev-settings-table";
import {
  firstWinningEnvString,
  MILADY_RUNTIME_ENV_KEYS,
  resolveApiSecurityConfig,
  resolveApiToken,
} from "@miladyai/shared/runtime-env";

function summarizeList(label: string, items: string[], maxLen: number): string {
  if (items.length === 0) return `${label}: (empty)`;
  const joined = items.join(", ");
  if (joined.length <= maxLen) return `${label}: ${joined}`;
  return `${label}: ${joined.slice(0, maxLen - 1)}…`;
}

/**
 * After `startApiServer` resolves — uses actual listen port and post-start env (token may be generated).
 */
export function formatApiDevSettingsBannerText(
  actualPort: number,
  options?: { hadUserApiTokenInEnv: boolean },
): string {
  const env = process.env as Record<string, string | undefined>;
  const sec = resolveApiSecurityConfig(env);
  const token = resolveApiToken(env);
  const hadUser = options?.hadUserApiTokenInEnv ?? false;

  const bindWin = firstWinningEnvString(env, MILADY_RUNTIME_ENV_KEYS.apiBind);
  const originsWin = firstWinningEnvString(
    env,
    MILADY_RUNTIME_ENV_KEYS.allowedOrigins,
  );
  const hostsWin = firstWinningEnvString(
    env,
    MILADY_RUNTIME_ENV_KEYS.allowedHosts,
  );

  const rows: DevSettingsRow[] = [
    {
      setting: "Listen (actual)",
      effective: `${sec.bindHost}:${actualPort}`,
      source: "derived — process bound",
      change:
        "set MILADY_API_BIND / ELIZA_API_BIND and MILADY_API_PORT / ELIZA_* before start",
    },
    {
      setting: "MILADY_API_BIND / ELIZA_API_BIND",
      effective: sec.bindHost,
      source: bindWin
        ? `env set — ${bindWin.key}=${bindWin.value}`
        : `default (unset — ${sec.bindHost})`,
      change:
        "export MILADY_API_BIND=127.0.0.1 (or ELIZA_API_BIND); unset both for default",
    },
    {
      setting: "MILADY_API_TOKEN / ELIZA_API_TOKEN",
      effective: token ? "set (redacted)" : "unset",
      source: token
        ? hadUser
          ? `env set — ${firstWinningEnvString(env, MILADY_RUNTIME_ENV_KEYS.apiToken)?.key ?? "MILADY_API_TOKEN"}`
          : "generated — non-loopback or cloud (ensureApiTokenForBindHost)"
        : "default (unset — loopback dev)",
      change:
        "export MILADY_API_TOKEN=<secret> or unset; MILADY_DISABLE_AUTO_API_TOKEN=1 disables auto token",
    },
    {
      setting: "MILADY_ALLOWED_ORIGINS / CORS",
      effective: summarizeList("origins", sec.allowedOrigins, 40),
      source: originsWin
        ? `env set — ${originsWin.key}`
        : "default (unset — empty list)",
      change:
        "export MILADY_ALLOWED_ORIGINS=a,b (or ELIZA_ALLOWED_ORIGINS, CORS_ORIGINS)",
    },
    {
      setting: "MILADY_ALLOWED_HOSTS",
      effective: summarizeList("hosts", sec.allowedHosts, 40),
      source: hostsWin
        ? `env set — ${hostsWin.key}`
        : "default (unset — empty list)",
      change:
        "export MILADY_ALLOWED_HOSTS=host1,host2 (or ELIZA_ALLOWED_HOSTS)",
    },
    {
      setting: "MILADY_ALLOW_NULL_ORIGIN / ELIZA_ALLOW_NULL_ORIGIN",
      effective: sec.allowNullOrigin ? "on" : "off",
      source: sec.allowNullOrigin
        ? "env set — flag enabled"
        : "default (unset — off)",
      change:
        "export MILADY_ALLOW_NULL_ORIGIN=1 to allow; unset to default off",
    },
    {
      setting: "MILADY_DISABLE_AUTO_API_TOKEN",
      effective: sec.disableAutoApiToken ? "on" : "off",
      source: sec.disableAutoApiToken
        ? "env set — flag enabled"
        : "default (unset — off)",
      change: "export MILADY_DISABLE_AUTO_API_TOKEN=1 to skip auto token",
    },
    {
      setting: "MILADY_RENDERER_URL",
      effective: env.MILADY_RENDERER_URL?.trim() || "—",
      source: env.MILADY_RENDERER_URL?.trim()
        ? "env set — MILADY_RENDERER_URL"
        : "default (unset)",
      change:
        "export MILADY_RENDERER_URL=http://127.0.0.1:<vite>/ (desktop dev)",
    },
    {
      setting: "MILADY_DESKTOP_DEV_LOG_PATH",
      effective: env.MILADY_DESKTOP_DEV_LOG_PATH?.trim() || "—",
      source: env.MILADY_DESKTOP_DEV_LOG_PATH?.trim()
        ? "env set — orchestrator forwarded"
        : "default (unset)",
      change:
        "set by dev orchestrator; GET /api/dev/console-log tails this file",
    },
    {
      setting: "Dev hooks",
      effective:
        "/api/dev/stack, /api/dev/console-log, /api/dev/cursor-screenshot",
      source: "derived — dev server",
      change: `GET http://127.0.0.1:${actualPort}/api/dev/stack etc.; docs/apps/desktop-local-development.md`,
    },
  ];

  return prependDevSubsystemFigletHeading(
    "api",
    formatDevSettingsTable("API — effective settings (after listen)", rows),
  );
}
