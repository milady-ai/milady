import { describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import type { RepoPromptConfig } from "../config.ts";
import { RepoPromptService } from "../services/repoprompt-service.ts";

const mockRuntime = {} as IAgentRuntime;

function makeConfig(
  overrides: Partial<RepoPromptConfig> = {},
): RepoPromptConfig {
  return {
    cliPath: process.execPath,
    workspaceRoot: process.cwd(),
    timeoutMs: 2_000,
    maxOutputChars: 5_000,
    maxStdinBytes: 5_000,
    allowedCommands: ["e"],
    ...overrides,
  };
}

describe("RepoPromptService", () => {
  it("runs allowed commands and captures output", async () => {
    const service = new RepoPromptService(mockRuntime, makeConfig());

    const result = await service.run({
      command: "-e",
      args: ["process.stdout.write('hello from repoprompt test')"],
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello from repoprompt test");
    expect(result.stderr).toBe("");
  });

  it("rejects disallowed commands before spawning", async () => {
    const service = new RepoPromptService(
      mockRuntime,
      makeConfig({
        allowedCommands: ["read_file"],
      }),
    );

    await expect(
      service.run({
        command: "context_builder",
        args: [],
      }),
    ).rejects.toThrow("not allowed");
  });

  it("rejects disallowed passthrough flags in args", async () => {
    const service = new RepoPromptService(mockRuntime, makeConfig());

    await expect(
      service.run({
        command: "e",
        args: ["--exec=bad"],
      }),
    ).rejects.toThrow("not allowed");
  });

  it("enforces timeout and marks result as timed out", async () => {
    const service = new RepoPromptService(
      mockRuntime,
      makeConfig({
        timeoutMs: 100,
      }),
    );

    const result = await service.run({
      command: "-e",
      args: ['setTimeout(() => process.stdout.write("done"), 5000)'],
    });

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.stderr).toContain("timed out");
  });

  it("caps output size and flags truncation", async () => {
    const service = new RepoPromptService(
      mockRuntime,
      makeConfig({
        maxOutputChars: 25,
      }),
    );

    const result = await service.run({
      command: "-e",
      args: [
        "process.stdout.write('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')",
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdout).toContain("[truncated by plugin-repoprompt]");
  });

  it("exposes run metadata via status", async () => {
    const service = new RepoPromptService(mockRuntime, makeConfig());

    const before = service.getStatus();
    expect(before.lastRunAt).toBeUndefined();

    await service.run({
      command: "-e",
      args: ["process.stdout.write('status check')"],
    });

    const after = service.getStatus();
    expect(after.lastRunAt).toBeNumber();
    expect(after.lastCommand).toBe("e");
    expect(after.lastExitCode).toBe(0);
  });

  it("rejects cwd values outside workspace root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repoprompt-root-"));
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "repoprompt-outside-"),
    );

    const service = new RepoPromptService(
      mockRuntime,
      makeConfig({
        workspaceRoot: root,
      }),
    );

    await expect(
      service.run({
        command: "-e",
        args: ["process.stdout.write('noop')"],
        cwd: outside,
      }),
    ).rejects.toThrow("REPOPROMPT_WORKSPACE_ROOT");
  });

  it("rejects cwd symlink escapes outside workspace root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repoprompt-root-"));
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "repoprompt-outside-"),
    );
    const linkPath = path.join(root, "escape-link");

    await fs.symlink(outside, linkPath);

    const service = new RepoPromptService(
      mockRuntime,
      makeConfig({
        workspaceRoot: root,
      }),
    );

    await expect(
      service.run({
        command: "-e",
        args: ["process.stdout.write('noop')"],
        cwd: linkPath,
      }),
    ).rejects.toThrow("REPOPROMPT_WORKSPACE_ROOT");
  });

  it("rejects oversized stdin payloads", async () => {
    const service = new RepoPromptService(
      mockRuntime,
      makeConfig({
        maxStdinBytes: 8,
      }),
    );

    await expect(
      service.run({
        command: "-e",
        args: ["process.stdin.resume()"],
        stdin: "this is too large",
      }),
    ).rejects.toThrow("stdin exceeds limit");
  });
});
