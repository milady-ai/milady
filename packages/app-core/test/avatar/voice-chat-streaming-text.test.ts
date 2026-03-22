import { __voiceChatInternals } from "@miladyai/app-core/hooks";
import { describe, expect, it } from "vitest";

const {
  splitFirstSentence,
  remainderAfter,
  queueableSpeechPrefix,
  resolveEffectiveVoiceConfig,
  toSpeakableText,
} = __voiceChatInternals;

describe("useVoiceChat streaming text helpers", () => {
  it("returns only unseen suffix text when remainder grows", () => {
    expect(remainderAfter("alpha beta gamma", "alpha beta")).toBe("gamma");
  });

  it("does not replay full text when prefix matching fails", () => {
    expect(
      remainderAfter("canonical final response", "first streamed sentence."),
    ).toBe("");
  });

  it("queues only complete sentences before the final chunk", () => {
    expect(
      queueableSpeechPrefix(
        "second sentence done. third sentence still streaming",
        false,
      ),
    ).toBe("second sentence done.");
  });

  it("flushes all remaining text on the final chunk", () => {
    expect(
      queueableSpeechPrefix(
        "second sentence done. third sentence still streaming",
        true,
      ),
    ).toBe("second sentence done. third sentence still streaming");
  });

  it("falls back to a chunk for long text without punctuation", () => {
    const longText = [
      "this stream has no punctuation and keeps going with useful words",
      "so the speaker should not remain silent forever while waiting",
      "for a sentence boundary that never arrives during generation",
    ].join(" ");

    const queued = queueableSpeechPrefix(longText, false);
    expect(queued.length).toBeGreaterThan(80);
    expect(queued.length).toBeLessThan(longText.length);
  });

  it("defaults to ElevenLabs cloud config when Cloud auth is present", () => {
    expect(
      resolveEffectiveVoiceConfig(null, {
        cloudConnected: true,
      }),
    ).toEqual({
      provider: "elevenlabs",
      mode: "cloud",
      elevenlabs: {
        voiceId: "EXAVITQu4vr4xnSDxMaL",
        modelId: "eleven_flash_v2_5",
        stability: 0.5,
        similarityBoost: 0.75,
        speed: 1,
      },
    });
  });

  it("keeps explicit non-ElevenLabs providers intact", () => {
    expect(
      resolveEffectiveVoiceConfig(
        {
          provider: "edge",
          edge: { voice: "en-US-AriaNeural" },
        },
        { cloudConnected: true },
      ),
    ).toEqual({
      provider: "edge",
      edge: { voice: "en-US-AriaNeural" },
    });
  });

  it("drops parenthetical asides and stage directions from speech", () => {
    expect(
      toSpeakableText(
        "Hello there (with extra context). *curtsies* Visit https://example.com now.",
      ),
    ).toBe("Hello there. Visit now.");
  });

  it("returns empty text when only stage directions remain", () => {
    expect(toSpeakableText("*waves* (quietly) [off mic]")).toBe("");
  });
});

describe("splitFirstSentence edge cases", () => {
  it("does not split on abbreviation periods", () => {
    const result = splitFirstSentence("Dr. Smith went to the store. He bought milk.");
    expect(result.firstSentence).toBe("Dr. Smith went to the store.");
    expect(result.remainder).toBe("He bought milk.");
    expect(result.complete).toBe(true);
  });

  it("does not split on decimal numbers", () => {
    const result = splitFirstSentence("The price is 3.14 dollars. That is cheap.");
    expect(result.firstSentence).toBe("The price is 3.14 dollars.");
    expect(result.remainder).toBe("That is cheap.");
    expect(result.complete).toBe(true);
  });

  it("handles ellipsis correctly", () => {
    const result = splitFirstSentence("Well... I think so. Maybe not.");
    expect(result.firstSentence).toBe("Well... I think so.");
    expect(result.remainder).toBe("Maybe not.");
    expect(result.complete).toBe(true);
  });

  it("does not split on URLs", () => {
    const result = splitFirstSentence("Visit https://example.com for details. It is free.");
    expect(result.firstSentence).toBe("Visit https://example.com for details.");
    expect(result.remainder).toBe("It is free.");
    expect(result.complete).toBe(true);
  });

  it("handles text with no punctuation under 180 chars", () => {
    const result = splitFirstSentence("Hello world this has no ending");
    expect(result.complete).toBe(false);
    expect(result.firstSentence).toBe("Hello world this has no ending");
    expect(result.remainder).toBe("");
  });
});
