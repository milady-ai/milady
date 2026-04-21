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
    const sessionStore = memoryStorage();
    const localStore = memoryStorage();
    const mockWindow = {
      sessionStorage: sessionStore,
      localStorage: localStore,
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

  it("resolves same-origin request paths to absolute URLs when no base is configured", async () => {
    const { setBootConfig, DEFAULT_BOOT_CONFIG } = await import(
      "../config/boot-config"
    );
    const { MiladyClient } = await import("./client-base");

    class TestClient extends MiladyClient {
      request(path: string): Promise<Response> {
        return this.rawRequest(path);
      }
    }

    const mockWindow = globalThis.window as MockWindow & {
      __MILADY_API_BASE__?: string;
      location: Window["location"] & { origin?: string };
    };
    delete mockWindow.__MILADY_API_BASE__;
    mockWindow.location.origin = "http://127.0.0.1:2138";
    setBootConfig(DEFAULT_BOOT_CONFIG);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    const client = new TestClient();
    await client.request("/api/lifeops/activity-signals");

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:2138/api/lifeops/activity-signals",
      expect.any(Object),
    );
  });

  it("aborts timed-out requests instead of leaving fetches pending", async () => {
    vi.useFakeTimers();
    try {
      const { setBootConfig, DEFAULT_BOOT_CONFIG } = await import(
        "../config/boot-config"
      );
      const { MiladyClient } = await import("./client-base");

      class TestClient extends MiladyClient {
        request(path: string, timeoutMs: number): Promise<Response> {
          return this.rawRequest(path, undefined, { timeoutMs });
        }
      }

      setBootConfig(DEFAULT_BOOT_CONFIG);
      let aborted = false;
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_input: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                aborted = true;
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          }),
      );

      const client = new TestClient();
      const request = expect(
        client.request("/api/slow", 50),
      ).rejects.toMatchObject({
        kind: "timeout",
        path: "/api/slow",
      });

      await vi.advanceTimersByTimeAsync(50);

      await request;
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
