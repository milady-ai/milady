import { BrowserView } from "electrobun/bun";
import type { MainViewRPC } from "../../shared/rpc";
import { isRecord } from "../../shared/validation";
import { createAgentOrchestrator } from "../agent/orchestrator";
import { checkForUpdates } from "../system/updater";
import { dispatchCommand } from "../system/action-dispatcher";

const orchestrator = createAgentOrchestrator();

export function createMainViewRPC() {
  return BrowserView.defineRPC<MainViewRPC>({
    maxRequestTime: 30_000,
    handlers: {
      requests: {
        async runAgent(input) {
          if (!isRecord(input) || typeof input.prompt !== "string" || input.prompt.length === 0) {
            return { ok: false, error: { code: "invalid-input", message: "Prompt is required.", recoverable: true } };
          }
          return orchestrator.run(input);
        },
        async cancelAgent({ runId }) {
          return orchestrator.cancel(runId);
        },
        async checkForUpdate() {
          return checkForUpdates();
        },
        async dispatchCommand(params) {
          return dispatchCommand(params.id, params.payload);
        },
      },
      messages: {
        logUiEvent(event) {
          // Log only privacy-safe metadata. Never log prompts or full documents.
          console.log("ui-event", event.name, event.metadata ?? {});
        },
      },
    },
  });
}
