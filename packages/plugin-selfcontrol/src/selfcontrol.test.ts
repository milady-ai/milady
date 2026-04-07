import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: childProcessMocks.execFile,
}));

import {
  buildPrivilegedHostsWriteInvocation,
  buildSelfControlManagedHostsBlock,
  cancelSelfControlExpiryTimer,
  extractWebsiteTargetsFromText,
  getSelfControlPermissionState,
  getSelfControlStatus,
  hasWebsiteBlockDeferralIntent,
  normalizeWebsiteTargets,
  openSelfControlPermissionLocation,
  parseSelfControlBlockRequest,
  requestSelfControlPermission,
  resetSelfControlStatusCache,
  resolveSelfControlElevationPromptMethod,
  setSelfControlPluginConfig,
  startSelfControlBlock,
  stopSelfControlBlock,
} from "./selfcontrol";

let tempDir = "";
let hostsFilePath = "";
let originalPath = "";

function createPermissionError(): NodeJS.ErrnoException {
  const error = new Error("permission denied") as NodeJS.ErrnoException;
  error.code = "EACCES";
  return error;
}

function installElevationPromptOnPath(): void {
  if (process.platform === "darwin") {
    fs.writeFileSync(path.join(tempDir, "osascript"), "", "utf8");
    process.env.PATH = `${tempDir}${path.delimiter}${originalPath}`;
    return;
  }

  if (process.platform === "linux") {
    fs.writeFileSync(path.join(tempDir, "pkexec"), "", "utf8");
    process.env.PATH = `${tempDir}${path.delimiter}${originalPath}`;
    return;
  }

  if (process.platform === "win32") {
    fs.writeFileSync(path.join(tempDir, "powershell.exe"), "", "utf8");
    process.env.PATH = `${tempDir}${path.delimiter}${originalPath}`;
  }
}

function extractPrivilegedWritePaths(
  _command: string,
  args: string[],
): { source: string; target: string } {
  if (process.platform === "darwin") {
    return {
      source: args.at(-2) ?? "",
      target: args.at(-1) ?? "",
    };
  }

  if (process.platform === "linux") {
    return {
      source: args[4] ?? "",
      target: args[5] ?? "",
    };
  }

  const script = args[2] ?? "";
  const sourceMatch = script.match(/'-Source',\s*'([^']+)'/);
  const targetMatch = script.match(/'-Target',\s*'([^']+)'/);
  return {
    source: sourceMatch?.[1] ?? "",
    target: targetMatch?.[1] ?? "",
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-selfcontrol-"));
  hostsFilePath = path.join(tempDir, "hosts");
  originalPath = process.env.PATH ?? "";
  fs.writeFileSync(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
  setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });
  childProcessMocks.execFile
    .mockReset()
    .mockImplementation(
      (
        _command: string,
        _args: string[],
        callback?: (
          error: Error | null,
          stdout?: string,
          stderr?: string,
        ) => void,
      ) => {
        callback?.(null, "", "");
        return {} as never;
      },
    );
});

