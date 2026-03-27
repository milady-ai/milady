import {
  getElectrobunRendererRpc,
  invokeDesktopBridgeRequest,
} from "../bridge/electrobun-rpc";

export async function openExternalUrl(url: string): Promise<void> {
  const bridged = await invokeDesktopBridgeRequest<void>({
    rpcMethod: "desktopOpenExternal",
    ipcChannel: "desktop:openExternal",
    params: { url },
  });

  if (bridged !== null) return;

  // Inside Electrobun — never fall through to window.open() which spawns an
  // unmanaged BrowserView to an external URL and crashes the shell.
  // The RPC may be missing because the preload hasn't wired yet or the
  // specific method isn't registered; either way opening a raw popup is worse.
  if (getElectrobunRendererRpc() !== undefined) {
    console.warn(
      "[openExternalUrl] desktopOpenExternal RPC returned null — skipping window.open fallback",
    );
    return;
  }

  // Non-desktop (web browser) fallback
  if (typeof window === "undefined" || typeof window.open !== "function") {
    throw new Error("Popup blocked. Allow popups and try again.");
  }

  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("Popup blocked. Allow popups and try again.");
  }
}
