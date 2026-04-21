/**
 * Tests for native/file-watcher.ts
 *
 * Covers watch lifecycle, event filtering, and status reporting.
 * Uses Node fs.watch stub — no real FS events are generated.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockWatcher } = vi.hoisted(() => ({
  mockWatcher: {
    close: vi.fn(),
  },
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    watch: vi.fn().mockReturnValue(mockWatcher),
  },
}));

import fs from "node:fs";
import type { FileChangeEvent } from "../native/file-watcher";
import { getFileWatcher } from "../native/file-watcher";

const mockFs = vi.mocked(fs, true);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Re-create a fresh watcher instance for each test. */
function freshWatcher() {
  // The module-level singleton persists across tests; stop all watches first.
  const w = getFileWatcher();
  w.stopAll();
  return w;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getFileWatcher (singleton)", () => {
  it("returns the same instance on every call", () => {
    const a = getFileWatcher();
    const b = getFileWatcher();
    expect(a).toBe(b);
  });
});

describe("fileWatcher.startWatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.watch as ReturnType<typeof vi.fn>).mockReturnValue(mockWatcher);
  });

  afterEach(() => {
    freshWatcher().stopAll();
  });

  it("throws when watch path does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);
    const watcher = freshWatcher();
    expect(() => watcher.startWatch("/nonexistent", () => {})).toThrow(
      /does not exist/,
    );
  });

  it("returns a string watchId", () => {
    const watcher = freshWatcher();
    const id = watcher.startWatch("/tmp/project", () => {});
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("each call returns a unique watchId", () => {
    const watcher = freshWatcher();
    const id1 = watcher.startWatch("/tmp/project", () => {});
    const id2 = watcher.startWatch("/tmp/other", () => {});
    expect(id1).not.toBe(id2);
  });

  it("calls fs.watch with recursive option", () => {
    const watcher = freshWatcher();
    watcher.startWatch("/tmp/project", () => {});
    expect(mockFs.watch).toHaveBeenCalledWith(
      "/tmp/project",
      { recursive: true, persistent: false },
      expect.any(Function),
    );
  });
});

describe("fileWatcher.stopWatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.watch as ReturnType<typeof vi.fn>).mockReturnValue(mockWatcher);
    mockWatcher.close.mockReset();
  });

  afterEach(() => {
    freshWatcher().stopAll();
  });

  it("returns false for an unknown watchId", () => {
    const watcher = freshWatcher();
    expect(watcher.stopWatch("nonexistent")).toBe(false);
  });

  it("closes the watcher and returns true for a known watchId", () => {
    const watcher = freshWatcher();
    const id = watcher.startWatch("/tmp/project", () => {});
    expect(watcher.stopWatch(id)).toBe(true);
    expect(mockWatcher.close).toHaveBeenCalledTimes(1);
  });

  it("removes the watch from listWatches after stopping", () => {
    const watcher = freshWatcher();
    const id = watcher.startWatch("/tmp/project", () => {});
    expect(watcher.listWatches()).toHaveLength(1);
    watcher.stopWatch(id);
    expect(watcher.listWatches()).toHaveLength(0);
  });
});

describe("fileWatcher.listWatches / getWatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.watch as ReturnType<typeof vi.fn>).mockReturnValue(mockWatcher);
    mockWatcher.close.mockReset();
  });

  afterEach(() => {
    freshWatcher().stopAll();
  });

  it("returns an empty array when no watches are active", () => {
    expect(freshWatcher().listWatches()).toHaveLength(0);
  });

  it("lists all active watches", () => {
    const watcher = freshWatcher();
    watcher.startWatch("/tmp/a", () => {});
    watcher.startWatch("/tmp/b", () => {});
    const list = watcher.listWatches();
    expect(list).toHaveLength(2);
    expect(list.map((w) => w.watchPath).sort()).toEqual(
      ["/tmp/a", "/tmp/b"].sort(),
    );
  });

  it("getWatch returns null for unknown id", () => {
    expect(freshWatcher().getWatch("unknown")).toBeNull();
  });

  it("getWatch returns status for a known watchId", () => {
    const watcher = freshWatcher();
    const id = watcher.startWatch("/tmp/project", () => {});
    const status = watcher.getWatch(id);
    expect(status).not.toBeNull();
    expect(status?.watchId).toBe(id);
    expect(status?.watchPath).toBe("/tmp/project");
    expect(status?.active).toBe(true);
    expect(status?.eventCount).toBe(0);
  });
});

describe("fileWatcher change event emission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.watch as ReturnType<typeof vi.fn>).mockImplementation(
      (_path, _opts, callback) => {
        // Store the callback so tests can invoke it manually.
        mockWatchCallback = callback as (
          event: string,
          filename: string,
        ) => void;
        return mockWatcher;
      },
    );
    mockWatcher.close.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    freshWatcher().stopAll();
  });

  let mockWatchCallback: ((event: string, filename: string) => void) | null =
    null;

  it("calls send callback with a FileChangeEvent after debounce", async () => {
    mockFs.existsSync.mockImplementation((_p) => {
      // Workspace path exists, and the changed file also exists (= modified)
      return true;
    });

    const events: FileChangeEvent[] = [];
    const watcher = freshWatcher();
    watcher.startWatch("/tmp/project", (event) => events.push(event));

    // Simulate a file change event from the OS watcher
    mockWatchCallback?.("change", "src/index.ts");

    // Before debounce fires, nothing should be emitted
    expect(events).toHaveLength(0);

    // Advance past the 50ms debounce
    await vi.runAllTimersAsync();

    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev?.type).toBe("modified");
    expect(ev?.filePath).toContain("index.ts");
    expect(typeof ev?.timestamp).toBe("number");
  });
});
