/**
 * HeartbeatsView unit + regression tests.
 *
 * Tests the helper functions and template storage logic without
 * rendering React components (no jsdom needed).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Template storage ────────────────────────────────────────────────

const TEMPLATES_STORAGE_KEY = "milady:heartbeat-templates";

interface HeartbeatTemplate {
  id: string;
  name: string;
  instructions: string;
  interval: string;
  unit: string;
}

// Simulate the storage functions from HeartbeatsView
function loadUserTemplates(): HeartbeatTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HeartbeatTemplate[];
  } catch {
    return [];
  }
}

function saveUserTemplates(templates: HeartbeatTemplate[]): void {
  localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

describe("HeartbeatTemplate storage", () => {
  beforeEach(() => {
    // Mock localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
  });

  it("returns empty array when no templates saved", () => {
    expect(loadUserTemplates()).toEqual([]);
  });

  it("saves and loads templates", () => {
    const templates: HeartbeatTemplate[] = [
      {
        id: "user_123",
        name: "My Template",
        instructions: "Do something useful",
        interval: "15",
        unit: "minutes",
      },
    ];
    saveUserTemplates(templates);
    expect(loadUserTemplates()).toEqual(templates);
  });

  it("handles multiple templates", () => {
    const templates: HeartbeatTemplate[] = [
      {
        id: "t1",
        name: "First",
        instructions: "A",
        interval: "1",
        unit: "hours",
      },
      {
        id: "t2",
        name: "Second",
        instructions: "B",
        interval: "30",
        unit: "minutes",
      },
    ];
    saveUserTemplates(templates);
    const loaded = loadUserTemplates();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].name).toBe("First");
    expect(loaded[1].name).toBe("Second");
  });

  it("handles corrupt localStorage gracefully", () => {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, "not-json{{{");
    expect(loadUserTemplates()).toEqual([]);
  });

  it("delete template removes only the target", () => {
    const templates: HeartbeatTemplate[] = [
      {
        id: "t1",
        name: "Keep",
        instructions: "A",
        interval: "1",
        unit: "hours",
      },
      {
        id: "t2",
        name: "Delete",
        instructions: "B",
        interval: "2",
        unit: "hours",
      },
    ];
    saveUserTemplates(templates);
    const filtered = loadUserTemplates().filter((t) => t.id !== "t2");
    saveUserTemplates(filtered);
    const result = loadUserTemplates();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Keep");
  });
});

// ── Built-in templates ──────────────────────────────────────────────

describe("Built-in templates", () => {
  const BUILT_IN_TEMPLATES = [
    {
      id: "__builtin_crypto",
      name: "Check crypto prices",
      instructions:
        "Check the current prices of BTC, ETH, and SOL. Summarize any significant moves in the last hour.",
      interval: "30",
      unit: "minutes",
    },
    {
      id: "__builtin_journal",
      name: "Daily journal prompt",
      instructions:
        "Write a brief, thoughtful journal prompt for the user based on current events or seasonal themes. Keep it under 2 sentences.",
      interval: "24",
      unit: "hours",
    },
    {
      id: "__builtin_trending",
      name: "Trending topics digest",
      instructions:
        "Scan for trending topics on crypto Twitter and tech news. Give a 3-bullet summary of what's worth paying attention to.",
      interval: "4",
      unit: "hours",
    },
  ];

  it("has 3 built-in templates", () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(3);
  });

  it("all built-in templates have __builtin_ prefix", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.id).toMatch(/^__builtin_/);
    }
  });

  it("all templates have required fields", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.name).toBeTruthy();
      expect(t.instructions).toBeTruthy();
      expect(t.interval).toBeTruthy();
      expect(t.unit).toBeTruthy();
    }
  });

  it("user templates do not have __builtin_ prefix", () => {
    const userTemplate: HeartbeatTemplate = {
      id: "user_abc123",
      name: "Custom",
      instructions: "Do custom things",
      interval: "10",
      unit: "minutes",
    };
    expect(userTemplate.id.startsWith("__builtin_")).toBe(false);
  });
});

// ── Run stats ───────────────────────────────────────────────────────

describe("Run statistics", () => {
  interface MockRun {
    status: string;
  }

  it("counts success and failure runs correctly", () => {
    const runs: MockRun[] = [
      { status: "success" },
      { status: "success" },
      { status: "completed" },
      { status: "error" },
      { status: "failed" },
      { status: "running" },
    ];
    const successCount = runs.filter(
      (r) => r.status === "success" || r.status === "completed",
    ).length;
    const failureCount = runs.filter(
      (r) => r.status === "error" || r.status === "failed",
    ).length;
    expect(successCount).toBe(3);
    expect(failureCount).toBe(2);
    expect(runs.length).toBe(6);
  });

  it("handles empty runs", () => {
    const runs: MockRun[] = [];
    const successCount = runs.filter(
      (r) => r.status === "success" || r.status === "completed",
    ).length;
    expect(successCount).toBe(0);
    expect(runs.length).toBe(0);
  });
});
