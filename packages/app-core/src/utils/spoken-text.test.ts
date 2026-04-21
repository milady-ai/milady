import { describe, expect, it } from "vitest";
import { sanitizeSpeechText } from "./spoken-text";

describe("sanitizeSpeechText", () => {
  it("drops starred actions, bracketed asides, and URLs", () => {
    expect(
      sanitizeSpeechText(
        "Hello there (quietly). *waves* [off mic] Visit https://example.com now.",
      ),
    ).toBe("Hello there. Visit now.");
  });

  it("returns an empty string when nothing speakable remains", () => {
    expect(sanitizeSpeechText("*kisses you* (softly) {stage left}")).toBe("");
  });
});

describe("sanitizeSpeechText – Unicode / CJK preservation", () => {
  it("preserves standalone Chinese text 你好", () => {
    const result = sanitizeSpeechText("你好");
    expect(result).toBe("你好");
  });

  it("preserves Chinese sentence with fullwidth punctuation", () => {
    const result = sanitizeSpeechText("你好，世界！");
    expect(result).toContain("你好");
    expect(result).toContain("世界");
    // Fullwidth punctuation may be normalized but characters must survive
    expect(result).not.toMatch(/^[,.\s]*$/);
  });

  it("preserves mixed English and Chinese", () => {
    const result = sanitizeSpeechText("Hello 你好 world");
    expect(result).toContain("Hello");
    expect(result).toContain("你好");
    expect(result).toContain("world");
  });

  it("preserves Chinese text after stripping stage directions", () => {
    const result = sanitizeSpeechText("*smiles* 你好！很高兴认识你。");
    expect(result).not.toContain("smiles");
    expect(result).toContain("你好");
    expect(result).toContain("很高兴认识你");
  });

  it("preserves Korean text", () => {
    const result = sanitizeSpeechText("안녕하세요");
    expect(result).toBe("안녕하세요");
  });

  it("preserves Japanese text (hiragana + kanji)", () => {
    const result = sanitizeSpeechText("こんにちは、元気ですか");
    expect(result).toContain("こんにちは");
    expect(result).toContain("元気ですか");
  });

  it("preserves Arabic text", () => {
    const result = sanitizeSpeechText("مرحبا بالعالم");
    expect(result).toContain("مرحبا");
  });

  it("preserves Cyrillic text", () => {
    const result = sanitizeSpeechText("Привет мир");
    expect(result).toContain("Привет");
    expect(result).toContain("мир");
  });

  it("preserves Hindi/Devanagari text", () => {
    const result = sanitizeSpeechText("नमस्ते दुनिया");
    expect(result).toContain("नमस्ते");
    expect(result).toContain("दुनिया");
  });

  it("preserves Thai text", () => {
    const result = sanitizeSpeechText("สวัสดีครับ");
    expect(result).toContain("สวัสดี");
  });

  it("preserves Vietnamese with diacritics", () => {
    const result = sanitizeSpeechText("Xin chào tôi là trợ lý");
    expect(result).toContain("chào");
    expect(result).toContain("trợ");
  });

  it("does not produce ',,' or empty output from CJK input", () => {
    const inputs = ["你好", "你好！", "你好，世界", "请说你好", "我是AI助手"];
    for (const input of inputs) {
      const result = sanitizeSpeechText(input);
      expect(result).not.toBe(",,");
      expect(result).not.toBe(",");
      expect(result).not.toMatch(/^[,.\s]*$/);
      // CJK characters must survive
      const cjkChars = input.match(/[\u4e00-\u9fff]+/g);
      if (cjkChars) {
        for (const chars of cjkChars) {
          expect(result).toContain(chars);
        }
      }
    }
  });

  it("preserves CJK text through full pipeline (thinking tags + directions + punctuation)", () => {
    const input =
      "<think>analyzing</think> *nods* 你好！我叫小明。(quietly) 很高兴认识你。";
    const result = sanitizeSpeechText(input);
    expect(result).not.toContain("analyzing");
    expect(result).not.toContain("nods");
    expect(result).not.toContain("quietly");
    expect(result).toContain("你好");
    expect(result).toContain("小明");
    expect(result).toContain("很高兴认识你");
  });

  it("preserves emoji in speech text", () => {
    const result = sanitizeSpeechText("Hello 😊 你好");
    // Emoji may or may not be kept for TTS, but CJK must survive
    expect(result).toContain("Hello");
    expect(result).toContain("你好");
  });
});
