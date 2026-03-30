import { stripAssistantStageDirections } from "@miladyai/app-core/utils/assistant-text";
import { describe, expect, it } from "vitest";

describe("stripAssistantStageDirections", () => {
  it("strips asterisk-wrapped stage directions", () => {
    const result = stripAssistantStageDirections("Hello *smiles warmly* there");
    expect(result).not.toContain("smiles warmly");
    expect(result).toContain("Hello");
    expect(result).toContain("there");
  });

  it("strips underscore-wrapped stage directions", () => {
    const result = stripAssistantStageDirections("Hello _waves happily_ there");
    expect(result).not.toContain("waves happily");
  });

  it("preserves asterisk content that is NOT a stage direction", () => {
    const result = stripAssistantStageDirections(
      "Use *bold text* for emphasis",
    );
    expect(result).toContain("bold text");
  });

  it("preserves underscore content that is NOT a stage direction", () => {
    const result = stripAssistantStageDirections(
      "Use _italic text_ for emphasis",
    );
    expect(result).toContain("italic text");
  });

  it("handles empty input", () => {
    expect(stripAssistantStageDirections("")).toBe("");
  });

  it("handles text with no stage directions", () => {
    expect(stripAssistantStageDirections("Just plain text")).toBe(
      "Just plain text",
    );
  });

  it("handles multiple stage directions in one message", () => {
    const result = stripAssistantStageDirections(
      "*nods* I agree. *smiles* That sounds right.",
    );
    expect(result).not.toContain("nods");
    expect(result).not.toContain("smiles");
    expect(result).toContain("I agree.");
    expect(result).toContain("That sounds right.");
  });

  it("handles stage direction at start of text", () => {
    const result = stripAssistantStageDirections("*laughs* That's funny!");
    expect(result).not.toContain("laughs");
    expect(result).toContain("That's funny!");
  });

  it("handles stage direction at end of text", () => {
    const result = stripAssistantStageDirections("Goodbye! *waves*");
    expect(result).not.toContain("waves");
    expect(result).toContain("Goodbye!");
  });

  it("does not strip across newlines (asterisk pattern is non-greedy single line)", () => {
    const input = "*smiles\nacross lines*";
    const result = stripAssistantStageDirections(input);
    expect(result).toContain("smiles");
  });

  it("preserves Chinese characters bidirectionally (prevent stripping CJK inside or outside asterisks)", () => {
    // Stage direction with adjacent CJK text
    const result1 = stripAssistantStageDirections("*smiles* 你好我是来帮忙的");
    expect(result1).not.toContain("smiles");
    expect(result1).toContain("你好我是来帮忙的");

    // Pure CJK wrapped in asterisks (should NOT be stripped because it contains non-ASCII characters)
    const result2 = stripAssistantStageDirections("*我想写一句名言*");
    expect(result2).toContain("我想写一句名言");

    // Mixed English stage direction with Chinese text inside it (should NOT be stripped)
    const result3 = stripAssistantStageDirections("*smiles and says 你好*");
    expect(result3).toContain("smiles and says 你好");
  });
});

describe("Unicode / CJK full-pipeline preservation", () => {
  it("preserves standalone 你好 without corruption", () => {
    const result = stripAssistantStageDirections("你好");
    expect(result).toBe("你好");
  });

  it("preserves 你好 with surrounding punctuation", () => {
    const result = stripAssistantStageDirections("你好，世界！");
    expect(result).toBe("你好，世界！");
  });

  it("preserves mixed CJK and ASCII text", () => {
    const result = stripAssistantStageDirections("Hello 你好 world");
    expect(result).toBe("Hello 你好 world");
  });

  it("preserves Korean text", () => {
    const result = stripAssistantStageDirections("안녕하세요, 만나서 반갑습니다!");
    expect(result).toBe("안녕하세요, 만나서 반갑습니다!");
  });

  it("preserves Japanese text (hiragana, katakana, kanji)", () => {
    const result = stripAssistantStageDirections("こんにちは、元気ですか？カタカナもOK");
    expect(result).toBe("こんにちは、元気ですか？カタカナもOK");
  });

  it("preserves Arabic text", () => {
    const result = stripAssistantStageDirections("مرحبا بالعالم");
    expect(result).toBe("مرحبا بالعالم");
  });

  it("preserves emoji characters", () => {
    const result = stripAssistantStageDirections("Hello 😀🎉 there");
    expect(result).toBe("Hello 😀🎉 there");
  });

  it("preserves CJK text after stage direction is stripped", () => {
    const result = stripAssistantStageDirections("*waves* 你好！很高兴认识你。");
    expect(result).not.toContain("waves");
    expect(result).toContain("你好！很高兴认识你。");
  });

  it("preserves CJK text between multiple stage directions", () => {
    const result = stripAssistantStageDirections("*smiles* 你好 *nods* 世界");
    expect(result).not.toContain("smiles");
    expect(result).not.toContain("nods");
    expect(result).toContain("你好");
    expect(result).toContain("世界");
  });

  it("does not produce ',,' or empty output from CJK input", () => {
    const inputs = [
      "你好",
      "你好！",
      "你好，世界",
      "请说你好",
      "*smiles* 你好",
      "你好 *waves*",
    ];
    for (const input of inputs) {
      const result = stripAssistantStageDirections(input);
      expect(result).not.toBe(",,");
      expect(result).not.toBe(",");
      expect(result).not.toBe("");
      expect(result).not.toMatch(/^[,\s]+$/);
      // Verify the CJK characters survived
      const cjkChars = input.match(/[\u4e00-\u9fff]+/g);
      if (cjkChars) {
        for (const chars of cjkChars) {
          expect(result).toContain(chars);
        }
      }
    }
  });

  it("preserves CJK with fullwidth punctuation through tidyAssistantTextSpacing", () => {
    // fullwidth punctuation: ，。；：！？
    const result = stripAssistantStageDirections("你好，我是AI。很高兴认识你！");
    expect(result).toBe("你好，我是AI。很高兴认识你！");
  });

  it("preserves CJK text wrapped in underscores (not a stage direction)", () => {
    const result = stripAssistantStageDirections("_你好世界_");
    expect(result).toContain("你好世界");
  });

  it("handles CJK-only response from an LLM (no English)", () => {
    const result = stripAssistantStageDirections("你好！我是你的AI助手。有什么可以帮你的吗？");
    expect(result).toBe("你好！我是你的AI助手。有什么可以帮你的吗？");
  });

  it("preserves Vietnamese diacritics", () => {
    const result = stripAssistantStageDirections("Xin chào, tôi là trợ lý AI");
    expect(result).toBe("Xin chào, tôi là trợ lý AI");
  });

  it("preserves Thai script", () => {
    const result = stripAssistantStageDirections("สวัสดีครับ");
    expect(result).toBe("สวัสดีครับ");
  });

  it("preserves Cyrillic text", () => {
    const result = stripAssistantStageDirections("Привет, мир!");
    expect(result).toBe("Привет, мир!");
  });

  it("preserves Hindi/Devanagari text", () => {
    const result = stripAssistantStageDirections("नमस्ते, दुनिया!");
    expect(result).toBe("नमस्ते, दुनिया!");
  });
});
