const DEV_ENV_KEYS_TO_STRIP = [
  "ELIZA_API_PORT",
  "MILADY_API_BASE",
  "MILADY_DESKTOP_API_BASE",
  "MILADY_DESKTOP_TEST_PARTITION",
  "MILADY_RENDERER_URL",
  "MILADY_STARTUP_SESSION_ID",
  "MILADY_TEST_WINDOWS_APPDATA_PATH",
  "MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH",
  "MILADY_TEST_WINDOWS_LAUNCHER_PATH",
  "VITE_DEV_SERVER_URL",
] as const;

interface CreatePackagedWindowsAppEnvOptions {
  baseEnv: Record<string, string>;
  apiBase: string;
  appData: string;
}

/**
 * Build a clean process.env for packaged Windows app tests by stripping
 * dev/stale desktop overrides from baseEnv and injecting packaged-app vars.
 */
export function createPackagedWindowsAppEnv({
  baseEnv,
  apiBase,
  appData,
}: CreatePackagedWindowsAppEnvOptions): Record<string, string> {
  const env: Record<string, string> = { ...baseEnv };

  for (const key of DEV_ENV_KEYS_TO_STRIP) {
    delete env[key];
  }

  env.MILADY_DESKTOP_TEST_API_BASE = apiBase;
  env.MILADY_DISABLE_LOCAL_EMBEDDINGS = "1";
  env.ELECTROBUN_CONSOLE = "1";
  env.APPDATA = appData;

  return env;
}
