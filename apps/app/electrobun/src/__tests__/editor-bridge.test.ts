/**
 * Tests for native/editor-bridge.ts
 *
 * Covers editor detection, session lifecycle, and error cases.
 * Uses spawnSync mock — no real processes are launched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    accessSync: vi.fn(),
    constants: { X_OK: 1 },
  },
}));

// Mock Bun.spawn (used in openInEditor to launch the editor detached)
const mockBunSpawn = vi.fn(() => ({
  unref: vi.fn(),
  exited: Promise.resolve(0),
}));
(Bun as unknown as { spawn: unknown }).spawn = mockBunSpawn;

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  clearActiveEditorSession,
  detectInstalledEditors,
  getActiveEditorSession,
  listInstalledEditors,
  openInEditor,
} from "../native/editor-bridge";

const mockSpawnSync = vi.mocked(spawnSync);
const mockFs = vi.mocked(fs, true);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpawnResult(exitCode: number) {
  return {
    status: exitCode,
    stdout: Buffer.from(""),
    stderr: Buffer.from(""),
    output: [] as string[],
    pid: 1234,
    signal: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectInstalledEditors", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBunSpawn.mockReset();
    // Default: `which` returns failure, no candidates exist
    mockSpawnSync.mockReturnValue(makeSpawnResult(1));
    mockFs.existsSync.mockReturnValue(false);
    mockFs.accessSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
  });

  afterEach(() => {
    clearActiveEditorSession();
  });

  it("returns all known editors even when none installed", () => {
    const editors = detectInstalledEditors();
    expect(editors.length).toBeGreaterThan(0);
    for (const editor of editors) {
      expect(editor.installed).toBe(false);
    }
  });

  it("marks vscode installed when `which code` succeeds", () => {
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (cmd === "which" && Array.isArray(args) && args[0] === "code") {
        return makeSpawnResult(0);
      }
      return makeSpawnResult(1);
    });

    const editors = detectInstalledEditors();
    const vscode = editors.find((e) => e.id === "vscode");
    expect(vscode?.installed).toBe(true);
    expect(vscode?.command).toBe("code");
  });

  it("marks cursor installed when `which cursor` succeeds", () => {
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (cmd === "which" && Array.isArray(args) && args[0] === "cursor") {
        return makeSpawnResult(0);
      }
      return makeSpawnResult(1);
    });

    const editors = detectInstalledEditors();
    const cursor = editors.find((e) => e.id === "cursor");
    expect(cursor?.installed).toBe(true);
  });
});

describe("listInstalledEditors", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBunSpawn.mockReset();
    mockSpawnSync.mockReturnValue(makeSpawnResult(1));
    mockFs.existsSync.mockReturnValue(false);
    mockFs.accessSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
  });

  afterEach(() => {
    clearActiveEditorSession();
  });

  it("returns empty array when no editors installed", () => {
    expect(listInstalledEditors()).toHaveLength(0);
  });

  it("returns only installed editors", () => {
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (cmd === "which" && Array.isArray(args) && args[0] === "code") {
        return makeSpawnResult(0);
      }
      return makeSpawnResult(1);
    });

    const installed = listInstalledEditors();
    expect(installed.every((e) => e.installed)).toBe(true);
    expect(installed.some((e) => e.id === "vscode")).toBe(true);
  });
});

describe("openInEditor", () => {
  const workspacePath = "/Users/user/Projects/my-project";

  beforeEach(() => {
    vi.resetAllMocks();
    mockBunSpawn.mockReset();
    mockBunSpawn.mockReturnValue({
      unref: vi.fn(),
      exited: Promise.resolve(0),
    });
    // Make `which code` succeed
    mockSpawnSync.mockReturnValue(makeSpawnResult(0));
    // Workspace path exists
    mockFs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    clearActiveEditorSession();
  });

  it("throws when workspace path does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(() => openInEditor("vscode", workspacePath)).toThrow(
      /does not exist/,
    );
  });

  it("throws when editor is not installed", () => {
    // `which` always fails and no candidates exist
    mockSpawnSync.mockReturnValue(makeSpawnResult(1));
    mockFs.existsSync.mockReturnValue(true);
    mockFs.accessSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(() => openInEditor("cursor", workspacePath)).toThrow(
      /not installed/,
    );
  });

  it("throws for unknown editor id", () => {
    expect(() =>
      openInEditor("unknown-editor" as never, workspacePath),
    ).toThrow(/Unknown editor id/);
  });

  it("returns a session with correct metadata", () => {
    const before = Date.now();
    const session = openInEditor("vscode", workspacePath);
    const after = Date.now();

    expect(session.editorId).toBe("vscode");
    expect(session.workspacePath).toBe(workspacePath);
    expect(session.startedAt).toBeGreaterThanOrEqual(before);
    expect(session.startedAt).toBeLessThanOrEqual(after);
  });

  it("stores the session so getActiveEditorSession returns it", () => {
    const session = openInEditor("vscode", workspacePath);
    expect(getActiveEditorSession()).toEqual(session);
  });

  it("calls Bun.spawn with the editor command and workspace path", () => {
    openInEditor("vscode", workspacePath);
    expect(mockBunSpawn).toHaveBeenCalledWith(
      expect.arrayContaining(["code", workspacePath]),
      expect.objectContaining({ stdio: expect.anything() }),
    );
  });
});

describe("getActiveEditorSession / clearActiveEditorSession", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBunSpawn.mockReturnValue({
      unref: vi.fn(),
      exited: Promise.resolve(0),
    });
    mockSpawnSync.mockReturnValue(makeSpawnResult(0));
    mockFs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    clearActiveEditorSession();
  });

  it("returns null when no session active", () => {
    expect(getActiveEditorSession()).toBeNull();
  });

  it("clearActiveEditorSession removes the session", () => {
    openInEditor("vscode", "/tmp/project");
    expect(getActiveEditorSession()).not.toBeNull();
    clearActiveEditorSession();
    expect(getActiveEditorSession()).toBeNull();
  });
});
