import { __voiceChatInternals } from "@miladyai/app-core/hooks";
import { describe, expect, it } from "vitest";

const {
  splitFirstSentence,
  remainderAfter,
  queueableSpeechPrefix,
  resolveEffectiveVoiceConfig,
  resolveVoiceMode,
  resolveVoiceProxyEndpoint,
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

  it("defaults to ElevenLabs own-key proxy config when Cloud auth is present", () => {
    expect(
      resolveEffectiveVoiceConfig(null, {
        cloudConnected: true,
      }),
    ).toEqual({
      provider: "elevenlabs",
      mode: "own-key",
      elevenlabs: {
        voiceId: "EXAVITQu4vr4xnSDxMaL",
        modelId: "eleven_flash_v2_5",
        stability: 0.5,
        similarityBoost: 0.75,
        speed: 1,
      },
    });
  });

  it("always defaults to own-key so ElevenLabs voices route through the server proxy", () => {
    // Cloud-connected but no explicit mode — server aliases cloud key to
    // ELEVENLABS_API_KEY so the upstream proxy handles it.
    expect(resolveVoiceMode(undefined, true)).toBe("own-key");
    expect(resolveVoiceMode(undefined, true, "")).toBe("own-key");
    expect(resolveVoiceMode(undefined, true, "sk-test")).toBe("own-key");
    expect(resolveVoiceMode(undefined, true, "[REDACTED]")).toBe("own-key");
    expect(resolveVoiceMode(undefined, true, "sk-t...1234")).toBe("own-key");
    expect(resolveVoiceMode(undefined, false)).toBe("own-key");
    // Explicit mode is always respected.
    expect(resolveVoiceMode("own-key", true, "")).toBe("own-key");
    expect(resolveVoiceMode("cloud", true, "")).toBe("cloud");
  });

  it("uses the cloud TTS proxy when ElevenLabs is in cloud mode", () => {
    expect(resolveVoiceProxyEndpoint("cloud")).toBe("/api/tts/cloud");
    expect(resolveVoiceProxyEndpoint("own-key")).toBe("/api/tts/elevenlabs");
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

  it("extracts <text> content from <response> wrapper for speech", () => {
    expect(
      toSpeakableText(
        "<response><thought>internal</thought><text>Hello world!</text></response>",
      ),
    ).toBe("Hello world!");
  });

  it("extracts partial <text> content when closing tag is missing (streaming)", () => {
    expect(
      toSpeakableText("<response><thought>internal</thought><text>Hello wor"),
    ).toBe("Hello wor");
  });

  it("returns empty when <response> present but <text> has not started", () => {
    expect(toSpeakableText("<response><thought>internal</thought>")).toBe("");
  });

  it("strips partial XML tags at end of streaming chunk from speech", () => {
    expect(toSpeakableText("Hello world<thi")).toBe("Hello world");
  });

  it("strips partial closing tags from speech", () => {
    expect(toSpeakableText("Hello world</respon")).toBe("Hello world");
  });

  it("does not garble text when stream ends mid-tag", () => {
    const result = toSpeakableText("Say this exact phrase.<acti");
    expect(result).toBe("Say this exact phrase.");
    expect(result).not.toContain("<");
  });

  it("strips unclosed <think> block content during streaming", () => {
    const result = toSpeakableText(
      "Hello. <think>internal reasoning about the query",
    );
    expect(result).toBe("Hello.");
    expect(result).not.toContain("internal");
    expect(result).not.toContain("reasoning");
  });

  it("strips closed <think> block and speaks surrounding text", () => {
    const result = toSpeakableText(
      "<think>planning my response</think>Hello there!",
    );
    expect(result).toBe("Hello there!");
    expect(result).not.toContain("planning");
  });

  it("strips unclosed <analysis> block during streaming", () => {
    const result = toSpeakableText(
      "Sure! <analysis>checking the user intent for",
    );
    expect(result).toBe("Sure!");
    expect(result).not.toContain("checking");
  });

  it("strips <actions> blocks even when unclosed during streaming", () => {
    const result = toSpeakableText(
      'Here is your answer. <actions><action name="DO_THING"><params>{"key',
    );
    expect(result).toBe("Here is your answer.");
    expect(result).not.toContain("actions");
    expect(result).not.toContain("DO_THING");
  });

  it("produces exact phrase without any XML artifacts", () => {
    const exactPhrase = "The quick brown fox jumps over the lazy dog.";
    expect(toSpeakableText(exactPhrase)).toBe(exactPhrase);
  });

  it("produces exact phrase from wrapped response", () => {
    const exactPhrase = "The quick brown fox jumps over the lazy dog.";
    const wrapped = `<response><thought>user wants a test</thought><text>${exactPhrase}</text></response>`;
    expect(toSpeakableText(wrapped)).toBe(exactPhrase);
  });
});

describe("splitFirstSentence edge cases", () => {
  it("does not split on abbreviation periods", () => {
    const result = splitFirstSentence(
      "Dr. Smith went to the store. He bought milk.",
    );
    expect(result.firstSentence).toBe("Dr. Smith went to the store.");
    expect(result.remainder).toBe("He bought milk.");
    expect(result.complete).toBe(true);
  });

  it("does not split on decimal numbers", () => {
    const result = splitFirstSentence(
      "The price is 3.14 dollars. That is cheap.",
    );
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
    const result = splitFirstSentence(
      "Visit https://example.com for details. It is free.",
    );
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