afterEach(() => {
  cancelSelfControlExpiryTimer();
  resetSelfControlStatusCache();
  setSelfControlPluginConfig(undefined);
  process.env.PATH = originalPath;
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("normalizeWebsiteTargets", () => {
  it("normalizes URLs and removes duplicates", () => {
    expect(
      normalizeWebsiteTargets([
        "https://x.com/home",
        "x.com",
        "twitter.com,",
        "localhost",
      ]),
    ).toEqual(["x.com", "twitter.com"]);
  });

  it("rejects invalid or private-looking targets", () => {
    expect(
      normalizeWebsiteTargets(["localhost", "127.0.0.1", "intranet", ""]),
    ).toEqual([]);
  });
});

describe("parseSelfControlBlockRequest", () => {
  it("parses websites and duration from message text", () => {
    const parsed = parseSelfControlBlockRequest(undefined, {
      content: {
        text: "Block twitter.com and x.com for 2 hours.",
      },
    } as never);

    expect(parsed.request).toEqual({
      websites: ["twitter.com", "x.com"],
      durationMinutes: 120,
    });
  });

  it("supports indefinite blocks from message text", () => {
    const parsed = parseSelfControlBlockRequest(undefined, {
      content: {
        text: "Block x.com until I unblock it.",
      },
    } as never);

    expect(parsed.request).toEqual({
      websites: ["x.com"],
      durationMinutes: null,
    });
  });

  it("returns an error when no websites are present", () => {
    const parsed = parseSelfControlBlockRequest(undefined, {
      content: {
        text: "Help me focus for an hour.",
      },
    } as never);

    expect(parsed.request).toBeNull();
    expect(parsed.error).toMatch(/could not determine which public website hostnames/i);
  });

  it("captures hostnames at the end of a sentence", () => {
    expect(
      extractWebsiteTargetsFromText(
        "The websites distracting me are x.com and twitter.com. Do not block them yet.",
      ),
    ).toEqual(["x.com", "twitter.com"]);
  });
});

describe("block intent guards", () => {
  it("treats explicit not-yet instructions as a deferral", () => {
    expect(
      hasWebsiteBlockDeferralIntent(
        "The websites distracting me are x.com and twitter.com. Do not block them yet.",
      ),
    ).toBe(true);

    expect(
      hasWebsiteBlockDeferralIntent(
        "Use self control now. Actually block the websites for 1 minute instead of giving advice.",
      ),
    ).toBe(false);
  });
});

describe("hosts-file blocking", () => {
  it("rejects direct block requests that do not contain any public hostnames", async () => {
    const result = await startSelfControlBlock({
      websites: ["localhost", "127.0.0.1"],
      durationMinutes: 5,
    });

    expect(result).toMatchObject({
      success: false,
      error:
        "Provide at least one public website hostname, such as `x.com` or `twitter.com`.",
    });
    expect(fs.readFileSync(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });

  it("rejects direct block requests with an out-of-range duration", async () => {
    const result = await startSelfControlBlock({
      websites: ["x.com"],
      durationMinutes: 0,
    });

    expect(result).toMatchObject({
      success: false,
      error: "Duration must be between 1 and 10080 minutes.",
    });
  });

  it("writes the expected managed hosts block", () => {
    const block = buildSelfControlManagedHostsBlock({
      version: 1,
      startedAt: "2026-04-04T10:00:00.000Z",
      endsAt: "2026-04-04T11:00:00.000Z",
      websites: ["x.com", "twitter.com"],
    });

    expect(block).toContain("# >>> milady-selfcontrol >>>");
    expect(block).toContain('"endsAt":"2026-04-04T11:00:00.000Z"');
    expect(block).toContain("0.0.0.0 x.com");
    expect(block).toContain("::1 twitter.com");
  });

  it("expires a timed block automatically while the runtime is active", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-04T10:00:00.000Z"));

    const result = await startSelfControlBlock({
      websites: ["x.com"],
      durationMinutes: 1,
    });

    expect(result).toMatchObject({
      success: true,
      endsAt: "2026-04-04T10:01:00.000Z",
    });
    expect(fs.readFileSync(hostsFilePath, "utf8")).toContain("0.0.0.0 x.com");

    await vi.advanceTimersByTimeAsync(60_000);

    const status = await getSelfControlStatus();

    expect(status.active).toBe(false);
    expect(status.websites).toEqual([]);
    expect(fs.readFileSync(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });

  it("preserves managed metadata for LifeOps-owned blocks", async () => {
    await expect(
      startSelfControlBlock({
        websites: ["x.com"],
        durationMinutes: null,
        metadata: {
          managedBy: "lifeops",
          blockedGroups: ["social-media"],
        },
      }),
    ).resolves.toMatchObject({
      success: true,
      endsAt: null,
    });

    await expect(getSelfControlStatus()).resolves.toMatchObject({
      active: true,
      websites: ["x.com"],
      managedBy: "lifeops",
      metadata: {
        managedBy: "lifeops",
        blockedGroups: ["social-media"],
      },
    });
  });

  it("falls back to an elevation prompt when direct hosts writes are denied", async () => {
    installElevationPromptOnPath();

    const realWriteFileSync = fs.writeFileSync.bind(fs);
    const realReadFileSync = fs.readFileSync.bind(fs);

    vi.spyOn(fs, "writeFileSync").mockImplementation(
      (
        file: fs.PathOrFileDescriptor,
        data: string | NodeJS.ArrayBufferView,
        options?: fs.WriteFileOptions,
      ) => {
        if (String(file) === hostsFilePath) {
          throw createPermissionError();
        }
        return realWriteFileSync(file, data, options);
      },
    );

    childProcessMocks.execFile.mockImplementation(
      (
        command: string,
        args: string[],
        callback?: (
          error: Error | null,
          stdout?: string,
          stderr?: string,
        ) => void,
      ) => {
        const { source, target } = extractPrivilegedWritePaths(command, args);
        realWriteFileSync(target, realReadFileSync(source, "utf8"), "utf8");
        callback?.(null, "", "");
        return {} as never;
      },
    );

    const result = await startSelfControlBlock({
      websites: ["x.com"],
      durationMinutes: 5,
    });

    expect(result).toMatchObject({
      success: true,
    });
    expect(childProcessMocks.execFile).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(hostsFilePath, "utf8")).toContain("0.0.0.0 x.com");
  });

  it("uses the same elevation fallback when removing a block", async () => {
    await startSelfControlBlock({
      websites: ["x.com"],
      durationMinutes: 5,
    });

    installElevationPromptOnPath();

    const realWriteFileSync = fs.writeFileSync.bind(fs);
    const realReadFileSync = fs.readFileSync.bind(fs);
    let directWriteAttempts = 0;

    vi.spyOn(fs, "writeFileSync").mockImplementation(
      (
        file: fs.PathOrFileDescriptor,
        data: string | NodeJS.ArrayBufferView,
        options?: fs.WriteFileOptions,
      ) => {
        if (String(file) === hostsFilePath && directWriteAttempts === 0) {
          directWriteAttempts += 1;
          throw createPermissionError();
        }
        return realWriteFileSync(file, data, options);
      },
    );

    childProcessMocks.execFile.mockImplementation(
      (
        command: string,
        args: string[],
        callback?: (
          error: Error | null,
          stdout?: string,
          stderr?: string,
        ) => void,
      ) => {
        const { source, target } = extractPrivilegedWritePaths(command, args);
        realWriteFileSync(target, realReadFileSync(source, "utf8"), "utf8");
        callback?.(null, "", "");
        return {} as never;
      },
    );

    const result = await stopSelfControlBlock();

    expect(result).toMatchObject({
      success: true,
      removed: true,
    });
    expect(childProcessMocks.execFile).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });
});

describe("elevation support", () => {
  it("returns false when there is no hosts file location to open", async () => {
    setSelfControlPluginConfig({
      hostsFilePath: path.join(tempDir, "missing-hosts"),
      statusCacheTtlMs: 0,
    });

    await expect(openSelfControlPermissionLocation()).resolves.toBe(false);
    expect(childProcessMocks.execFile).not.toHaveBeenCalled();
  });

  it("opens the hosts file location when a hosts file exists", async () => {
    await expect(openSelfControlPermissionLocation()).resolves.toBe(true);
    expect(childProcessMocks.execFile).toHaveBeenCalledTimes(1);
  });

  it("reports website blocking as granted when the hosts file is writable", async () => {
    const permission = await getSelfControlPermissionState();

    expect(permission).toMatchObject({
      id: "website-blocking",
      status: "granted",
      canRequest: false,
      hostsFilePath,
      promptAttempted: false,
      promptSucceeded: false,
    });
    expect(permission.reason).toMatch(/edit the system hosts file directly/i);
  });

  it("reports website blocking as requestable when per-operation elevation is available", async () => {
    installElevationPromptOnPath();

    const realAccessSync = fs.accessSync.bind(fs);
    vi.spyOn(fs, "accessSync").mockImplementation((file, mode) => {
      if (String(file) === hostsFilePath) {
        throw createPermissionError();
      }
      return realAccessSync(file, mode);
    });

    const permission = await getSelfControlPermissionState();

    expect(permission).toMatchObject({
      id: "website-blocking",
      status: "not-determined",
      canRequest: true,
      supportsElevationPrompt: true,
      promptAttempted: false,
      promptSucceeded: false,
    });
    expect(permission.reason).toMatch(
      /ask the os for administrator\/root approval/i,
    );
  });

  it("raises a no-op elevation prompt when website blocking permission is requested", async () => {
    installElevationPromptOnPath();

    const realAccessSync = fs.accessSync.bind(fs);
    const realWriteFileSync = fs.writeFileSync.bind(fs);
    const realReadFileSync = fs.readFileSync.bind(fs);

    vi.spyOn(fs, "accessSync").mockImplementation((file, mode) => {
      if (String(file) === hostsFilePath) {
        throw createPermissionError();
      }
      return realAccessSync(file, mode);
    });

    vi.spyOn(fs, "writeFileSync").mockImplementation(
      (
        file: fs.PathOrFileDescriptor,
        data: string | NodeJS.ArrayBufferView,
        options?: fs.WriteFileOptions,
      ) => {
        if (String(file) === hostsFilePath) {
          throw createPermissionError();
        }
        return realWriteFileSync(file, data, options);
      },
    );

    childProcessMocks.execFile.mockImplementation(
      (
        command: string,
        args: string[],
        callback?: (
          error: Error | null,
          stdout?: string,
          stderr?: string,
        ) => void,
      ) => {
        const { source, target } = extractPrivilegedWritePaths(command, args);
        realWriteFileSync(target, realReadFileSync(source, "utf8"), "utf8");
        callback?.(null, "", "");
        return {} as never;
      },
    );

    const permission = await requestSelfControlPermission();

    expect(childProcessMocks.execFile).toHaveBeenCalledTimes(1);
    expect(permission).toMatchObject({
      id: "website-blocking",
      status: "not-determined",
      canRequest: true,
      promptAttempted: true,
      promptSucceeded: true,
    });
    expect(permission.reason).toMatch(/prompt completed successfully/i);
  });

  it("reports website blocking as manual-only when no elevation prompt is available", async () => {
    process.env.PATH = tempDir;

    const realAccessSync = fs.accessSync.bind(fs);
    vi.spyOn(fs, "accessSync").mockImplementation((file, mode) => {
      if (String(file) === hostsFilePath) {
        throw createPermissionError();
      }
      return realAccessSync(file, mode);
    });

    const permission = await getSelfControlPermissionState();

    expect(permission).toMatchObject({
      id: "website-blocking",
      status: "denied",
      canRequest: false,
      supportsElevationPrompt: false,
      promptAttempted: false,
      promptSucceeded: false,
    });
    expect(permission.reason).toMatch(
      /cannot raise an administrator\/root prompt/i,
    );
  });

  it("resolves prompt methods from PATH for each desktop platform", () => {
    const existsSync = vi.spyOn(fs, "existsSync");

    existsSync.mockImplementation((candidate) =>
      String(candidate).endsWith(path.join("bin", "osascript")),
    );
    process.env.PATH = [path.join(tempDir, "bin"), originalPath]
      .filter(Boolean)
      .join(":");
    expect(resolveSelfControlElevationPromptMethod("darwin")).toBe("osascript");

    existsSync.mockImplementation((candidate) =>
      String(candidate).endsWith(path.join("bin", "pkexec")),
    );
    process.env.PATH = [path.join(tempDir, "bin"), originalPath]
      .filter(Boolean)
      .join(":");
    expect(resolveSelfControlElevationPromptMethod("linux")).toBe("pkexec");

    existsSync.mockImplementation((candidate) =>
      String(candidate).endsWith(path.join("bin", "powershell.exe")),
    );
    process.env.PATH = [path.join(tempDir, "bin"), originalPath]
      .filter(Boolean)
      .join(";");
    expect(resolveSelfControlElevationPromptMethod("win32")).toBe(
      "powershell-runas",
    );
  });

  it("builds the expected privileged write commands", () => {
    expect(
      buildPrivilegedHostsWriteInvocation(
        "/tmp/hosts.next",
        "/etc/hosts",
        "darwin",
      ),
    ).toMatchObject({
      command: "osascript",
    });

    expect(
      buildPrivilegedHostsWriteInvocation(
        "/tmp/hosts.next",
        "/etc/hosts",
        "linux",
      ),
    ).toEqual({
      command: "pkexec",
      args: [
        "/usr/bin/install",
        "-m",
        "644",
        "--",
        "/tmp/hosts.next",
        "/etc/hosts",
      ],
    });

    expect(
      buildPrivilegedHostsWriteInvocation(
        "C:\\Temp\\hosts.next",
        "C:\\Windows\\System32\\drivers\\etc\\hosts",
        "win32",
        "C:\\Temp\\write-hosts.ps1",
      ),
    ).toMatchObject({
      command: "powershell",
      workerScriptContent: expect.stringContaining("Copy-Item -LiteralPath"),
    });
  });
});
