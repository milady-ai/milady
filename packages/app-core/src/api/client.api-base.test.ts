import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockWindow = Window & {
  __MILADY_API_BASE__?: string;
  __MILADY_API_TOKEN__?: string;
};

const memoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } satisfies Storage;
};

describe("MiladyClient runtime API base/token fallback", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.resetModules();
    const storage = memoryStorage();
    const mockWindow = {
      sessionStorage: storage,
      location: {
        protocol: "http:",
        hostname: "127.0.0.1",
      },
      __MILADY_API_BASE__: "http://127.0.0.1:31337",
      __MILADY_API_TOKEN__: "milady-token",
    } as unknown as MockWindow;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: mockWindow,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  it("falls back to injected Milady globals when boot config is empty", async () => {
    const { setBootConfig, DEFAULT_BOOT_CONFIG } = await import(
      "../config/boot-config"
    );
    const { MiladyClient } = await import("./client");

    setBootConfig(DEFAULT_BOOT_CONFIG);
    const client = new MiladyClient();

    expect(client.getBaseUrl()).toBe("http://127.0.0.1:31337");
    expect(client.getRestAuthToken()).toBe("milady-token");
  });

  it("tracks injected api base changes when no explicit base is set", async () => {
    const { setBootConfig, DEFAULT_BOOT_CONFIG } = await import(
      "../config/boot-config"
    );
    const { MiladyClient } = await import("./client");

    setBootConfig(DEFAULT_BOOT_CONFIG);
    const client = new MiladyClient();

    expect(client.getBaseUrl()).toBe("http://127.0.0.1:31337");

    const mockWindow = globalThis.window as MockWindow;
    mockWindow.__MILADY_API_BASE__ = "http://127.0.0.1:41414";
    mockWindow.__MILADY_API_TOKEN__ = "rotated-token";

    expect(client.getBaseUrl()).toBe("http://127.0.0.1:41414");
    expect(client.getRestAuthToken()).toBe("rotated-token");
  });

  it("prefers boot config over stale session storage when there is no injected base", async () => {
    const { setBootConfig, DEFAULT_BOOT_CONFIG } = await import(
      "../config/boot-config"
    );
    const { MiladyClient } = await import("./client");

    const mockWindow = globalThis.window as MockWindow & {
      sessionStorage: Storage;
    };
    delete mockWindow.__MILADY_API_BASE__;
    setBootConfig({
      ...DEFAULT_BOOT_CONFIG,
      apiBase: "http://127.0.0.1:2138",
    });
    mockWindow.sessionStorage.setItem(
      "milady_api_base",
      "https://ren.example.com",
    );

    const client = new MiladyClient();

    expect(client.getBaseUrl()).toBe("http://127.0.0.1:2138");
  });

  it("keeps auth tokens in memory instead of sessionStorage", async () => {
    const { setBootConfig, DEFAULT_BOOT_CONFIG, getBootConfig } = await import(
      "../config/boot-config"
    );
    const { MiladyClient } = await import("./client");

    setBootConfig(DEFAULT_BOOT_CONFIG);
    const sessionStorage = globalThis.window.sessionStorage;
    const setItemSpy = vi.spyOn(sessionStorage, "setItem");
    const removeItemSpy = vi.spyOn(sessionStorage, "removeItem");
    const client = new MiladyClient();

    client.setToken("memory-only-token");

    expect(client.getRestAuthToken()).toBe("memory-only-token");
    expect(getBootConfig().apiToken).toBe("memory-only-token");
    expect(setItemSpy).not.toHaveBeenCalledWith(
      "milady_api_token",
      "memory-only-token",
    );
    expect(removeItemSpy).not.toHaveBeenCalledWith("milady_api_token");
  });
});
