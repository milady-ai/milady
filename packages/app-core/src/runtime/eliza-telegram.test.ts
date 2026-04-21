import { describe, expect, it } from "vitest";

const MAX_CHAT_ENTRIES = 500;

function evictOldestIfNeeded(
  map: Map<number, Array<{ role: string; content: string }>>,
): void {
  if (map.size <= MAX_CHAT_ENTRIES) return;
  const oldest = map.keys().next().value;
  if (oldest !== undefined) {
    map.delete(oldest);
  }
}

describe("Telegram chat history eviction", () => {
  it("does nothing when under the limit", () => {
    const map = new Map<number, Array<{ role: string; content: string }>>();
    map.set(1, [{ role: "user", content: "hi" }]);
    evictOldestIfNeeded(map);
    expect(map.size).toBe(1);
  });

  it("evicts the oldest entry when over the limit", () => {
    const map = new Map<number, Array<{ role: string; content: string }>>();
    for (let i = 0; i <= MAX_CHAT_ENTRIES; i++) {
      map.set(i, [{ role: "user", content: `msg-${i}` }]);
    }
    expect(map.size).toBe(MAX_CHAT_ENTRIES + 1);
    evictOldestIfNeeded(map);
    expect(map.size).toBe(MAX_CHAT_ENTRIES);
    expect(map.has(0)).toBe(false);
    expect(map.has(1)).toBe(true);
  });
});
