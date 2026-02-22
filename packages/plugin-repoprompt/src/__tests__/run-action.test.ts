import { describe, expect, it } from "bun:test";
import type { Memory } from "@elizaos/core";
import { extractRunInput, parseTokens } from "../actions/run.ts";

function makeMemory(text: string): Memory {
  return {
    id: "memory-id",
    content: {
      text,
      source: "test",
    },
  } as unknown as Memory;
}

describe("repoPromptRunAction helpers", () => {
  it("parseTokens handles quoted and escaped arguments", () => {
    const tokens = parseTokens('tree "src/runtime" --flag=1 "say \\"hi\\""');
    expect(tokens).toEqual(["tree", "src/runtime", "--flag=1", 'say "hi"']);
  });

  it("extractRunInput prefers explicit command/options", () => {
    const input = extractRunInput(makeMemory("ignored"), {
      command: "tree",
      args: ["src"],
      tab: "main",
      cwd: "/tmp/workspace",
    });

    expect(input).toEqual({
      command: "tree",
      args: ["src"],
      tab: "main",
      cwd: "/tmp/workspace",
      stdin: undefined,
      window: undefined,
    });
  });

  it("extractRunInput parses rp-cli prefixed message text", () => {
    const input = extractRunInput(
      makeMemory('rp-cli read_file "src/index.ts"'),
      {},
    );

    expect(input).toEqual({
      command: "read_file",
      args: ["src/index.ts"],
      tab: undefined,
      cwd: undefined,
      stdin: undefined,
      window: undefined,
    });
  });

  it("extractRunInput returns null for unrelated text", () => {
    expect(extractRunInput(makeMemory("hello world"), {})).toBeNull();
  });
});
