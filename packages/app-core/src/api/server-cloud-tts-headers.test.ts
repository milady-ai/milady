import { describe, expect, it } from "vitest";
import { readMiladyTtsDebugClientHeaders } from "./server-cloud-tts";

describe("readMiladyTtsDebugClientHeaders", () => {
  it("decodes URI-encoded Milady TTS debug headers", () => {
    const full = "yeah, i meant it. whatever you need, i'm here.";
    const headers = {
      "x-milady-tts-message-id": encodeURIComponent("msg-abc"),
      "x-milady-tts-clip-segment": encodeURIComponent("first-sentence"),
      "x-milady-tts-full-preview": encodeURIComponent(full),
    };
    expect(
      readMiladyTtsDebugClientHeaders({
        headers,
      }),
    ).toEqual({
      messageId: "msg-abc",
      clipSegment: "first-sentence",
      hearingFull: full,
    });
  });

  it("returns empty object when headers absent", () => {
    expect(readMiladyTtsDebugClientHeaders({ headers: {} })).toEqual({});
  });
});
