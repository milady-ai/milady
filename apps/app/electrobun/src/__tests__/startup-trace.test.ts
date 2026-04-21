import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getStartupTraceConfig,
  recordStartupPhase,
  resetStartupTraceForTests,
  resolveStartupTraceBootstrapFile,
} from "../startup-trace";

function createTraceEnv(rootDir: string, sessionId: string): NodeJS.ProcessEnv {
  return {
    MILADY_STARTUP_SESSION_ID: sessionId,
    MILADY_STARTUP_STATE_FILE: path.join(rootDir, `${sessionId}.state.json`),
    MILADY_STARTUP_EVENTS_FILE: path.join(rootDir, `${sessionId}.events.jsonl`),
  };
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("startup trace", () => {
  const darwinBundlePath = path.join("/Applications", "Milady-canary.app");
  const darwinExecPath = path.join(
    darwinBundlePath,
    "Contents",
    "MacOS",
    "launcher",
  );
  const darwinBootstrapPath = path.join(
    darwinBundlePath,
    "Contents",
    "Resources",
    "startup-session.json",
  );
  const winBundlePath = path.join(
    "/Users/test/AppData/Local/com.miladyai.milady/canary/self-extraction",
    "Milady-canary",
  );
  const winExecPath = path.join(winBundlePath, "bin", "launcher.exe");
  const winBootstrapPath = path.join(winBundlePath, "startup-session.json");
  let tempDir: string;

  beforeEach(() => {
    resetStartupTraceForTests();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-startup-trace-"));
  });

  afterEach(() => {
    resetStartupTraceForTests();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("atomically writes the latest state and appends JSONL events", () => {
    const env = createTraceEnv(tempDir, "session-a");

    const snapshot = recordStartupPhase(
      "main_start",
      {
        pid: 123,
        exec_path: darwinExecPath,
      },
      env,
    );

    expect(snapshot?.phase).toBe("main_start");
    const state = readJson(env.MILADY_STARTUP_STATE_FILE as string);
    expect(state.session_id).toBe("session-a");
    expect(state.phase).toBe("main_start");
    expect(state.pid).toBe(123);
    expect(state.bundle_path).toBe(darwinBundlePath);

    const events = fs
      .readFileSync(env.MILADY_STARTUP_EVENTS_FILE as string, "utf8")
      .trim()
      .split("\n");
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]).phase).toBe("main_start");

    const tempFiles = fs
      .readdirSync(tempDir)
      .filter((entry) => entry.includes(".tmp-"));
    expect(tempFiles).toHaveLength(0);
  });

  it("keeps state isolated per startup session", () => {
    const envA = createTraceEnv(tempDir, "session-a");
    const envB = createTraceEnv(tempDir, "session-b");

    recordStartupPhase("main_start", { pid: 111 }, envA);
    recordStartupPhase("main_start", { pid: 222 }, envB);
    recordStartupPhase("window_ready", { pid: 111 }, envA);

    expect(readJson(envA.MILADY_STARTUP_STATE_FILE as string).phase).toBe(
      "window_ready",
    );
    expect(readJson(envA.MILADY_STARTUP_STATE_FILE as string).pid).toBe(111);
    expect(readJson(envB.MILADY_STARTUP_STATE_FILE as string).phase).toBe(
      "main_start",
    );
    expect(readJson(envB.MILADY_STARTUP_STATE_FILE as string).pid).toBe(222);
  });

  it("overwrites the latest state when startup reaches fatal", () => {
    const env = createTraceEnv(tempDir, "session-fatal");

    recordStartupPhase(
      "runtime_ready",
      { pid: 321, child_pid: 654, port: 31337 },
      env,
    );
    recordStartupPhase(
      "fatal",
      {
        pid: 321,
        child_pid: 654,
        port: 31337,
        error: "Child process exited unexpectedly with code 9",
        exit_code: 9,
      },
      env,
    );

    const state = readJson(env.MILADY_STARTUP_STATE_FILE as string);
    expect(state.phase).toBe("fatal");
    expect(state.error).toBe("Child process exited unexpectedly with code 9");
    expect(state.exit_code).toBe(9);

    const events = fs
      .readFileSync(env.MILADY_STARTUP_EVENTS_FILE as string, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.map((event) => event.phase)).toEqual([
      "runtime_ready",
      "fatal",
    ]);
  });

  it("reads the bundle-local bootstrap file when wrapper env is stripped", () => {
    const execPath = path.join(
      tempDir,
      "Milady-canary.app",
      "Contents",
      "MacOS",
      "launcher",
    );
    const env = {} as NodeJS.ProcessEnv;
    const bootstrapFile = resolveStartupTraceBootstrapFile(execPath, "darwin");
    const sessionId = "session-bootstrap";
    const stateFile = path.join(tempDir, `${sessionId}.state.json`);
    const eventsFile = path.join(tempDir, `${sessionId}.events.jsonl`);

    expect(bootstrapFile).toBe(
      path.join(
        tempDir,
        "Milady-canary.app",
        "Contents",
        "Resources",
        "startup-session.json",
      ),
    );
    if (!bootstrapFile) {
      throw new Error(
        "expected packaged exec path to resolve a bootstrap file",
      );
    }
    fs.mkdirSync(path.dirname(bootstrapFile), { recursive: true });
    fs.writeFileSync(
      bootstrapFile,
      `${JSON.stringify(
        {
          session_id: sessionId,
          state_file: stateFile,
          events_file: eventsFile,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const config = getStartupTraceConfig(env, execPath, "darwin");
    expect(config.enabled).toBe(true);
    expect(config.sessionId).toBe(sessionId);
    expect(config.stateFile).toBe(stateFile);
    expect(config.eventsFile).toBe(eventsFile);

    const snapshot = recordStartupPhase(
      "main_start",
      { pid: 777 },
      env,
      execPath,
      "darwin",
    );
    expect(snapshot?.session_id).toBe(sessionId);
    expect(readJson(stateFile).pid).toBe(777);
  });

  it("derives bundle-local bootstrap sidecars from packaged launcher paths", () => {
    expect(resolveStartupTraceBootstrapFile(darwinExecPath, "darwin")).toBe(
      darwinBootstrapPath,
    );
    expect(resolveStartupTraceBootstrapFile(winExecPath, "win32")).toBe(
      winBootstrapPath,
    );
  });

  it("does not enable tracing for packaged runtimes without explicit env or bootstrap", () => {
    const execPath = path.join(
      tempDir,
      "Milady-canary.app",
      "Contents",
      "MacOS",
      "launcher",
    );

    expect(getStartupTraceConfig({} as NodeJS.ProcessEnv, execPath)).toEqual({
      enabled: false,
      sessionId: null,
      stateFile: null,
      eventsFile: null,
    });
    expect(
      recordStartupPhase(
        "main_start",
        { pid: 111 },
        {} as NodeJS.ProcessEnv,
        execPath,
      ),
    ).toBeNull();
  });
});
