import Electrobun, { BrowserWindow } from "electrobun/bun";
import { dispatchCommand } from "./action-dispatcher";

export function installDeepLinks(_window: BrowserWindow) {
  Electrobun.events.on("open-url", async (event) => {
    const raw = String(event.data?.url ?? "");
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return;
    }
    if (url.protocol !== "agentic-electrobun:") return;
    const command = url.pathname.replace(/^\//, "");
    if (command === "settings") await dispatchCommand("settings.open");
    if (command === "updates") await dispatchCommand("updates.check");
  });
}
