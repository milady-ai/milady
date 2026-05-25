import Electrobun from "electrobun/bun";

export function saveStateBeforeQuit() {
  Electrobun.events.on("before-quit", async (event) => {
    const hasUnsavedChanges = false;
    if (hasUnsavedChanges) {
      event.response = { allow: false };
      return;
    }
    // Flush privacy-safe logs, close DB handles, cancel agents, persist settings.
  });
}
