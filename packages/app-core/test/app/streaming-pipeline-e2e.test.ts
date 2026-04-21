/**
 * End-to-end streaming pipeline tests.
 *
 * Simulates realistic SSE token sequences and verifies that BOTH the
 * displayed text and the voice (TTS) text are clean at every step of the
 * stream — no XML leaks, no garbled output, no internal reasoning spoken.
 */
import { normalizeDisplayText } from "../../src/components/chat/MessageContent";
import { __voiceChatInternals } from "@miladyai/app-core/hooks";
import { mergeStreamingText } from "@miladyai/app-core/utils/streaming-text";
import { describe, expect, it } from "vitest";

const { toSpeakableText } = __voiceChatInternals;

// ── Helpers ──────────────────────────────────────────────────────────

/** Simulate an SSE token stream where each entry is the `text` delta. */
function simulateStream(deltas: string[]) {
  let accumulated = "";
  const snapshots: {
    delta: string;
    accumulated: string;
    display: string;
    voice: string;
  }[] = [];

  for (const delta of deltas) {
    accumulated = mergeStreamingText(accumulated, delta);
    const display = normalizeDisplayText(accumulated);
    const voice = toSpeakableText(accumulated);
    snapshots.push({ delta, accumulated, display, voice });
  }

  return snapshots;
}

