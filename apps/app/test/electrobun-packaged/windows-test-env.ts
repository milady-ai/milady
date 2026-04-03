export function createPackagedWindowsAppEnv(args: {
  baseEnv: NodeJS.ProcessEnv;
  apiBase: string;
  appData: string;
  localAppData: string;
}): NodeJS.ProcessEnv {
  return {
    ...args.baseEnv,
    MILADY_DESKTOP_TEST_API_BASE: args.apiBase,
    // Redirect both Windows profile roots so the packaged shell does not
    // reuse stale CEF/runtime state from the host machine.
    APPDATA: args.appData,
    LOCALAPPDATA: args.localAppData,
  };
}
