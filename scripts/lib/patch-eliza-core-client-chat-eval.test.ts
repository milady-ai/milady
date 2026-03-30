import { describe, expect, it } from "vitest";
import {
  applyClientChatEvaluateDeferPatch,
  EVAL_PATCH_MARKER,
} from "./patch-eliza-core-client-chat-eval.mjs";

describe("patch-eliza-core-client-chat-eval", () => {
  it("defers evaluate for client_chat and is idempotent", () => {
    const before = `
    await runtime2.evaluate(message2, state2, shouldRespondToMessage, async (content) => {
      runtime2.logger.debug({ src: "service:message", content }, "Evaluate callback");
      if (responseContent) {
        responseContent.evalCallbacks = content;
      }
      if (callback) {
        if (content.text) {
          content.text = runtime2.redactSecrets(content.text);
        }
        return callback(content);
      }
      return [];
    }, responseMessages);
    let entityName = "noname";
`;
    const { src: once, changed: c1 } =
      applyClientChatEvaluateDeferPatch(before);
    expect(c1).toBe(true);
    expect(once).toContain(EVAL_PATCH_MARKER);
    expect(once).toContain('message2.content?.source === "client_chat"');
    expect(once).toContain("void miladyRunEvaluate()");

    const { src: twice, changed: c2 } = applyClientChatEvaluateDeferPatch(once);
    expect(c2).toBe(false);
    expect(twice).toBe(once);
  });
});
