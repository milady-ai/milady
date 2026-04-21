import { describe, expect, it } from "vitest";

const { parseKeyValueXml } = await import(
  "../../../../eliza/packages/typescript/src/utils.ts"
);

/**
 * Verify that the upstream elizaOS parseKeyValueXml function preserves
 * CJK and other Unicode characters when extracting text from structured
 * XML responses (the format LLMs emit via the DefaultMessageService).
 */
describe("parseKeyValueXml – CJK / Unicode preservation", () => {
  it("preserves Chinese text in <text> field", () => {
    const xml = `<response><text>你好，世界！</text></response>`;
    const result = parseKeyValueXml(xml);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).text).toBe("你好，世界！");
  });

  it("preserves standalone 你好", () => {
    const xml = `<response><text>你好</text></response>`;
    const result = parseKeyValueXml(xml);
    expect((result as Record<string, unknown>).text).toBe("你好");
  });

  it("does not produce ',,' from Chinese input", () => {
    const xml = `<response><text>你好</text></response>`;
    const result = parseKeyValueXml(xml);
    const text = (result as Record<string, unknown>).text as string;
    expect(text).not.toBe(",,");
    expect(text).not.toMatch(/^[,\s]*$/);
    expect(text).toBe("你好");
  });

  it("preserves mixed English and Chinese", () => {
    const xml = `<response><thought>thinking</thought><text>Hello 你好 world</text></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe("Hello 你好 world");
    expect(result.thought).toBe("thinking");
  });

  it("preserves Chinese with fullwidth punctuation", () => {
    const xml = `<response><text>你好！我是AI助手。很高兴认识你，请问有什么可以帮你的吗？</text></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe(
      "你好！我是AI助手。很高兴认识你，请问有什么可以帮你的吗？",
    );
  });

  it("preserves Korean text", () => {
    const xml = `<response><text>안녕하세요, 만나서 반갑습니다!</text></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe("안녕하세요, 만나서 반갑습니다!");
  });

  it("preserves Japanese text (hiragana + katakana + kanji)", () => {
    const xml = `<response><text>こんにちは、元気ですか？カタカナもOK</text></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe("こんにちは、元気ですか？カタカナもOK");
  });

  it("preserves Arabic text", () => {
    const xml = `<response><text>مرحبا بالعالم</text></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe("مرحبا بالعالم");
  });

  it("preserves Cyrillic text", () => {
    const xml = `<response><text>Привет, мир!</text></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe("Привет, мир!");
  });

  it("preserves Hindi/Devanagari text", () => {
    const xml = `<response><text>नमस्ते, दुनिया!</text></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe("नमस्ते, दुनिया!");
  });

  it("preserves Thai text", () => {
    const xml = `<response><text>สวัสดีครับ</text></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe("สวัสดีครับ");
  });

  it("preserves Vietnamese diacritics", () => {
    const xml = `<response><text>Xin chào, tôi là trợ lý AI</text></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe("Xin chào, tôi là trợ lý AI");
  });

  it("preserves emoji characters", () => {
    const xml = `<response><text>Hello 😀🎉 你好</text></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe("Hello 😀🎉 你好");
  });

  it("preserves CJK with actions field (comma-split does not affect text)", () => {
    const xml = `<response><text>你好，世界</text><actions>NONE</actions></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe("你好，世界");
  });

  it("preserves CJK in non-response wrapper", () => {
    const xml = `<output><text>你好</text></output>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe("你好");
  });

  it("preserves CJK with XML entities", () => {
    const xml = `<response><text>你好 &amp; 世界</text></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    expect(result.text).toBe("你好 & 世界");
  });

  it("preserves multi-paragraph CJK response", () => {
    const xml = `<response><text>你好！

我是一个AI助手。我可以用中文和你交流。

有什么可以帮你的吗？</text></response>`;
    const result = parseKeyValueXml(xml) as Record<string, unknown>;
    const text = result.text as string;
    expect(text).toContain("你好");
    expect(text).toContain("AI助手");
    expect(text).toContain("中文");
    expect(text).toContain("帮你的吗");
  });

  it("bulk: no CJK input produces ',,' or stripped output", () => {
    const inputs = [
      "你好",
      "你好！",
      "你好，世界",
      "请说你好",
      "我是AI助手",
      "今天天气怎么样？",
      "谢谢你的帮助！",
    ];
    for (const input of inputs) {
      const xml = `<response><text>${input}</text></response>`;
      const result = parseKeyValueXml(xml) as Record<string, unknown>;
      const text = result.text as string;
      expect(text).toBe(input);
      expect(text).not.toBe(",,");
      expect(text).not.toMatch(/^[,.\s]*$/);
    }
  });
});
