import { describe, expect, it } from "vitest";

import { createPackagedWindowsAppEnv } from "./windows-test-env";

describe("createPackagedWindowsAppEnv", () => {
  it("isolates packaged bootstrap tests from stale desktop env overrides", () => {
    const env = createPackagedWindowsAppEnv({
      baseEnv: {
        APPDATA: "C:\\Users\\runner\\AppData\\Roaming",
        ELIZA_API_PORT: "31337",
        LOCALAPPDATA: "C:\\Users\\runner\\AppData\\Local",
        KEEP_ME: "1",
        MILADY_API_BASE: "http://127.0.0.1:31337",
        MILADY_DESKTOP_API_BASE: "http://127.0.0.1:31337",
        MILADY_DESKTOP_TEST_PARTITION: "persist:stale",
        MILADY_RENDERER_URL: "http://127.0.0.1:5173",
        MILADY_STARTUP_SESSION_ID: "stale-session",
        MILADY_TEST_WINDOWS_APPDATA_PATH: "C:\\stale\\roaming",
        MILADY_TEST_WINDOWS_LAUNCHER_PATH: "C:\\mi\\bin\\launcher.exe",
        VITE_DEV_SERVER_URL: "http://127.0.0.1:5174",
      },
      apiBase: "http://127.0.0.1:43123",
      appData: "C:\\tmp\\milady-roaming",
      localAppData: "C:\\tmp\\milady-local",
    });

    expect(env.MILADY_DESKTOP_TEST_API_BASE).toBe("http://127.0.0.1:43123");
    expect(env.MILADY_DESKTOP_TEST_PARTITION).toBe("bootstrap-isolated");
    expect(env.MILADY_DISABLE_LOCAL_EMBEDDINGS).toBe("1");
    expect(env.ELECTROBUN_CONSOLE).toBe("1");
    expect(env.APPDATA).toBe("C:\\tmp\\milady-roaming");
    expect(env.LOCALAPPDATA).toBe("C:\\tmp\\milady-local");
    expect(env.KEEP_ME).toBe("1");
    expect(env.ELIZA_API_PORT).toBeUndefined();
    expect(env.MILADY_API_BASE).toBeUndefined();
    expect(env.MILADY_DESKTOP_API_BASE).toBeUndefined();
    expect(env.MILADY_RENDERER_URL).toBeUndefined();
    expect(env.MILADY_STARTUP_SESSION_ID).toBeUndefined();
    expect(env.MILADY_TEST_WINDOWS_APPDATA_PATH).toBeUndefined();
    expect(env.MILADY_TEST_WINDOWS_LAUNCHER_PATH).toBeUndefined();
    expect(env.VITE_DEV_SERVER_URL).toBeUndefined();
  });
});
