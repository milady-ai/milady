const STRIPPED_ENV_KEYS = [
  "ELIZA_API_PORT",
  "ELIZA_PORT",
  "MILADY_API_BASE",
  "MILADY_API_BASE_URL",
  "MILADY_API_PORT",
  "MILADY_DESKTOP_API_BASE",
  "MILADY_DESKTOP_TEST_PARTITION",
  "MILADY_RENDERER_URL",
  "MILADY_STARTUP_EVENTS_FILE",
  "MILADY_STARTUP_SESSION_ID",
  "MILADY_STARTUP_STATE_FILE",
  "MILADY_TEST_WINDOWS_APPDATA_PATH",
  "MILADY_TEST_WINDOWS_BACKEND_PORT",
  "MILADY_TEST_WINDOWS_INSTALL_DIR",
  "MILADY_TEST_WINDOWS_LAUNCHER_PATH",
  "MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH",
  "MILADY_WINDOWS_SMOKE_REQUIRE_INSTALLER",
  "VITE_DEV_SERVER_URL",
] as const;

export function createPackagedWindowsAppEnv(args: {
  baseEnv: NodeJS.ProcessEnv;
  apiBase: string;
  appData: string;
}): NodeJS.ProcessEnv {
  const env = {
    ...args.baseEnv,
  };

  for (const key of STRIPPED_ENV_KEYS) {
    delete env[key];
  }

  return {
    ...env,
    MILADY_DESKTOP_TEST_API_BASE: args.apiBase,
    MILADY_DISABLE_LOCAL_EMBEDDINGS: "1",
    ELECTROBUN_CONSOLE: "1",
    // Match the last known-good release harness: isolate Roaming AppData
    // without relocating LocalAppData.
    APPDATA: args.appData,
  };
}
