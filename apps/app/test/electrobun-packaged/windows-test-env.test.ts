import { describe, expect, it } from "vitest";

import { createPackagedWindowsAppEnv } from "./windows-test-env";

describe("createPackagedWindowsAppEnv", () => {
  it("overrides both Windows profile roots for packaged bootstrap tests", () => {
    const env = createPackagedWindowsAppEnv({
      baseEnv: {
        APPDATA: "C:\\Users\\runner\\AppData\\Roaming",
        LOCALAPPDATA: "C:\\Users\\runner\\AppData\\Local",
        KEEP_ME: "1",
      },
      apiBase: "http://127.0.0.1:43123",
      appData: "C:\\tmp\\milady-roaming",
      localAppData: "C:\\tmp\\milady-local",
    });

    expect(env.MILADY_DESKTOP_TEST_API_BASE).toBe("http://127.0.0.1:43123");
    expect(env.APPDATA).toBe("C:\\tmp\\milady-roaming");
    expect(env.LOCALAPPDATA).toBe("C:\\tmp\\milady-local");
    expect(env.KEEP_ME).toBe("1");
  });
});
