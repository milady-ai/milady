import type { AppCommandId, Result } from "../../shared/domain";

export async function dispatchCommand(id: AppCommandId, payload?: unknown): Promise<Result<{ handled: boolean }>> {
  switch (id) {
    case "settings.open":
      console.log("Open settings", payload ?? {});
      return { ok: true, value: { handled: true } };
    case "updates.check":
      console.log("Check updates requested");
      return { ok: true, value: { handled: true } };
    case "agent.run":
    case "agent.cancel":
    case "notes.search":
      return { ok: true, value: { handled: false } };
    default:
      return { ok: false, error: { code: "invalid-input", message: `Unknown command: ${id}`, recoverable: true } };
  }
}
