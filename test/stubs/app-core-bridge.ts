export interface ElectrobunRendererRpc {
  request?: Record<string, (params?: unknown) => Promise<unknown> | unknown>;
  onMessage: (event: string, listener: (payload: unknown) => void) => void;
  offMessage: (event: string, listener: (payload: unknown) => void) => void;
}

interface RuntimeWindow extends Window {
  __ELIZA_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
  __MILADY_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
  __electrobunWindowId?: number;
  __electrobunWebviewId?: number;
}

function getRuntimeWindow(): RuntimeWindow | null {
  const g = globalThis as typeof globalThis & { window?: RuntimeWindow };
  if (typeof g.window === "undefined") {
    return null;
  }

  return g.window;
}

export function getElectrobunRendererRpc(): ElectrobunRendererRpc | null {
  const runtimeWindow = getRuntimeWindow();
  return (
    runtimeWindow?.__ELIZA_ELECTROBUN_RPC__ ??
    runtimeWindow?.__MILADY_ELECTROBUN_RPC__ ??
    null
  );
}

function hasElectrobunRendererBridge(): boolean {
  const rpc = getElectrobunRendererRpc();
  return Boolean(
    rpc &&
      typeof rpc.onMessage === "function" &&
      rpc.request &&
      typeof rpc.request === "object",
  );
}

export function isElectrobunRuntime(): boolean {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) {
    return false;
  }

  if (
    typeof runtimeWindow.__electrobunWindowId === "number" ||
    typeof runtimeWindow.__electrobunWebviewId === "number"
  ) {
    return true;
  }

  return hasElectrobunRendererBridge();
}

export function getBackendStartupTimeoutMs(): number {
  return isElectrobunRuntime() ? 180_000 : 30_000;
}

export async function invokeDesktopBridgeRequest<T = unknown>(options: {
  rpcMethod: string;
  params?: unknown;
}): Promise<T | null> {
  const request = getElectrobunRendererRpc()?.request?.[options.rpcMethod];
  if (!request) {
    return null;
  }

  return (await request(options.params)) as T;
}

export function subscribeDesktopBridgeEvent(options: {
  rpcMessage: string;
  listener: (payload: unknown) => void;
}): () => void {
  const rpc = getElectrobunRendererRpc();
  if (!rpc) {
    return () => {};
  }

  rpc.onMessage(options.rpcMessage, options.listener);
  return () => {
    rpc.offMessage(options.rpcMessage, options.listener);
  };
}

export function initializeCapacitorBridge(): void {}

export async function initializeStorageBridge(): Promise<void> {}

export async function scanProviderCredentials(): Promise<unknown[]> {
  return [];
}
