import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Mocks -- vi.mock factories are hoisted, so no external references allowed
// ---------------------------------------------------------------------------

// Set MILADY_DIST_PATH so resolveMiladyDistPath() never touches import.meta.dir
// (which is Bun-only and undefined in Node/vitest).
const MOCK_DIST_PATH = "/mock/milady-dist";
process.env.MILADY_DIST_PATH = MOCK_DIST_PATH;
const ORIGINAL_EXEC_PATH = process.execPath;
const ORIGINAL_PLATFORM = process.platform;

vi.mock("node:fs", () => {
  const existsSyncFn = vi.fn(() => true);
  const appendFileSyncFn = vi.fn();
  const writeFileSyncFn = vi.fn();
  const renameSyncFn = vi.fn();
  const rmSyncFn = vi.fn();
  const readFileSyncFn = vi.fn(() => "");
  const copyFileSyncFn = vi.fn();
  return {
    default: {
      existsSync: existsSyncFn,
      mkdirSync: vi.fn(),
      appendFileSync: appendFileSyncFn,
      writeFileSync: writeFileSyncFn,
      renameSync: renameSyncFn,
      readFileSync: readFileSyncFn,
      copyFileSync: copyFileSyncFn,
      readdirSync: vi.fn(() => ["entry.js"]),
      rmSync: rmSyncFn,
    },
    existsSync: existsSyncFn,
    mkdirSync: vi.fn(),
    appendFileSync: appendFileSyncFn,
    writeFileSync: writeFileSyncFn,
    renameSync: renameSyncFn,
    readFileSync: readFileSyncFn,
    copyFileSync: copyFileSyncFn,
    readdirSync: vi.fn(() => ["entry.js"]),
    rmSync: rmSyncFn,
  };
});

vi.mock("node:os", () => ({
  default: {
    homedir: vi.fn(() => "/mock/home"),
    tmpdir: vi.fn(() => "/tmp"),
  },
  homedir: vi.fn(() => "/mock/home"),
  tmpdir: vi.fn(() => "/tmp"),
}));

vi.mock("../native/loopback-port", () => ({
  findFirstAvailableLoopbackPort: vi.fn((preferred: number) =>
    Promise.resolve(preferred),
  ),
}));

// Mock Bun globals
const mockSpawn = vi.fn();
const mockSleep = vi.fn(() => Promise.resolve());

vi.stubGlobal("Bun", {
  spawn: mockSpawn,
  sleep: mockSleep,
});

// Mock fetch for health checks
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMockProcess(
  overrides: Partial<{
    pid: number;
    exitCode: number | null;
    exited: Promise<number>;
    stdout: ReadableStream<Uint8Array> | null;
    stderr: ReadableStream<Uint8Array> | null;
    kill: Mock;
  }> = {},
) {
  const exitDeferred = createDeferred<number>();
  return {
    pid: overrides.pid ?? 12345,
    exitCode: overrides.exitCode ?? null,
    exited: overrides.exited ?? exitDeferred.promise,
    stdout:
      overrides.stdout ??
      new ReadableStream({
        start(c) {
          c.close();
        },
      }),
    stderr:
      overrides.stderr ??
      new ReadableStream({
        start(c) {
          c.close();
        },
      }),
    kill:
      overrides.kill ??
      vi.fn(() => {
        exitDeferred.resolve(0);
      }),
    _exitDeferred: exitDeferred,
  };
}

function makeReadableStream(text: string) {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(encoded);
      c.close();
    },
  });
}

function makeHealthyResponse() {
  return {
    ok: true,
    json: async () => ({ ready: true }),
  };
}

/** Get the mocked fs.existsSync function to configure behavior per-test */
async function getExistsSyncMock(): Promise<Mock> {
  const fs = await import("node:fs");
  return fs.default.existsSync as Mock;
}

