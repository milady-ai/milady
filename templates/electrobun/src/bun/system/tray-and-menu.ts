import Electrobun, { ApplicationMenu, BrowserWindow, Tray } from "electrobun/bun";
import { dispatchCommand } from "./action-dispatcher";

export function installApplicationMenu(_window: BrowserWindow) {
  ApplicationMenu.setApplicationMenu([
    { submenu: [{ label: "Quit", role: "quit" }] },
    {
      label: "Agent",
      submenu: [
        { label: "Run Agent", action: "agent.run", accelerator: "r" },
        { label: "Check for Updates", action: "updates.check", accelerator: "u" },
        { type: "separator" },
        { label: "Settings", action: "settings.open", accelerator: "," },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
  ]);

  Electrobun.events.on("application-menu-clicked", async (event) => {
    const action = String(event.data?.action ?? "");
    if (action) await dispatchCommand(action as never);
  });
}

export function installTray(_window: BrowserWindow) {
  const tray = new Tray({
    title: "Agent",
    image: "views://assets/tray-template.png",
    template: true,
    width: 32,
    height: 32,
  });

  tray.setMenu([
    { type: "normal", label: "Run Agent", action: "agent.run" },
    { type: "normal", label: "Check for Updates", action: "updates.check" },
    { type: "divider" },
    { type: "normal", label: "Settings", action: "settings.open" },
  ]);

  tray.on("tray-clicked", async (event) => {
    const action = String(event.data?.action ?? "");
    if (action) await dispatchCommand(action as never);
  });
}
