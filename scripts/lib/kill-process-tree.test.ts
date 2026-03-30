import { execSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execSync: vi.fn(() => ""),
  };
});

import {
  signalProcessTree,
  signalSpawnedProcessTree,
} from "./kill-process-tree.mjs";

describe("signalSpawnedProcessTree", () => {
  beforeEach(() => {
    vi.mocked(execSync).mockClear();
    vi.mocked(execSync).mockReturnValue("");
  });

  it("does not call execSync when child is missing", () => {
    signalSpawnedProcessTree(undefined, "SIGTERM");
    expect(execSync).not.toHaveBeenCalled();
  });

  it("does not call execSync when pid is missing", () => {
    signalSpawnedProcessTree({ pid: undefined } as never, "SIGTERM");
    expect(execSync).not.toHaveBeenCalled();
  });
});

describe("signalProcessTree", () => {
  beforeEach(() => {
    vi.mocked(execSync).mockClear();
    vi.mocked(execSync).mockReturnValue("");
  });

  it("no-ops for non-positive pid", () => {
    signalProcessTree(0, "SIGTERM");
    signalProcessTree(-1, "SIGKILL");
    expect(execSync).not.toHaveBeenCalled();
  });

  it("uses taskkill on Windows", () => {
    if (process.platform !== "win32") return;
    signalProcessTree(4242, "SIGTERM");
    expect(execSync).toHaveBeenCalledWith(
      "taskkill /PID 4242 /T",
      expect.objectContaining({ stdio: "ignore", windowsHide: true }),
    );
  });

  it("uses taskkill /F on Windows for SIGKILL", () => {
    if (process.platform !== "win32") return;
    signalProcessTree(4242, "SIGKILL");
    expect(execSync).toHaveBeenCalledWith(
      "taskkill /PID 4242 /T /F",
      expect.objectContaining({ stdio: "ignore", windowsHide: true }),
    );
  });

  it("uses pgrep on Unix", () => {
    if (process.platform === "win32") return;
    signalProcessTree(987654, "SIGTERM");
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("pgrep -P 987654"),
      expect.any(Object),
    );
  });
});
