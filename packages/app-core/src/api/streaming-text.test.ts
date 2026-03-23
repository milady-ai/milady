import { describe, expect, it } from "vitest";
import {
  computeStreamingDelta,
  mergeStreamingText,
  resolveStreamingUpdate,
} from "./streaming-text";

describe("mergeStreamingText", () => {
  it("appends plain deltas", () => {
    expect(mergeStreamingText("Hello", " world")).toBe("Hello world");
  });

  it("accepts cumulative snapshots", () => {
    expect(mergeStreamingText("Hello", "Hello world")).toBe("Hello world");
  });

  it("replaces revised full snapshots", () => {
    expect(mergeStreamingText("world", "Hello world")).toBe("Hello world");
  });

  it("replaces corrected snapshots that revise earlier words", () => {
    expect(mergeStreamingText("Hello wrld", "Hello world")).toBe("Hello world");
  });

  it("drops already-applied larger suffix fragments", () => {
    expect(mergeStreamingText("Hello world", "world")).toBe("Hello world");
  });

  it("drops repeated short suffix fragments already present", () => {
    expect(mergeStreamingText("abc", "bc")).toBe("abc");
  });
});

describe("resolveStreamingUpdate", () => {
  it("emits append chunks for monotonic growth", () => {
    expect(resolveStreamingUpdate("Hello", "Hello world")).toEqual({
      kind: "append",
      nextText: "Hello world",
      emittedText: " world",
    });
  });

  it("emits replacement snapshots for revised full text", () => {
    expect(resolveStreamingUpdate("world", "Hello world")).toEqual({
      kind: "replace",
      nextText: "Hello world",
      emittedText: "Hello world",
    });
  });

  it("emits replacement snapshots for corrected full text", () => {
    expect(resolveStreamingUpdate("Hello wrld", "Hello world")).toEqual({
      kind: "replace",
      nextText: "Hello world",
      emittedText: "Hello world",
    });
  });

  it("suppresses already-seen suffix fragments", () => {
    expect(resolveStreamingUpdate("Hello world", "world")).toEqual({
      kind: "noop",
      nextText: "Hello world",
      emittedText: "",
    });
  });
});

describe("mergeStreamingText edge cases", () => {
  it("handles case-different resend (snapshot)", () => {
    const result = mergeStreamingText("Hello world", "Hello World");
    expect(result).toBe("Hello World");
  });

  it("handles punctuation-different resend", () => {
    const result = mergeStreamingText("Hello world", "Hello world.");
    expect(result).toBe("Hello world.");
  });

  it("does not create false overlap with short common prefix", () => {
    const result = mergeStreamingText("I went to the store", "I like cats");
    expect(result).toBe("I like cats");
  });

  it("handles trailing whitespace differences", () => {
    const result = mergeStreamingText("Hello ", "Hello world");
    expect(result).toBe("Hello world");
  });

  it("handles unicode normalization differences", () => {
    const nfc = "caf\u00e9";
    const nfd = "cafe\u0301";
    const result = mergeStreamingText(nfc, nfd);
    expect(result).toBe(nfd);
  });
});

describe("computeStreamingDelta", () => {
  it("emits only appended text for cumulative snapshots", () => {
    expect(computeStreamingDelta("Hello", "Hello world")).toBe(" world");
  });

  it("suppresses repeated suffix fragments", () => {
    expect(computeStreamingDelta("Hello world", "world")).toBe("");
  });

  it("returns the new suffix for overlap-heavy chunks", () => {
    expect(computeStreamingDelta("prefix-xxxxworld", "world!yyy")).toBe("!yyy");
  });

  it("returns the full incoming text for non-overlapping replacements", () => {
    expect(computeStreamingDelta("world", "Hello world")).toBe("Hello world");
  });
});

describe("mergeStreamingText – CJK / Unicode preservation", () => {
  it("appends CJK delta to existing text", () => {
    expect(mergeStreamingText("你", "好")).toBe("你好");
  });

  it("accepts cumulative CJK snapshot", () => {
    expect(mergeStreamingText("你好", "你好世界")).toBe("你好世界");
  });

  it("handles CJK-only overlap", () => {
    expect(mergeStreamingText("你好世", "世界")).toBe("你好世界");
  });

  it("preserves mixed CJK and ASCII", () => {
    expect(mergeStreamingText("Hello ", "你好")).toBe("Hello 你好");
  });

  it("handles Korean streaming", () => {
    expect(mergeStreamingText("안녕", "안녕하세요")).toBe("안녕하세요");
  });

  it("handles Japanese streaming (hiragana + kanji)", () => {
    expect(mergeStreamingText("こんに", "こんにちは")).toBe("こんにちは");
  });

  it("preserves fullwidth punctuation in CJK text", () => {
    expect(mergeStreamingText("你好", "你好，世界！")).toBe("你好，世界！");
  });

  it("does not corrupt CJK characters into commas or empty", () => {
    const result = mergeStreamingText("", "你好");
    expect(result).toBe("你好");
    expect(result).not.toBe(",,");
    expect(result).not.toMatch(/^[,\s]*$/);
  });

  it("handles emoji in streaming", () => {
    expect(mergeStreamingText("Hello 😀", "Hello 😀🎉")).toBe("Hello 😀🎉");
  });

  it("handles CJK with NFC normalization", () => {
    // CJK characters are already NFC but verify no corruption
    const input = "你好世界";
    const normalized = input.normalize("NFC");
    expect(mergeStreamingText(normalized, `${normalized}！`)).toBe(
      "你好世界！",
    );
  });
});

describe("computeStreamingDelta – CJK preservation", () => {
  it("emits CJK delta for cumulative snapshot", () => {
    expect(computeStreamingDelta("你好", "你好世界")).toBe("世界");
  });

  it("emits fullwidth punctuation in delta", () => {
    expect(computeStreamingDelta("你好", "你好！")).toBe("！");
  });
});

describe("resolveStreamingUpdate – CJK preservation", () => {
  it("appends CJK text correctly", () => {
    expect(resolveStreamingUpdate("你好", "你好世界")).toEqual({
      kind: "append",
      nextText: "你好世界",
      emittedText: "世界",
    });
  });

  it("replaces revised CJK snapshot", () => {
    expect(resolveStreamingUpdate("你好世", "你好世界！")).toEqual({
      kind: "append",
      nextText: "你好世界！",
      emittedText: "界！",
    });
  });
});