async function getAppendFileSyncMock(): Promise<Mock> {
  const fs = await import("node:fs");
  return fs.default.appendFileSync as Mock;
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
async function getReadFileSyncMock(): Promise<Mock> {
  const fs = await import("node:fs");
  return fs.default.readFileSync as Mock;
}

async function getWriteFileSyncMock(): Promise<Mock> {
  const fs = await import("node:fs");
  return fs.default.writeFileSync as Mock;
}

async function getCopyFileSyncMock(): Promise<Mock> {
  const fs = await import("node:fs");
  return fs.default.copyFileSync as Mock;
}

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import {
  AgentManager,
  buildChildNodePaths,
  createBugReportBundle,
  getDiagnosticLogPath,
  getHealthPollTimeoutMs,
  getMiladyDistFallbackCandidates,
  getStartupDiagnosticLogTail,
  getStartupDiagnosticsSnapshot,
  getStartupStatusPath,
  resolveBunExecutablePath,
  resolveMiladyDistPath,
} from "../native/agent";

describe("AgentManager", () => {
  let manager: AgentManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSpawn.mockReset();
    mockFetch.mockReset();
    mockSleep.mockReset();
    mockSleep.mockImplementation(() => Promise.resolve());
    Object.defineProperty(process, "execPath", {
      configurable: true,
      value: ORIGINAL_EXEC_PATH,
    });
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: ORIGINAL_PLATFORM,
    });
    process.env.MILADY_DIST_PATH = MOCK_DIST_PATH;
    delete process.env.MILADY_STARTUP_SESSION_ID;
    delete process.env.MILADY_STARTUP_STATE_FILE;
    delete process.env.MILADY_STARTUP_EVENTS_FILE;
    // Default: all filesystem checks return true (dist exists, entry.js exists, etc.)
    const existsSync = await getExistsSyncMock();
    existsSync.mockReturnValue(true);
    manager = new AgentManager();
  });

  describe("milady-dist fallback candidates", () => {
    it("prefers the Resources/app runtime path for installed apps", () => {
      const candidates = getMiladyDistFallbackCandidates(
        "/Applications/Milady-canary.app/Contents/Resources",
        "/Applications/Milady-canary.app/Contents/MacOS/launcher",
      );

      expect(candidates[0]).toBe(
        "/Applications/Milady-canary.app/Contents/Resources/app/milady-dist",
      );
      expect(candidates).toContain(
        "/Applications/Milady-canary.app/Contents/milady-dist",
      );
    });

    it("includes the sibling milady-dist path for extracted app runtimes", () => {
      const candidates = getMiladyDistFallbackCandidates(
        "/private/tmp/Milady-canary.app/Contents/Resources/app/bun",
        "/private/tmp/Milady-canary.app/Contents/MacOS/launcher",
      );

      expect(candidates).toContain(
        "/private/tmp/Milady-canary.app/Contents/Resources/app/milady-dist",
      );
      expect(new Set(candidates).size).toBe(candidates.length);
    });

    it("includes the extracted app runtime path used by self-extracting installs", () => {
      const candidates = getMiladyDistFallbackCandidates(
        "/tmp/com.miladyai.milady/canary/self-extraction/Milady-canary/bin",
        "/tmp/com.miladyai.milady/canary/self-extraction/Milady-canary/bin/launcher",
      );

      expect(candidates[0]).toBe(
        "/tmp/com.miladyai.milady/canary/self-extraction/Milady-canary/Resources/app/milady-dist",
      );
      expect(new Set(candidates).size).toBe(candidates.length);
    });

    it("includes Windows resources/app runtime candidates beside launcher.exe", () => {
      const candidates = getMiladyDistFallbackCandidates(
        "/Users/test/AppData/Local/com.miladyai.milady/canary/self-extraction/Milady-canary/bin",
        "/Users/test/AppData/Local/com.miladyai.milady/canary/self-extraction/Milady-canary/bin/launcher.exe",
      );

      expect(candidates).toContain(
        "/Users/test/AppData/Local/com.miladyai.milady/canary/self-extraction/Milady-canary/bin/resources/app/milady-dist",
      );
      expect(candidates).toContain(
        "/Users/test/AppData/Local/com.miladyai.milady/canary/self-extraction/Milady-canary/resources/app/milady-dist",
      );
    });
  });

  describe("packaged runtime resolution", () => {
    it("keeps milady-dist resolution bundle-local in packaged builds", async () => {
      const existsSync = await getExistsSyncMock();
      existsSync.mockImplementation((candidate: string) => {
        return (
          candidate ===
            "/Applications/Milady-canary.app/Contents/Resources/app/milady-dist" ||
          candidate === "/tmp/override-dist"
        );
      });

      const originalDistPath = process.env.MILADY_DIST_PATH;
      process.env.MILADY_DIST_PATH = "/tmp/override-dist";

      try {
        expect(
          resolveMiladyDistPath({
            env: process.env,
            moduleDir:
              "/Applications/Milady-canary.app/Contents/Resources/app/bun",
            execPath: "/Applications/Milady-canary.app/Contents/MacOS/launcher",
          }),
        ).toBe(
          "/Applications/Milady-canary.app/Contents/Resources/app/milady-dist",
        );
      } finally {
        if (originalDistPath === undefined) {
          delete process.env.MILADY_DIST_PATH;
        } else {
          process.env.MILADY_DIST_PATH = originalDistPath;
        }
      }
    });

    it("disables parent node_modules walking in packaged mode", async () => {
      const existsSync = await getExistsSyncMock();
      existsSync.mockImplementation((candidate: string) => {
        return (
          candidate === "/mock/milady-dist/node_modules" ||
          candidate === "/mock/node_modules"
        );
      });

      expect(
        buildChildNodePaths("/mock/milady-dist", { packagedRuntime: true }),
      ).toEqual(["/mock/milady-dist/node_modules"]);
      expect(
        buildChildNodePaths("/mock/milady-dist", { packagedRuntime: false }),
      ).toEqual(["/mock/milady-dist/node_modules", "/mock/node_modules"]);
    });

    it("prefers bundle-local Bun executables in packaged builds", async () => {
      const existsSync = await getExistsSyncMock();
      existsSync.mockImplementation((candidate: string) => {
        return (
          candidate ===
          "/Applications/Milady-canary.app/Contents/Resources/app/bun/bun"
        );
      });

      expect(
        resolveBunExecutablePath({
          execPath: "/Applications/Milady-canary.app/Contents/MacOS/launcher",
          moduleDir:
            "/Applications/Milady-canary.app/Contents/Resources/app/bun",
        }),
      ).toBe("/Applications/Milady-canary.app/Contents/Resources/app/bun/bun");
    });
  });

  describe("getHealthPollTimeoutMs()", () => {
    it("defaults to a longer startup timeout on Windows", () => {
      expect(getHealthPollTimeoutMs({}, "win32")).toBe(240_000);
      expect(getHealthPollTimeoutMs({}, "darwin")).toBe(120_000);
    });

    it("honors MILADY_AGENT_HEALTH_TIMEOUT_MS when set", () => {
      expect(
        getHealthPollTimeoutMs(
          { MILADY_AGENT_HEALTH_TIMEOUT_MS: "300000" },
          "win32",
        ),
      ).toBe(300_000);
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    Object.defineProperty(process, "execPath", {
      configurable: true,
      value: ORIGINAL_EXEC_PATH,
    });
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: ORIGINAL_PLATFORM,
    });
    await manager.dispose();
  });

  describe("initial state", () => {
    it("starts in not_started state", () => {
      const status = manager.getStatus();
      expect(status.state).toBe("not_started");
      expect(status.agentName).toBeNull();
      expect(status.port).toBeNull();
      expect(status.startedAt).toBeNull();
      expect(status.error).toBeNull();
    });

    it("getPort returns null initially", () => {
      expect(manager.getPort()).toBeNull();
    });
  });

  describe("diagnostics helpers", () => {
    it("resolves the startup status file beside the startup log", () => {
      expect(getDiagnosticLogPath()).toContain("milady-startup.log");
      expect(getStartupStatusPath()).toContain("startup-status.json");
    });

    it("redacts secrets from the startup log tail", async () => {
      const readFileSync = await getReadFileSyncMock();
      readFileSync.mockReturnValue(
        "Authorization: Bearer super-secret-token\napiKey=abc123\nlast line",
      );

      const tail = getStartupDiagnosticLogTail();
      expect(tail).toContain("[REDACTED]");
      expect(tail).toContain("last line");
      expect(tail).not.toContain("super-secret-token");
    });

    it("creates a local bug report bundle and copies diagnostics files", async () => {
      const writeFileSync = await getWriteFileSyncMock();
      const copyFileSync = await getCopyFileSyncMock();
      const readFileSync = await getReadFileSyncMock();
      readFileSync.mockImplementation((filePath: string) => {
        if (String(filePath).endsWith("startup-status.json")) {
          return JSON.stringify({
            state: "error",
            phase: "startup",
            updatedAt: "2026-03-26T00:00:00.000Z",
            logPath: "/tmp/milady-startup.log",
            statusPath: "/tmp/startup-status.json",
            platform: "win32",
            arch: "x64",
          });
        }
        return "Authorization: Bearer test-secret\nsafe line";
      });

      const bundle = createBugReportBundle({
        reportMarkdown: "# Report",
        reportJson: { ok: true },
        prefix: "canary",
      });

      expect(bundle.directory).toContain("canary-");
      expect(writeFileSync).toHaveBeenCalled();
      expect(copyFileSync).toHaveBeenCalledTimes(2);
      const reportJsonWrite = writeFileSync.mock.calls.find(
        (call) =>
          typeof call[0] === "string" && call[0].endsWith("report.json"),
      );
      expect(reportJsonWrite).toBeDefined();
      const parsed = JSON.parse(String(reportJsonWrite?.[1]));
      expect(parsed.startupDiagnostics).toMatchObject({
        state: "error",
        phase: "startup",
      });
      expect(parsed.startupLogTail).toContain("[REDACTED]");
    });

    it("sanitizes bundle prefixes to prevent path traversal", () => {
      const bundle = createBugReportBundle({
        reportMarkdown: "# Report",
        reportJson: { ok: true },
        prefix: "../../escape\\..\\report bundle",
      });

      expect(bundle.directory).toContain("/bug-reports/escape-report-bundle-");
      expect(bundle.directory).not.toContain("../");
      expect(bundle.directory).not.toContain("..\\");
    });
    it("returns a default startup diagnostics snapshot when the status file is missing", async () => {
      const readFileSync = await getReadFileSyncMock();
      readFileSync.mockImplementation(() => {
        throw new Error("missing");
      });

      const snapshot = getStartupDiagnosticsSnapshot();
      expect(snapshot.state).toBe("not_started");
      expect(snapshot.statusPath).toContain("startup-status.json");
    });
  });

  describe("start()", () => {
    it("transitions to starting state", async () => {
      const states: string[] = [];
      manager.setSendToWebview((_msg: string, payload: unknown) => {
        if (payload && typeof payload === "object" && "state" in payload) {
          states.push((payload as { state: string }).state);
        }
      });

      // Make both packaged entry candidates missing to trigger early error
      const existsSync = await getExistsSyncMock();
      existsSync.mockImplementation((p: string) => {
        if (p === MOCK_DIST_PATH) return true;
        return false;
      });

      await manager.start();

      // Should have transitioned through "starting" first
      expect(states[0]).toBe("starting");
    });

    it("transitions to error when no runnable runtime entry exists", async () => {
      const existsSync = await getExistsSyncMock();
      existsSync.mockImplementation((p: string) => {
        if (typeof p === "string" && p === MOCK_DIST_PATH) return true;
        return false;
      });

      const status = await manager.start();
      expect(status.state).toBe("error");
      expect(status.error).toContain("No runnable runtime entry found");
      expect(status.error).toContain("checked entry.js");
    });

    it("records a fatal startup phase when the child exits before health is ready", async () => {
      const appendFileSync = await getAppendFileSyncMock();
      const originalSessionId = process.env.MILADY_STARTUP_SESSION_ID;
      const originalStateFile = process.env.MILADY_STARTUP_STATE_FILE;
      const originalEventsFile = process.env.MILADY_STARTUP_EVENTS_FILE;
      process.env.MILADY_STARTUP_SESSION_ID = "test-session";
      process.env.MILADY_STARTUP_STATE_FILE = "/tmp/test-startup-state.json";
      process.env.MILADY_STARTUP_EVENTS_FILE = "/tmp/test-startup-events.jsonl";

      try {
        const mockProc = createMockProcess({ exitCode: 23 });
        mockSpawn.mockReturnValue(mockProc);

        const status = await manager.start();
        expect(status.state).toBe("error");
        expect(status.error).toContain(
          "Child process exited with code 23 before becoming healthy",
        );

        const traceEvents = appendFileSync.mock.calls
          .map(([, line]) => String(line))
          .filter((line) => line.includes('"session_id":"test-session"'));
        expect(
          traceEvents.some((line) => line.includes('"phase":"fatal"')),
        ).toBe(true);
        expect(
          traceEvents.some((line) => line.includes('"exit_code":23')),
        ).toBe(true);
      } finally {
        if (originalSessionId === undefined) {
          delete process.env.MILADY_STARTUP_SESSION_ID;
        } else {
          process.env.MILADY_STARTUP_SESSION_ID = originalSessionId;
        }
        if (originalStateFile === undefined) {
          delete process.env.MILADY_STARTUP_STATE_FILE;
        } else {
          process.env.MILADY_STARTUP_STATE_FILE = originalStateFile;
        }
        if (originalEventsFile === undefined) {
          delete process.env.MILADY_STARTUP_EVENTS_FILE;
        } else {
          process.env.MILADY_STARTUP_EVENTS_FILE = originalEventsFile;
        }
      }
    });

    it("rejects embedded startup in external mode", async () => {
      const originalApiBase = process.env.MILADY_DESKTOP_API_BASE;
      process.env.MILADY_DESKTOP_API_BASE = "https://api.milady.ai";

      try {
        await expect(manager.start()).rejects.toThrow(
          /Embedded desktop runtime is disabled because MILADY_DESKTOP_API_BASE points at https:\/\/api\.milady\.ai/,
        );
        expect(mockSpawn).not.toHaveBeenCalled();
      } finally {
        if (originalApiBase === undefined) {
          delete process.env.MILADY_DESKTOP_API_BASE;
        } else {
          process.env.MILADY_DESKTOP_API_BASE = originalApiBase;
        }
      }
    });

    it("rejects embedded startup in disabled mode", async () => {
      const originalSkip = process.env.MILADY_DESKTOP_SKIP_EMBEDDED_AGENT;
      process.env.MILADY_DESKTOP_SKIP_EMBEDDED_AGENT = "1";

      try {
        await expect(manager.start()).rejects.toThrow(
          /Embedded desktop runtime is disabled by MILADY_DESKTOP_SKIP_EMBEDDED_AGENT=1/,
        );
        expect(mockSpawn).not.toHaveBeenCalled();
      } finally {
        if (originalSkip === undefined) {
          delete process.env.MILADY_DESKTOP_SKIP_EMBEDDED_AGENT;
        } else {
          process.env.MILADY_DESKTOP_SKIP_EMBEDDED_AGENT = originalSkip;
        }
      }
    });

    it("is idempotent when already running", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      // Health check to succeed
      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      // Agent name fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "TestAgent" }] }),
      });

      const firstStatus = await manager.start();
      expect(firstStatus.state).toBe("running");

      // Second call should return immediately without spawning again
      const secondStatus = await manager.start();
      expect(secondStatus.state).toBe("running");
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it("authenticates local health and agent probes with the desktop API token", async () => {
      const originalMiladyToken = process.env.MILADY_API_TOKEN;
      const originalElizaToken = process.env.ELIZA_API_TOKEN;
      process.env.MILADY_API_TOKEN = "desktop-local-token";
      delete process.env.ELIZA_API_TOKEN;

      try {
        const mockProc = createMockProcess();
        mockSpawn.mockReturnValue(mockProc);

        mockFetch.mockResolvedValueOnce(makeHealthyResponse());
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ agents: [{ name: "Milady" }] }),
        });

        await manager.start();

        const expectedHeaders = {
          Authorization: "Bearer desktop-local-token",
          "X-Api-Key": "desktop-local-token",
          "X-Api-Token": "desktop-local-token",
        };

        expect(mockFetch).toHaveBeenNthCalledWith(
          1,
          "http://127.0.0.1:2138/api/health",
          expect.objectContaining({
            headers: expectedHeaders,
            signal: expect.anything(),
          }),
        );
        expect(mockFetch).toHaveBeenNthCalledWith(
          2,
          "http://127.0.0.1:2138/api/agents",
          expect.objectContaining({
            headers: expectedHeaders,
            signal: expect.anything(),
          }),
        );
      } finally {
        if (originalMiladyToken === undefined) {
          delete process.env.MILADY_API_TOKEN;
        } else {
          process.env.MILADY_API_TOKEN = originalMiladyToken;
        }
        if (originalElizaToken === undefined) {
          delete process.env.ELIZA_API_TOKEN;
        } else {
          process.env.ELIZA_API_TOKEN = originalElizaToken;
        }
      }
    });

    it("marks the runtime ready before agent metadata resolves", async () => {
      const mockProc = createMockProcess();
      const agentProbe = createDeferred<{
        ok: boolean;
        json: () => Promise<{ agents: Array<{ name: string }> }>;
      }>();
      mockSpawn.mockReturnValue(mockProc);

      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      mockFetch.mockReturnValueOnce(agentProbe.promise);

      const status = await manager.start();
      expect(status.state).toBe("running");
      expect(status.agentName).toBe("Milady");
      expect(manager.getStatus().agentName).toBe("Milady");

      const appendFileSync = await getAppendFileSyncMock();
      const initialLog = appendFileSync.mock.calls
        .map(([, line]) => String(line))
        .join("\n");
      expect(initialLog).toContain(
        "[Agent] Runtime ready -- port: 2138, pid: 12345",
      );
      expect(initialLog).not.toContain("Runtime started -- agent:");

      agentProbe.resolve({
        ok: true,
        json: async () => ({ agents: [{ name: "DeferredAgent" }] }),
      });
      await flushAsyncWork();

      expect(manager.getStatus().agentName).toBe("DeferredAgent");
      const finalLog = appendFileSync.mock.calls
        .map(([, line]) => String(line))
        .join("\n");
      expect(finalLog).toContain(
        "[Agent] Runtime started -- agent: DeferredAgent, port: 2138, pid: 12345",
      );
    });

    it("spawns bun process with the canonical runtime entry when present", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Milady" }] }),
      });

      const status = await manager.start();
      expect(status.state).toBe("running");
      expect(status.agentName).toBe("Milady");
      expect(status.port).toBe(2138);
      expect(status.startedAt).toBeGreaterThan(0);
      expect(status.error).toBeNull();

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      const spawnArgs = mockSpawn.mock.calls[0];
      expect(spawnArgs[0][1]).toBe("run");
      expect(spawnArgs[0][2]).toBe("/mock/milady-dist/entry.js");
      expect(spawnArgs[0][3]).toBe("start");
      // cwd should be the dist path
      expect(spawnArgs[1].cwd).toBe(MOCK_DIST_PATH);
    });

    it("uses the bundled Bun executable for installed app launches", async () => {
      Object.defineProperty(process, "execPath", {
        configurable: true,
        value: "/Applications/Milady-canary.app/Contents/MacOS/launcher",
      });

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Milady" }] }),
      });

      await manager.start();

      expect(mockSpawn).toHaveBeenCalledWith(
        [
          "/Applications/Milady-canary.app/Contents/MacOS/bun",
          "run",
          "/Applications/Milady-canary.app/Contents/Resources/app/milady-dist/entry.js",
          "start",
        ],
        expect.objectContaining({
          cwd: "/Applications/Milady-canary.app/Contents/Resources/app/milady-dist",
        }),
      );
    });

    it("uses bun.exe from LOCALAPPDATA when Windows launcher.exe is packaged without PATH", async () => {
      Object.defineProperty(process, "platform", {
        configurable: true,
        value: "win32",
      });
      Object.defineProperty(process, "execPath", {
        configurable: true,
        value:
          "/Users/test/AppData/Local/com.miladyai.milady/canary/self-extraction/Milady-canary/bin/launcher.exe",
      });

      const originalLocalAppData = process.env.LOCALAPPDATA;
      process.env.LOCALAPPDATA = "/Users/test/AppData/Local";

      try {
        const existsSync = await getExistsSyncMock();
        existsSync.mockImplementation((candidate: string) => {
          if (candidate === MOCK_DIST_PATH) return true;
          if (candidate === "/Users/test/AppData/Local/bun/bun.exe")
            return true;
          if (
            candidate ===
            "/Users/test/AppData/Local/com.miladyai.milady/canary/self-extraction/Milady-canary/Resources/app/milady-dist/node_modules"
          ) {
            return true;
          }
          if (
            typeof candidate === "string" &&
            candidate.endsWith("/entry.js")
          ) {
            return true;
          }
          return false;
        });

        const mockProc = createMockProcess();
        mockSpawn.mockReturnValue(mockProc);

        mockFetch.mockResolvedValueOnce(makeHealthyResponse());
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ agents: [{ name: "Milady" }] }),
        });

        await manager.start();

        expect(mockSpawn).toHaveBeenCalledWith(
          [
            "/Users/test/AppData/Local/com.miladyai.milady/canary/self-extraction/Milady-canary/bin/bun.exe",
            "run",
            "/Users/test/AppData/Local/com.miladyai.milady/canary/self-extraction/Milady-canary/Resources/app/milady-dist/entry.js",
            "start",
          ],
          expect.objectContaining({
            cwd: "/Users/test/AppData/Local/com.miladyai.milady/canary/self-extraction/Milady-canary/Resources/app/milady-dist",
          }),
        );
      } finally {
        if (originalLocalAppData === undefined) {
          delete process.env.LOCALAPPDATA;
        } else {
          process.env.LOCALAPPDATA = originalLocalAppData;
        }
      }
    });

    it("uses MILADY_API_PORT env var when set", async () => {
      const originalPort = process.env.MILADY_API_PORT;
      process.env.MILADY_API_PORT = "9999";

      try {
        const mockProc = createMockProcess();
        mockSpawn.mockReturnValue(mockProc);

        mockFetch.mockResolvedValueOnce(makeHealthyResponse());
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ agents: [] }),
        });

        const status = await manager.start();
        expect(status.port).toBe(9999);
      } finally {
        if (originalPort === undefined) {
          delete process.env.MILADY_API_PORT;
        } else {
          process.env.MILADY_API_PORT = originalPort;
        }
      }
    });

    it("does not inherit ambient NODE_PATH into the child process in dev mode", async () => {
      const originalNodePath = process.env.NODE_PATH;
      process.env.NODE_PATH = "/tmp/hostile-modules";

      try {
        const mockProc = createMockProcess();
        mockSpawn.mockReturnValue(mockProc);

        mockFetch.mockResolvedValueOnce(makeHealthyResponse());
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ agents: [{ name: "Milady" }] }),
        });

        await manager.start();

        const spawnOptions = mockSpawn.mock.calls[0]?.[1];
        expect(spawnOptions?.env?.NODE_PATH).toBe(
          "/mock/milady-dist/node_modules:/mock/node_modules",
        );
      } finally {
        if (originalNodePath === undefined) {
          delete process.env.NODE_PATH;
        } else {
          process.env.NODE_PATH = originalNodePath;
        }
      }
    });

    it("does not inherit ambient NODE_PATH into the child process in packaged mode", async () => {
      const originalNodePath = process.env.NODE_PATH;
      process.env.NODE_PATH = "/tmp/hostile-modules";
      Object.defineProperty(process, "execPath", {
        configurable: true,
        value: "/Applications/Milady-canary.app/Contents/MacOS/launcher",
      });

      try {
        const mockProc = createMockProcess();
        mockSpawn.mockReturnValue(mockProc);

        mockFetch.mockResolvedValueOnce(makeHealthyResponse());
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ agents: [{ name: "Milady" }] }),
        });

        await manager.start();

        const spawnOptions = mockSpawn.mock.calls[0]?.[1];
        expect(spawnOptions?.env?.NODE_PATH).toBe(
          "/Applications/Milady-canary.app/Contents/Resources/app/milady-dist/node_modules",
        );
      } finally {
        if (originalNodePath === undefined) {
          delete process.env.NODE_PATH;
        } else {
          process.env.NODE_PATH = originalNodePath;
        }
      }
    });

    it("fails packaged startup before spawn when bundle-local node_modules are missing", async () => {
      Object.defineProperty(process, "execPath", {
        configurable: true,
        value: "/Applications/Milady-canary.app/Contents/MacOS/launcher",
      });
      const existsSync = await getExistsSyncMock();
      existsSync.mockImplementation(
        (candidate: string) => !candidate.endsWith("/node_modules"),
      );

      const status = await manager.start();

      expect(status.state).toBe("error");
      expect(status.error).toContain("bundle-local node_modules");
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it("does not rewrite parent port env vars after startup", async () => {
      const originalMiladyPort = process.env.MILADY_PORT;
      const originalMiladyApiPort = process.env.MILADY_API_PORT;
      const originalElizaPort = process.env.ELIZA_PORT;
      delete process.env.MILADY_PORT;
      delete process.env.MILADY_API_PORT;
      delete process.env.ELIZA_PORT;

      try {
        const mockProc = createMockProcess();
        mockSpawn.mockReturnValue(mockProc);

        mockFetch.mockResolvedValueOnce(makeHealthyResponse());
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ agents: [{ name: "Milady" }] }),
        });

        const status = await manager.start();
        expect(status.port).toBe(2138);
        expect(process.env.MILADY_PORT).toBeUndefined();
        expect(process.env.MILADY_API_PORT).toBeUndefined();
        expect(process.env.ELIZA_PORT).toBeUndefined();
      } finally {
        if (originalMiladyPort === undefined) {
          delete process.env.MILADY_PORT;
        } else {
          process.env.MILADY_PORT = originalMiladyPort;
        }
        if (originalMiladyApiPort === undefined) {
          delete process.env.MILADY_API_PORT;
        } else {
          process.env.MILADY_API_PORT = originalMiladyApiPort;
        }
        if (originalElizaPort === undefined) {
          delete process.env.ELIZA_PORT;
        } else {
          process.env.ELIZA_PORT = originalElizaPort;
        }
      }
    });

    it("defaults agent name to Milady when agents endpoint fails", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      // Agent name fetch fails
      mockFetch.mockRejectedValueOnce(new Error("fetch failed"));

      const status = await manager.start();
      expect(status.state).toBe("running");
      expect(status.agentName).toBe("Milady");
    });

    it("restarts once after a PGLite migration failure is detected", async () => {
      vi.useFakeTimers();
      const mockProc1 = createMockProcess({
        pid: 111,
        stderr: makeReadableStream("Failed query: create schema if not exists"),
      });
      const mockProc2 = createMockProcess({ pid: 222 });
      mockSpawn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2);

      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Milady" }] }),
      });
      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Milady" }] }),
      });

      const status = await manager.start();
      expect(status.state).toBe("running");

      mockProc1._exitDeferred.resolve(1);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);

      const fs = await import("node:fs");
      expect(fs.default.rmSync).toHaveBeenCalledWith(
        "/mock/home/.milady/workspace/.eliza/.elizadb",
        { recursive: true, force: true },
      );
      expect(mockSpawn).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("does not delete or restart when the PGLite data dir is actively locked", async () => {
      const mockProc = createMockProcess({
        pid: 111,
        stderr: makeReadableStream(
          "PGLite data dir is already in use at /mock/home/.milady/workspace/.eliza/.elizadb",
        ),
      });
      mockSpawn.mockReturnValueOnce(mockProc);

      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Milady" }] }),
      });

      const status = await manager.start();
      expect(status.state).toBe("running");

      mockProc._exitDeferred.resolve(1);
      await Promise.resolve();

      const fs = await import("node:fs");
      expect(fs.default.rmSync).not.toHaveBeenCalled();
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(manager.getStatus().state).toBe("error");
    });
  });

  describe("stop()", () => {
    it("does nothing when state is not_started", async () => {
      await manager.stop();
      expect(manager.getStatus().state).toBe("not_started");
    });

    it("transitions from running to stopped", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "TestAgent" }] }),
      });

      await manager.start();
      await flushAsyncWork();
      expect(manager.getStatus().state).toBe("running");

      // Resolve process exit so killChildProcess completes
      mockProc._exitDeferred.resolve(0);
      await manager.stop();

      const status = manager.getStatus();
      expect(status.state).toBe("stopped");
      expect(status.agentName).toBe("TestAgent");
      expect(status.port).toBeNull();
    });

    it("sends SIGTERM to the child process", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [] }),
      });

      await manager.start();
      await flushAsyncWork();
      expect(manager.getStatus().state).toBe("running");

      mockProc._exitDeferred.resolve(0);
      await manager.stop();

      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("is a no-op when already stopped", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [] }),
      });

      await manager.start();
      await flushAsyncWork();
      mockProc._exitDeferred.resolve(0);
      await manager.stop();
      expect(manager.getStatus().state).toBe("stopped");

      // Second stop should be a no-op
      await manager.stop();
      expect(manager.getStatus().state).toBe("stopped");
    });
  });

  describe("restart()", () => {
    it("stops then starts a new process", async () => {
      const mockProc1 = createMockProcess({ pid: 111 });
      const mockProc2 = createMockProcess({ pid: 222 });
      mockSpawn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2);

      // First start
      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Agent1" }] }),
      });

      await manager.start();
      await flushAsyncWork();
      expect(manager.getStatus().state).toBe("running");

      // For stop to work, resolve process 1 exit
      mockProc1._exitDeferred.resolve(0);

      // Restart: health check and agent name for new process
      mockFetch.mockResolvedValueOnce(makeHealthyResponse());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Agent2" }] }),
      });

      const status = await manager.restart();
      expect(status.state).toBe("running");
      expect(status.agentName).toBe("Milady");
      await flushAsyncWork();
      expect(manager.getStatus().agentName).toBe("Agent2");
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
  });

  describe("restartClearingLocalDb()", () => {
    it("is a no-op in external API mode (no spawn, no throw)", async () => {
      const originalApiBase = process.env.MILADY_DESKTOP_API_BASE;
      process.env.MILADY_DESKTOP_API_BASE = "http://127.0.0.1:2138";

      try {
        const status = await manager.restartClearingLocalDb();
        expect(status.state).toBe("not_started");
        expect(mockSpawn).not.toHaveBeenCalled();
      } finally {
        if (originalApiBase === undefined) {
          delete process.env.MILADY_DESKTOP_API_BASE;
        } else {
          process.env.MILADY_DESKTOP_API_BASE = originalApiBase;
        }
      }
    });
  });

  describe("getStatus()", () => {
    it("returns a copy (not a reference)", () => {
      const status1 = manager.getStatus();
      const status2 = manager.getStatus();
      expect(status1).toEqual(status2);
      expect(status1).not.toBe(status2);
    });
  });

  describe("setSendToWebview()", () => {
    it("emits status updates via the callback", async () => {
      const messages: Array<{ message: string; payload: unknown }> = [];
      manager.setSendToWebview((message: string, payload: unknown) => {
        messages.push({ message, payload });
      });

      // Make entry.js not found for quick error path
      const existsSync = await getExistsSyncMock();
      existsSync.mockImplementation((p: string) => {
        if (typeof p === "string" && p.endsWith("entry.js")) return false;
        if (p === MOCK_DIST_PATH) return true;
        return false;
      });

      await manager.start();

      // Should have emitted at least "starting" and "error" statuses
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].message).toBe("agentStatusUpdate");
      expect((messages[0].payload as { state: string }).state).toBe("starting");
    });
  });

  describe("onStatusChange()", () => {
    it("notifies listeners and supports unsubscribe", async () => {
      const states: string[] = [];
      const unsubscribe = manager.onStatusChange(
        (status: { state: string }) => {
          states.push(status.state);
        },
      );

      const existsSync = await getExistsSyncMock();
      existsSync.mockImplementation((p: string) => {
        if (typeof p === "string" && p.endsWith("entry.js")) return false;
        if (p === MOCK_DIST_PATH) return true;
        return false;
      });

      await manager.start();
      expect(states).toEqual(["starting", "error"]);

      unsubscribe();
      states.length = 0;

      await manager.start();
      expect(states).toEqual([]);
    });
  });
});
