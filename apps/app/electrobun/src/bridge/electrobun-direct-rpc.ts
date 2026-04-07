/**
 * Electrobun Renderer Bridge
 *
 * Exposes the direct Milady Electrobun RPC surface in the webview context.
 *
 * This script runs in the webview context (injected as a preload).
 * It uses `Electroview.defineRPC()` + `new Electroview()` to connect to
 * the Bun main process via the Electrobun WebSocket RPC channel.
 *
 * `window.__MILADY_ELECTROBUN_RPC__` is the only public desktop bridge exposed
 * to renderer code. It mirrors the native Electrobun RPC surface directly:
 * `request.<method>(params)` plus `onMessage(<message>, listener)`.
 */

import { Electroview } from "electrobun/view";
import {
  getBootConfig,
  setBootConfig,
} from "@miladyai/app-core/config";
import type { RpcMessageListener } from "../types.js";
import { ensureElectrobunGlobal } from "./electrobun-stub.js";

type RendererRequestHandler = (params: unknown) => Promise<unknown>;
type RendererBridgeRpc = {
  request: Record<string, RendererRequestHandler>;
  setTransport: (transport: unknown) => void;
};

const listenersByRpcMessage: Record<string, Set<RpcMessageListener>> = {};

// Electrobun's native layer sets these globals before preloads run.
// __electrobun must exist before Electroview.init() tries to write to it.
// If the built-in preload hasn't fired yet (rare edge case), stub it.
ensureElectrobunGlobal();

function dispatchMessage(messageName: string, payload: unknown): void {
  if (messageName === "apiBaseUpdate") {
    const apiBaseUpdate = payload as { base: string; token?: string };
    window.__MILADY_API_BASE__ = apiBaseUpdate.base;
    if (apiBaseUpdate.token) {
      Object.defineProperty(window, "__MILADY_API_TOKEN__", {
        value: apiBaseUpdate.token,
        configurable: true,
        writable: true,
        enumerable: false,
      });
    }
    // Propagate to boot config so MiladyClient picks up port changes.
    // The client reads boot config (not window globals) after construction.
    const config = getBootConfig();
    setBootConfig({
      ...config,
      apiBase: apiBaseUpdate.base,
      ...(apiBaseUpdate.token ? { apiToken: apiBaseUpdate.token } : {}),
    });
  }

  const listeners = listenersByRpcMessage[messageName];
  if (!listeners) {
    return;
  }

  for (const listener of Array.from(listeners)) {
    try {
      listener(payload);
    } catch (err) {
      console.error(
        `[ElectrobunBridge] Listener error for ${messageName}:`,
        err,
      );
    }
  }
}

function handleWildcardMessage(messageName: unknown, payload: unknown): void {
  if (typeof messageName === "string") {
    dispatchMessage(messageName, payload);
  }
}

// Electrobun defaults maxRequestTime to 1000ms (see node_modules/electrobun/.../rpc.ts).
// Native sheets + main-process HTTP (disconnect, reset, file pickers) exceed that and
// surface as "RPC request timed out." in the renderer.
const rpc = Electroview.defineRPC({
  maxRequestTime: 600_000,
  handlers: {
    requests: {},
    messages: {
      "*": handleWildcardMessage,
    },
  },
}) as RendererBridgeRpc;

new Electroview({ rpc });

const miladyElectrobunRpc = {
  request: rpc.request,
  onMessage: (messageName: string, listener: RpcMessageListener): void => {
    if (!listenersByRpcMessage[messageName]) {
      listenersByRpcMessage[messageName] = new Set();
    }
    listenersByRpcMessage[messageName].add(listener);
  },
  offMessage: (messageName: string, listener: RpcMessageListener): void => {
    listenersByRpcMessage[messageName]?.delete(listener);
    if (listenersByRpcMessage[messageName]?.size === 0) {
      delete listenersByRpcMessage[messageName];
    }
  },
};

declare global {
  interface Window {
    __MILADY_API_BASE__: string;
    __MILADY_API_TOKEN__: string;
    __MILADY_ELECTROBUN_RPC__: typeof miladyElectrobunRpc;
  }
}

window.__MILADY_ELECTROBUN_RPC__ = miladyElectrobunRpc;
