import { Electroview } from "electrobun/view";

type IpcListener = (...args: unknown[]) => void;

const listenersByRpcMessage: Record<string, Set<IpcListener>> = {};
const listenersByChannel: Record<string, Set<IpcListener>> = {};

// Electrobun's native layer sets __electrobun before preloads run.
// Stub it if the built-in preload hasn't fired yet.
if (typeof window.__electrobun === "undefined") {
  (
    window as {
      __electrobun: {
        receiveMessageFromBun: (m: unknown) => void;
        receiveInternalMessageFromBun: (m: unknown) => void;
      };
    }
  ).__electrobun = {
    receiveMessageFromBun: (_m: unknown) => {},
    receiveInternalMessageFromBun: (_m: unknown) => {},
  };
}

function dispatchMessage(messageName: string, payload: unknown): void {
  if (messageName === "apiBaseUpdate") {
    const p = payload as { base: string; token?: string };
    window.__MILADY_API_BASE__ = p.base;
    if (p.token)
      Object.defineProperty(window, "__MILADY_API_TOKEN__", {
        value: p.token,
        writable: true,
        enumerable: false,
        configurable: true,
      });
  }

  const listeners = listenersByRpcMessage[messageName];
  if (listeners) {
    for (const listener of Array.from(listeners)) {
      try {
        listener(null, payload);
      } catch (err) {
        console.error(
          `[ElectrobunBridge] Listener error for ${messageName}:`,
          err,
        );
      }
    }
  }
}

// Electrobun defaults outgoing RPC timeout to 1s; native dialogs need much longer.
// biome-ignore lint/suspicious/noExplicitAny: schema types live on the Bun side and can't be imported in a browser bundle
const rpc = Electroview.defineRPC<any>({
  maxRequestTime: 600_000,
  handlers: {
    requests: {},
    messages: {
      "*": ((messageName: unknown, payload: unknown) => {
        if (typeof messageName === "string") {
          dispatchMessage(messageName, payload);
        }
        // biome-ignore lint/suspicious/noExplicitAny: required for Electroview wildcard signature
      }) as any,
    },
  },
});

new Electroview({ rpc });

// biome-ignore lint/suspicious/noExplicitAny: request proxy is dynamically typed, schema only available on Bun side
const rpcRequest = (rpc as any).request as Record<
  string,
  (params: unknown) => Promise<unknown>
>;

const electrobunAPI = {
  ipcRenderer: {
    invoke: async (rpcMethod: string, ...args: unknown[]): Promise<unknown> => {
      const params =
        args.length === 0 ? undefined : args.length === 1 ? args[0] : args;

      try {
        return await rpcRequest[rpcMethod](params);
      } catch (err) {
        console.error(`[ElectrobunBridge] RPC error for ${rpcMethod}:`, err);
        throw err;
      }
    },

    send: (channel: string, ...args: unknown[]): void => {
      electrobunAPI.ipcRenderer.invoke(channel, ...args).catch(() => {});
    },

    on: (rpcMessage: string, listener: IpcListener): void => {
      if (!listenersByRpcMessage[rpcMessage]) {
        listenersByRpcMessage[rpcMessage] = new Set();
      }
      listenersByRpcMessage[rpcMessage].add(listener);

      listenersByChannel[rpcMessage].add(listener);
    },

    once: (channel: string, listener: IpcListener): void => {
      const wrappedListener: IpcListener = (...args) => {
        electrobunAPI.ipcRenderer.removeListener(channel, wrappedListener);
        listener(...args);
      };
      electrobunAPI.ipcRenderer.on(channel, wrappedListener);
    },

    removeListener: (rpcMessage: string, listener: IpcListener): void => {
      listenersByRpcMessage[rpcMessage]?.delete(listener);
      listenersByChannel[rpcMessage]?.delete(listener);
    },

    removeAllListeners: (rpcMessage: string): void => {
      delete listenersByRpcMessage[rpcMessage];
      delete listenersByChannel[rpcMessage];
    },
  },

  desktopCapturer: {
    getSources: async (_options: {
      types: string[];
      thumbnailSize?: { width: number; height: number };
    }) => {
      const result = await electrobunAPI.ipcRenderer.invoke(
        "screencaptureGetSources",
      );
      return (result as { sources?: unknown[] })?.sources ?? [];
    },
  },

  platform: {
    isMac: /Mac/.test(navigator.userAgent),
    isWindows: /Win/.test(navigator.userAgent),
    isLinux: /Linux/.test(navigator.userAgent),
    arch: /arm|aarch64/i.test(navigator.userAgent) ? "arm64" : "x64",
    version: "",
  },
};

type RpcMessageListener = (payload: unknown) => void;

const rpcListenerWrappers: Record<
  string,
  Map<RpcMessageListener, IpcListener>
> = {};

const miladyElectrobunRpc = {
  request: rpcRequest,
  onMessage: (messageName: string, listener: RpcMessageListener): void => {
    if (!rpcListenerWrappers[messageName]) {
      rpcListenerWrappers[messageName] = new Map();
    }
    if (rpcListenerWrappers[messageName].has(listener)) {
      return;
    }

    const wrappedListener: IpcListener = (_event, payload) => {
      listener(payload);
    };
    rpcListenerWrappers[messageName].set(listener, wrappedListener);
    electrobunAPI.ipcRenderer.on(messageName, wrappedListener);
  },
  offMessage: (messageName: string, listener: RpcMessageListener): void => {
    const wrappedListener = rpcListenerWrappers[messageName]?.get(listener);
    if (!wrappedListener) {
      return;
    }

    electrobunAPI.ipcRenderer.removeListener(messageName, wrappedListener);
    rpcListenerWrappers[messageName]?.delete(listener);
    if (rpcListenerWrappers[messageName]?.size === 0) {
      delete rpcListenerWrappers[messageName];
    }
  },
};

// Initialize platform version asynchronously
electrobunAPI.ipcRenderer
  .invoke("desktopGetVersion")
  .then((info) => {
    if (info && typeof info === "object" && "version" in info) {
      electrobunAPI.platform.version = (info as { version: string }).version;
    }
  })
  .catch(() => {});

declare global {
  interface Window {
    __MILADY_API_BASE__: string;
    __MILADY_API_TOKEN__: string;
    __MILADY_ELECTROBUN_RPC__: typeof miladyElectrobunRpc;
    electrobun: typeof electrobunAPI;
  }
}

window.electrobun = electrobunAPI;
window.__MILADY_ELECTROBUN_RPC__ = miladyElectrobunRpc;
