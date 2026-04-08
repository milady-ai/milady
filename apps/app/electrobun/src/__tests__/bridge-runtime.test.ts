// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electroviewInstances = vi.fn();
const defineRpc = vi.fn();
const BOOT_CONFIG_STORE_KEY = Symbol.for("milady.app.boot-config");
const BOOT_CONFIG_WINDOW_KEY = "__MILADY_APP_BOOT_CONFIG__";

vi.mock("electrobun/view", () => {
  const Electroview = vi.fn(function MockElectroview(options: unknown) {
    electroviewInstances(options);
  }) as unknown as {
    new (options: unknown): unknown;
    defineRPC: typeof defineRpc;
  };
  Electroview.defineRPC = defineRpc;
  return { Electroview };
});

describe("electrobun bridge runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    electroviewInstances.mockReset();
    defineRpc.mockReset();
    const w = window as unknown as Record<string, unknown>;
    delete w.__MILADY_ELECTROBUN_RPC__;
    delete w.electrobun;
    delete w.__MILADY_API_BASE__;
    delete w.__MILADY_API_TOKEN__;
    delete w.__electrobun;
    delete w[BOOT_CONFIG_WINDOW_KEY];
    delete w[BOOT_CONFIG_STORE_KEY];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes only the direct Milady Electrobun RPC bridge", async () => {
    const request = {
      desktopGetVersion: vi.fn().mockResolvedValue({ version: "1.0.0" }),
      desktopOpenExternal: vi.fn(),
      rendererReportDiagnostic: vi.fn().mockResolvedValue({ ok: true }),
    };
    defineRpc.mockReturnValue({ request });

    await import("../bridge/electrobun-direct-rpc");

    expect(window.__MILADY_ELECTROBUN_RPC__.request).not.toBe(request);
    expect(typeof window.__MILADY_ELECTROBUN_RPC__.onMessage).toBe("function");
    expect(typeof window.__MILADY_ELECTROBUN_RPC__.offMessage).toBe("function");
    expect(electroviewInstances).toHaveBeenCalledTimes(1);
  });

  it("reports failed desktop RPC requests to native diagnostics", async () => {
    const request = {
      desktopGetVersion: vi.fn().mockRejectedValue(new Error("boom")),
      rendererReportDiagnostic: vi.fn().mockResolvedValue({ ok: true }),
    };
    defineRpc.mockReturnValue({ request });

    await import("../bridge/electrobun-direct-rpc");

    await expect(
      window.__MILADY_ELECTROBUN_RPC__.request.desktopGetVersion(undefined),
    ).rejects.toThrow("boom");
    expect(request.rendererReportDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        source: "rpc",
        message: expect.stringContaining("desktopGetVersion"),
      }),
    );
  });

  it("dispatches wildcard push messages to listeners and updates API globals", async () => {
    let wildcardHandler:
      | ((messageName: unknown, payload: unknown) => void)
      | undefined;
    defineRpc.mockImplementation(
      (config: {
        handlers: {
          messages: Record<
            string,
            (messageName: unknown, payload: unknown) => void
          >;
        };
      }) => {
        wildcardHandler = config.handlers.messages["*"];
        return {
          request: {
            desktopGetVersion: vi.fn().mockResolvedValue({ version: "1.0.0" }),
          },
        };
      },
    );

    await import("../bridge/electrobun-direct-rpc");

    const listener = vi.fn();
    window.__MILADY_ELECTROBUN_RPC__.onMessage("shareTargetReceived", listener);

    wildcardHandler?.("apiBaseUpdate", {
      base: "http://127.0.0.1:2138",
      token: "token-123",
    });
    expect(window.__MILADY_API_BASE__).toBe("http://127.0.0.1:2138");
    expect(window.__MILADY_API_TOKEN__).toBe("token-123");
    expect(
      (
        window as unknown as Record<PropertyKey, unknown> & {
          [BOOT_CONFIG_WINDOW_KEY]?: { apiBase?: string; apiToken?: string };
        }
      )[BOOT_CONFIG_WINDOW_KEY],
    ).toMatchObject({
      apiBase: "http://127.0.0.1:2138",
      apiToken: "token-123",
    });
    expect(
      (
        window as unknown as Record<PropertyKey, unknown> & {
          [BOOT_CONFIG_STORE_KEY]?: {
            current?: { apiBase?: string; apiToken?: string };
          };
        }
      )[BOOT_CONFIG_STORE_KEY]?.current,
    ).toMatchObject({
      apiBase: "http://127.0.0.1:2138",
      apiToken: "token-123",
    });

    wildcardHandler?.("shareTargetReceived", { files: ["note.md"] });
    expect(listener).toHaveBeenCalledWith({ files: ["note.md"] });

    window.__MILADY_ELECTROBUN_RPC__.offMessage(
      "shareTargetReceived",
      listener,
    );
    wildcardHandler?.("shareTargetReceived", { files: ["other.md"] });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates message listeners and keeps other listeners subscribed", async () => {
    let wildcardHandler:
      | ((messageName: unknown, payload: unknown) => void)
      | undefined;
    defineRpc.mockImplementation(
      (config: {
        handlers: {
          messages: Record<
            string,
            (messageName: unknown, payload: unknown) => void
          >;
        };
      }) => {
        wildcardHandler = config.handlers.messages["*"];
        return {
          request: {
            desktopGetVersion: vi.fn().mockResolvedValue({ version: "1.0.0" }),
          },
        };
      },
    );

    await import("../bridge/electrobun-direct-rpc");

    const firstListener = vi.fn();
    const secondListener = vi.fn();

    window.__MILADY_ELECTROBUN_RPC__.onMessage(
      "shareTargetReceived",
      firstListener,
    );
    window.__MILADY_ELECTROBUN_RPC__.onMessage(
      "shareTargetReceived",
      firstListener,
    );
    window.__MILADY_ELECTROBUN_RPC__.onMessage(
      "shareTargetReceived",
      secondListener,
    );

    wildcardHandler?.("shareTargetReceived", { files: ["first.md"] });
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(firstListener).toHaveBeenCalledWith({ files: ["first.md"] });
    expect(secondListener).toHaveBeenCalledTimes(1);

    window.__MILADY_ELECTROBUN_RPC__.offMessage(
      "shareTargetReceived",
      firstListener,
    );
    wildcardHandler?.("shareTargetReceived", { files: ["second.md"] });

    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(2);
    expect(secondListener).toHaveBeenLastCalledWith({ files: ["second.md"] });
  });
});
