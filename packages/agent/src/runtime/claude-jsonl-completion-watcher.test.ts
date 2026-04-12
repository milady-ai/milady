import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findLatestJsonl,
  readLatestAssistantEntry,
} from "./claude-jsonl-completion-watcher";

const tempDirs: string[] = [];
const savedHome = process.env.HOME;

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
  if (savedHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = savedHome;
  }
});

async function makeFakeHome(workdir: string): Promise<{
  home: string;
  projectDir: string;
}> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "claude-jsonl-test-"));
  tempDirs.push(home);
  const projectKey = workdir.replace(/[/.]/g, "-");
  const projectDir = path.join(home, ".claude", "projects", projectKey);
  await fs.mkdir(projectDir, { recursive: true });
  process.env.HOME = home;
  return { home, projectDir };
}

describe("findLatestJsonl", () => {
  it("returns the most recently modified jsonl regardless of filename order", async () => {
    const workdir = "/home/user/.some/workspace";
    const { projectDir } = await makeFakeHome(workdir);

    // Claude Code names session files with UUIDs; write them in an order
    // where the newest mtime belongs to a file that is NOT lexically last.
    const older = path.join(
      projectDir,
      "ffffffff-0000-0000-0000-000000000000.jsonl",
    );
    const newer = path.join(
      projectDir,
      "11111111-0000-0000-0000-000000000000.jsonl",
    );
    await fs.writeFile(older, "older\n");
    await fs.writeFile(newer, "newer\n");
    // Force a clear mtime ordering: older 60s in the past, newer now.
    const now = Date.now();
    await fs.utimes(older, new Date(now - 60_000), new Date(now - 60_000));
    await fs.utimes(newer, new Date(now), new Date(now));

    const result = await findLatestJsonl(workdir);
    expect(result).toBe(newer);
  });

  it("ignores non-jsonl files in the project directory", async () => {
    const workdir = "/home/user/.some/workspace";
    const { projectDir } = await makeFakeHome(workdir);

    const jsonl = path.join(projectDir, "session.jsonl");
    const other = path.join(projectDir, "session.log");
    await fs.writeFile(other, "log\n");
    await fs.writeFile(jsonl, "session\n");
    const now = Date.now();
    // Give the .log the newer mtime to prove we're filtering by extension.
    await fs.utimes(jsonl, new Date(now - 60_000), new Date(now - 60_000));
    await fs.utimes(other, new Date(now), new Date(now));

    const result = await findLatestJsonl(workdir);
    expect(result).toBe(jsonl);
  });

  it("returns null when the project directory does not exist", async () => {
    await makeFakeHome("/home/user/unused");
    const result = await findLatestJsonl("/home/user/does-not-exist");
    expect(result).toBeNull();
  });

  it("returns null when the project directory has no jsonl files", async () => {
    const workdir = "/home/user/.some/workspace";
    const { projectDir } = await makeFakeHome(workdir);
    await fs.writeFile(path.join(projectDir, "notes.txt"), "hi\n");
    const result = await findLatestJsonl(workdir);
    expect(result).toBeNull();
  });
});

describe("readLatestAssistantEntry", () => {
  it("returns the latest assistant text with isEndTurn=true for a finished turn", () => {
    const jsonl = [
      JSON.stringify({
        message: {
          role: "user",
          content: [{ type: "text", text: "hi" }],
        },
      }),
      JSON.stringify({
        message: {
          role: "assistant",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "hello there" }],
        },
      }),
    ].join("\n");

    const result = readLatestAssistantEntry(jsonl);
    expect(result).toEqual({ text: "hello there", isEndTurn: true });
  });

  it("returns isEndTurn=false when the latest assistant turn is still in progress", () => {
    const jsonl = [
      JSON.stringify({
        message: {
          role: "assistant",
          stop_reason: "tool_use",
          content: [{ type: "text", text: "let me check" }],
        },
      }),
    ].join("\n");

    const result = readLatestAssistantEntry(jsonl);
    expect(result).toEqual({ text: "let me check", isEndTurn: false });
  });

  it("returns null when no assistant message is present", () => {
    const jsonl = JSON.stringify({
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    expect(readLatestAssistantEntry(jsonl)).toBeNull();
  });

  it("skips malformed lines without throwing", () => {
    const jsonl = [
      "{not json",
      JSON.stringify({
        message: {
          role: "assistant",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "done" }],
        },
      }),
    ].join("\n");

    expect(readLatestAssistantEntry(jsonl)).toEqual({
      text: "done",
      isEndTurn: true,
    });
  });
});