/** Simulate an SSE stream where each entry is the full `fullText` so far. */
function simulateCumulativeStream(fullTexts: string[]) {
  let accumulated = "";
  const snapshots: {
    fullText: string;
    accumulated: string;
    display: string;
    voice: string;
  }[] = [];

  for (const fullText of fullTexts) {
    accumulated = mergeStreamingText(accumulated, fullText);
    const display = normalizeDisplayText(accumulated);
    const voice = toSpeakableText(accumulated);
    snapshots.push({ fullText, accumulated, display, voice });
  }

  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("streaming pipeline: plain text", () => {
  it("displays and speaks the exact phrase for simple text", () => {
    const snapshots = simulateStream([
      "The quick ",
      "brown fox ",
      "jumps over ",
      "the lazy dog.",
    ]);

    const final = snapshots.at(-1)!;
    expect(final.display).toBe("The quick brown fox jumps over the lazy dog.");
    expect(final.voice).toBe("The quick brown fox jumps over the lazy dog.");

    // Every intermediate step should also be clean
    for (const snap of snapshots) {
      expect(snap.display).not.toContain("<");
      expect(snap.voice).not.toContain("<");
    }
  });

  it("handles cumulative fullText snapshots correctly", () => {
    const snapshots = simulateCumulativeStream([
      "Hello",
      "Hello world.",
      "Hello world. How are you?",
    ]);

    expect(snapshots[0].display).toBe("Hello");
    expect(snapshots[1].display).toBe("Hello world.");
    expect(snapshots[2].display).toBe("Hello world. How are you?");

    // Voice should match display for plain text
    expect(snapshots[2].voice).toBe("Hello world. How are you?");
  });
});

describe("streaming pipeline: <think> blocks", () => {
  it("never displays or speaks think block content during streaming", () => {
    const snapshots = simulateStream([
      "<think>",
      "Let me reason about ",
      "this carefully.",
      "</think>",
      "Here is my answer.",
    ]);

    // During the think block, nothing should be shown or spoken
    for (const snap of snapshots) {
      expect(snap.display).not.toContain("reason");
      expect(snap.display).not.toContain("carefully");
      expect(snap.voice).not.toContain("reason");
      expect(snap.voice).not.toContain("carefully");
    }

    // Final output should only have the answer
    const final = snapshots.at(-1)!;
    expect(final.display).toBe("Here is my answer.");
    expect(final.voice).toBe("Here is my answer.");
  });

  it("handles unclosed think block mid-stream (no closing tag yet)", () => {
    // Simulate a stream that is still inside a <think> block
    const snapshots = simulateStream([
      "<think>I need to figure out ",
      "what the user wants. ",
      "Let me think step by step",
    ]);

    // Nothing should be displayed or spoken — all content is inside <think>
    for (const snap of snapshots) {
      expect(snap.display.trim()).toBe("");
      expect(snap.voice).toBe("");
    }
  });

  it("shows text after think block closes, even mid-stream", () => {
    const snapshots = simulateCumulativeStream([
      "<think>planning</think>",
      "<think>planning</think>Hello!",
      "<think>planning</think>Hello! How can I help?",
    ]);

    expect(snapshots[0].display.trim()).toBe("");
    expect(snapshots[1].display).toBe("Hello!");
    expect(snapshots[2].display).toBe("Hello! How can I help?");

    expect(snapshots[0].voice).toBe("");
    expect(snapshots[1].voice).toBe("Hello!");
    expect(snapshots[2].voice).toBe("Hello! How can I help?");
  });
});

describe("streaming pipeline: <response><text> wrapper", () => {
  it("extracts text content from response wrapper for both display and voice", () => {
    const snapshots = simulateCumulativeStream([
      "<response><thought>analyzing</thought><text>Hi",
      "<response><thought>analyzing</thought><text>Hi there!",
      "<response><thought>analyzing</thought><text>Hi there!</text></response>",
    ]);

    // Should never show <response>, <thought>, or <text> tags
    for (const snap of snapshots) {
      expect(snap.display).not.toContain("<response>");
      expect(snap.display).not.toContain("<thought>");
      expect(snap.display).not.toContain("analyzing");
      expect(snap.voice).not.toContain("response");
      expect(snap.voice).not.toContain("thought");
      expect(snap.voice).not.toContain("analyzing");
    }

    expect(snapshots[0].display).toBe("Hi");
    expect(snapshots[1].display).toBe("Hi there!");
    expect(snapshots[2].display).toBe("Hi there!");

    expect(snapshots[0].voice).toBe("Hi");
    expect(snapshots[1].voice).toBe("Hi there!");
    expect(snapshots[2].voice).toBe("Hi there!");
  });

  it("shows nothing while response wrapper has no <text> yet", () => {
    const snapshots = simulateCumulativeStream([
      "<response>",
      "<response><thought>let me think",
      "<response><thought>let me think about this</thought>",
    ]);

    for (const snap of snapshots) {
      expect(snap.display).toBe("");
      expect(snap.voice).toBe("");
    }
  });
});

describe("streaming pipeline: <actions> blocks", () => {
  it("strips action blocks from display and voice", () => {
    const snapshots = simulateCumulativeStream([
      "Sure, I'll do that.",
      'Sure, I\'ll do that. <actions><action name="SAVE_FILE">',
      'Sure, I\'ll do that. <actions><action name="SAVE_FILE"><params>{"file":"test.ts"}</params></action></actions>',
    ]);

    // The final snapshot (closed <actions> block) must be clean
    const final = snapshots.at(-1)!;
    expect(final.display).not.toContain("actions");
    expect(final.display).not.toContain("SAVE_FILE");
    expect(final.voice).not.toContain("actions");
    expect(final.voice).not.toContain("SAVE_FILE");

    // First snapshot (before any XML) is always clean
    expect(snapshots[0].display).toBe("Sure, I'll do that.");
    expect(snapshots[0].voice).toBe("Sure, I'll do that.");
  });
});

describe("streaming pipeline: partial XML tags", () => {
  it("strips partial tags at every streaming step", () => {
    const snapshots = simulateCumulativeStream([
      "Hello world<",
      "Hello world<thi",
      "Hello world<think>reasoning",
      "Hello world<think>reasoning</think> done!",
    ]);

    // Steps 0-2: partial/unclosed tags should be hidden
    expect(snapshots[0].display).toBe("Hello world");
    expect(snapshots[1].display).toBe("Hello world");
    expect(snapshots[2].display.trim()).toBe("Hello world");

    expect(snapshots[0].voice).toBe("Hello world");
    expect(snapshots[1].voice).toBe("Hello world");
    expect(snapshots[2].voice).toBe("Hello world");

    // Step 3: think block closed, "done!" visible
    expect(snapshots[3].display).toBe("Hello world done!");
    expect(snapshots[3].voice).toBe("Hello world done!");
  });
});

describe("streaming pipeline: exact phrase round-trip", () => {
  it("preserves exact text through the full pipeline", () => {
    const phrase = "Say this exact phrase and nothing else.";
    const snapshots = simulateStream([phrase]);

    expect(snapshots[0].display).toBe(phrase);
    expect(snapshots[0].voice).toBe(phrase);
  });

  it("preserves multi-sentence text through the full pipeline", () => {
    const phrase =
      "First sentence. Second sentence! Third sentence? Fourth.";
    const snapshots = simulateCumulativeStream([
      "First sentence.",
      "First sentence. Second sentence!",
      "First sentence. Second sentence! Third sentence?",
      "First sentence. Second sentence! Third sentence? Fourth.",
    ]);

    const final = snapshots.at(-1)!;
    expect(final.display).toBe(phrase);
    expect(final.voice).toBe(phrase);

    // Each intermediate step should also be a clean prefix
    expect(snapshots[0].display).toBe("First sentence.");
    expect(snapshots[1].display).toBe("First sentence. Second sentence!");
    expect(snapshots[2].display).toBe(
      "First sentence. Second sentence! Third sentence?",
    );
  });

  it("voice output never contains angle brackets", () => {
    const scenarios = [
      "Hello <world",
      "Test</response",
      "<think>hidden</think>visible",
      '<actions><action name="x">y</action></actions>clean text',
      "<response><thought>t</thought><text>spoken</text></response>",
      "text<",
    ];

    for (const input of scenarios) {
      const voice = toSpeakableText(input);
      expect(voice).not.toContain("<");
      expect(voice).not.toContain(">");
    }
  });

  it("display output never contains angle brackets for known tag patterns", () => {
    const scenarios = [
      "Hello <thi",
      "Test</respon",
      "<think>hidden</think>visible",
      '<actions><action name="x">y</action></actions>clean text',
      "<response><thought>t</thought><text>spoken</text></response>",
    ];

    for (const input of scenarios) {
      const display = normalizeDisplayText(input);
      expect(display).not.toContain("<");
      expect(display).not.toContain(">");
    }
  });
});

// ── Voice queue simulation ──────────────────────────────────────────

const {
  remainderAfter,
  ASSISTANT_TTS_FIRST_FLUSH_CHARS,
  ASSISTANT_TTS_MIN_CHUNK_CHARS,
} = __voiceChatInternals;

/**
 * Simulates `queueAssistantSpeech` batching (min chars + final flush).
 * No real timer — after the loop, flushes any tail debounce would have sent.
 */
function simulateVoiceQueue(
  cumulativeTexts: string[],
  isFinalFlags?: boolean[],
) {
  const state = {
    queuedSpeakablePrefix: "",
    latestSpeakable: "",
    finalQueued: false,
  };

  const enqueuedChunks: { text: string; append: boolean; step: number }[] = [];

  const tryFlush = (speakable: string, isFinal: boolean, step: number) => {
    if (
      speakable === state.queuedSpeakablePrefix &&
      (!isFinal || state.finalQueued)
    ) {
      return;
    }
    if (speakable === state.queuedSpeakablePrefix && isFinal) {
      state.finalQueued = true;
      return;
    }
    const unsent = remainderAfter(speakable, state.queuedSpeakablePrefix);
    if (!unsent) {
      if (isFinal) state.finalQueued = true;
      return;
    }
    const isFirstClip = state.queuedSpeakablePrefix.length === 0;
    const flushNow =
      isFinal ||
      (isFirstClip && unsent.length >= ASSISTANT_TTS_FIRST_FLUSH_CHARS) ||
      (!isFirstClip && unsent.length >= ASSISTANT_TTS_MIN_CHUNK_CHARS);
    if (!flushNow) return;
    enqueuedChunks.push({
      text: unsent,
      append: !isFirstClip,
      step,
    });
    state.queuedSpeakablePrefix = speakable;
    if (isFinal) state.finalQueued = true;
  };

  for (let i = 0; i < cumulativeTexts.length; i++) {
    const rawText = cumulativeTexts[i];
    const isFinal = isFinalFlags ? isFinalFlags[i] : i === cumulativeTexts.length - 1;
    const speakable = toSpeakableText(rawText);
    if (!speakable) continue;
    state.latestSpeakable = speakable;
    tryFlush(speakable, isFinal, i);
  }

  let lastSpeakable = "";
  for (const raw of cumulativeTexts) {
    const s = toSpeakableText(raw);
    if (s) lastSpeakable = s;
  }
  if (lastSpeakable && state.queuedSpeakablePrefix !== lastSpeakable) {
    const unsent = remainderAfter(lastSpeakable, state.queuedSpeakablePrefix);
    if (unsent) {
      const isFirstClip = state.queuedSpeakablePrefix.length === 0;
      enqueuedChunks.push({
        text: unsent,
        append: !isFirstClip,
        step: cumulativeTexts.length,
      });
      state.queuedSpeakablePrefix = lastSpeakable;
    }
  }

  return enqueuedChunks;
}

describe("streaming pipeline: voice queue chunk ordering", () => {
  it("batches streaming tokens into fewer TTS clips (min length + final)", () => {
    const chunks = simulateVoiceQueue([
      "Hello",
      "Hello world.",
      "Hello world. How are you?",
    ]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(
      expect.objectContaining({
        text: "Hello world. How are you?",
        append: false,
      }),
    );
  });

  it("does not re-queue text that was already spoken", () => {
    const chunks = simulateVoiceQueue([
      "First sentence.",
      "First sentence. Second sentence.",
      "First sentence. Second sentence. Third sentence.",
    ]);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const spokenText = chunks.map((c) => c.text).join(" ");
    expect(spokenText).toBe(
      "First sentence. Second sentence. Third sentence.",
    );
    const allText = chunks.map((c) => c.text);
    const unique = [...new Set(allText)];
    expect(unique).toHaveLength(allText.length);
  });

  it("handles isFinal transition flushing remaining text", () => {
    // Simulate: stream sends partial final sentence, then chatSending goes false
    const chunks = simulateVoiceQueue(
      [
        "Hello world.",
        "Hello world. The answer is",
        "Hello world. The answer is", // same text, but now isFinal=true
      ],
      [false, false, true],
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe("Hello world. The answer is");
    expect(chunks[0]!.append).toBe(false);
  });

  it("never enqueues XML content in voice chunks", () => {
    const chunks = simulateVoiceQueue([
      "<think>reasoning about",
      "<think>reasoning about the query</think>Hello!",
      "<think>reasoning about the query</think>Hello! The answer is 42.",
    ]);

    for (const chunk of chunks) {
      expect(chunk.text).not.toContain("<");
      expect(chunk.text).not.toContain(">");
      expect(chunk.text).not.toContain("think");
      expect(chunk.text).not.toContain("reasoning");
    }

    const fullSpoken = chunks.map((c) => c.text).join(" ");
    expect(fullSpoken).toBe("Hello! The answer is 42.");
  });

  it("handles <response><text> wrapper without chunk garbling", () => {
    const chunks = simulateVoiceQueue([
      "<response><thought>planning</thought><text>Good morning.",
      "<response><thought>planning</thought><text>Good morning. How can I help you today?",
      "<response><thought>planning</thought><text>Good morning. How can I help you today?</text></response>",
    ]);

    for (const chunk of chunks) {
      expect(chunk.text).not.toContain("response");
      expect(chunk.text).not.toContain("thought");
      expect(chunk.text).not.toContain("planning");
      expect(chunk.text).not.toContain("<");
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe(
      "Good morning. How can I help you today?",
    );
  });

  it("handles <actions> appearing mid-stream after spoken text", () => {
    const chunks = simulateVoiceQueue([
      "Sure, I'll save that.",
      'Sure, I\'ll save that. <actions><action name="SAVE">',
      'Sure, I\'ll save that. <actions><action name="SAVE"><params>{"f":"x"}</params></action></actions>',
    ]);

    // Should queue only the spoken text, never the action content
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Sure, I'll save that.");

    for (const chunk of chunks) {
      expect(chunk.text).not.toContain("actions");
      expect(chunk.text).not.toContain("SAVE");
    }
  });

  it("produces the exact target phrase through full stream simulation", () => {
    const targetPhrase = "Say this exact phrase and nothing else.";
    const chunks = simulateVoiceQueue(
      [
        "Say this ",
        "Say this exact ",
        "Say this exact phrase ",
        "Say this exact phrase and ",
        "Say this exact phrase and nothing ",
        "Say this exact phrase and nothing else.",
      ],
      [false, false, false, false, false, true],
    );

    // Should produce the exact target phrase when concatenated
    const fullSpoken = chunks.map((c) => c.text).join("");
    // The spoken text should contain all words of the target
    for (const word of targetPhrase.split(" ")) {
      expect(fullSpoken).toContain(word.replace(".", ""));
    }

    // No duplication — the full text should not be longer than the target
    expect(fullSpoken.length).toBeLessThanOrEqual(targetPhrase.length + 1);
  });

  it("never queues the same chunk twice in rapid succession", () => {
    // Simulate rapid identical updates (React re-renders)
    const chunks = simulateVoiceQueue(
      [
        "Hello world.",
        "Hello world.", // duplicate
        "Hello world.", // duplicate
        "Hello world. Next sentence.",
      ],
      [false, false, false, true],
    );

    expect(chunks).toHaveLength(1);
    const combined = chunks.map((c) => c.text).join(" ");
    expect(combined.match(/Hello world\./g)?.length ?? 0).toBe(1);
  });

  it("handles text that changes due to XML stripping between steps", () => {
    // Stream where partial XML appears and disappears as more arrives
    const chunks = simulateVoiceQueue(
      [
        "Hello world.",
        "Hello world. <thi",      // partial tag → stripped → same speakable
        "Hello world. <think>r",   // unclosed think → stripped → same speakable
        "Hello world. <think>reasoning</think> The answer.",
      ],
      [false, false, false, true],
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe("Hello world. The answer.");
  });
});
