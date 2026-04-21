// @vitest-environment jsdom

import {
  type ElectrobunRendererRpc,
  invokeDesktopBridgeRequest,
  invokeDesktopBridgeRequestWithTimeout,
  subscribeDesktopBridgeEvent,
} from "@miladyai/app-core/bridge";
import * as electrobunRpc from "@miladyai/app-core/bridge/electrobun-rpc";
import { afterEach, describe, expect, it, vi } from "vitest";

// No custom globals needed

describe("electrobun rpc bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("prefers direct Electrobun RPC requests when available", async () => {
    const rpcRequest = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
      request: { desktopOpenExternal: rpcRequest },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });

    await expect(
      invokeDesktopBridgeRequest({
        rpcMethod: "desktopOpenExternal",
        ipcChannel: "desktop:openExternal",
        params: { url: "https://example.com" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(rpcRequest).toHaveBeenCalledWith({ url: "https://example.com" });
  });

  it("returns null when direct Electrobun RPC is unavailable", async () => {
    await expect(
      invokeDesktopBridgeRequest({
        rpcMethod: "desktopOpenExternal",
        ipcChannel: "desktop:openExternal",
        params: { url: "https://example.com" },
      }),
    ).resolves.toBeNull();
  });

  it("invokeDesktopBridgeRequestWithTimeout returns missing when RPC method absent", async () => {
    vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
      request: {},
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });

    await expect(
      invokeDesktopBridgeRequestWithTimeout({
        rpcMethod: "agentPostCloudDisconnect",
        ipcChannel: "agent:postCloudDisconnect",
        timeoutMs: 1000,
      }),
    ).resolves.toEqual({ status: "missing" });
  });

  it("invokeDesktopBridgeRequestWithTimeout returns timeout when handler never settles", async () => {
    vi.useFakeTimers();
    const hang = new Promise(() => {
      /* intentionally unresolved */
    });
    vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
      request: {
        agentPostCloudDisconnect: () => hang,
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });

    const pending = invokeDesktopBridgeRequestWithTimeout({
      rpcMethod: "agentPostCloudDisconnect",
      ipcChannel: "agent:postCloudDisconnect",
      timeoutMs: 10,
    });
    await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toEqual({ status: "timeout" });
    vi.useRealTimers();
  });

  it("invokeDesktopBridgeRequestWithTimeout returns ok when handler resolves", async () => {
    vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
      request: {
        agentPostCloudDisconnect: vi
          .fn()
          .mockResolvedValue({ ok: true, error: undefined }),
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });

    await expect(
      invokeDesktopBridgeRequestWithTimeout<{ ok: boolean }>({
        rpcMethod: "agentPostCloudDisconnect",
        ipcChannel: "agent:postCloudDisconnect",
        params: { apiBase: "http://127.0.0.1:31337" },
        timeoutMs: 1000,
      }),
    ).resolves.toEqual({ status: "ok", value: { ok: true } });
  });

  it("invokeDesktopBridgeRequestWithTimeout returns rejected when handler throws", async () => {
    const boom = new Error("rpc failed");
    vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
      request: {
        agentPostCloudDisconnect: vi.fn().mockRejectedValue(boom),
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });

    await expect(
      invokeDesktopBridgeRequestWithTimeout({
        rpcMethod: "agentPostCloudDisconnect",
        ipcChannel: "agent:postCloudDisconnect",
        timeoutMs: 1000,
      }),
    ).resolves.toEqual({ status: "rejected", error: boom });
  });

  it("subscribes to direct Electrobun RPC messages when available", () => {
    const listeners = new Map<string, Set<(payload: unknown) => void>>();
    vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
      request: {},
      onMessage: vi.fn(
        (messageName: string, listener: (payload: unknown) => void) => {
          const entry = listeners.get(messageName) ?? new Set();
          entry.add(listener);
          listeners.set(messageName, entry);
        },
      ),
      offMessage: vi.fn(
        (messageName: string, listener: (payload: unknown) => void) => {
          listeners.get(messageName)?.delete(listener);
        },
      ),
    });

    const listener = vi.fn();
    const unsubscribe = subscribeDesktopBridgeEvent({
      rpcMessage: "contextMenuSaveAsCommand",
      ipcChannel: "contextMenu:saveAsCommand",
      listener,
    });

    listeners.get("contextMenuSaveAsCommand")?.forEach((fn) => {
      fn({ text: "hello" });
    });

    expect(listener).toHaveBeenCalledWith({ text: "hello" });

    unsubscribe();
    expect(listeners.get("contextMenuSaveAsCommand")?.size ?? 0).toBe(0);
  });
});
