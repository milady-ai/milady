import { describe, expect, it } from "vitest";
import { extractXmlParams, parseFallbackActionBlocks } from "../server";

// ---------------------------------------------------------------------------
// extractXmlParams
// ---------------------------------------------------------------------------

describe("extractXmlParams", () => {
  it("extracts simple key-value pairs", () => {
    const result = extractXmlParams(
      "<repo>https://github.com/org/repo</repo><task>Fix bugs</task>",
    );
    expect(result).toEqual({
      repo: "https://github.com/org/repo",
      task: "Fix bugs",
    });
  });

  it("trims whitespace from values", () => {
    const result = extractXmlParams("<name>  hello world  </name>");
    expect(result).toEqual({ name: "hello world" });
  });

  it("returns empty object for empty input", () => {
    expect(extractXmlParams("")).toEqual({});
  });

  it("returns empty object for text with no XML", () => {
    expect(extractXmlParams("just plain text")).toEqual({});
  });

  it("skips nested XML (values containing <)", () => {
    // The regex requires [^<]+ for the value, so nested tags are skipped
    const result = extractXmlParams(
      "<outer><inner>value</inner></outer><simple>ok</simple>",
    );
    expect(result).toEqual({ inner: "value", simple: "ok" });
  });

  it("handles multiline values", () => {
    const result = extractXmlParams("<task>\n  Fix the login bug\n</task>");
    expect(result).toEqual({ task: "Fix the login bug" });
  });
});

// ---------------------------------------------------------------------------
// parseFallbackActionBlocks — plain action names with responseText
// ---------------------------------------------------------------------------

describe("parseFallbackActionBlocks with responseText", () => {
  it("extracts params from standalone action blocks in response text", () => {
    const result = parseFallbackActionBlocks(
      ["START_CODING_TASK"],
      "<START_CODING_TASK><repo>https://github.com/org/repo</repo><task>Fix it</task></START_CODING_TASK>",
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("START_CODING_TASK");
    expect(result[0].parameters.repo).toBe("https://github.com/org/repo");
    expect(result[0].parameters.task).toBe("Fix it");
  });

  it("returns empty params when no matching block in response text", () => {
    const result = parseFallbackActionBlocks(
      ["START_CODING_TASK"],
      "no xml here",
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("START_CODING_TASK");
    expect(result[0].parameters).toEqual({});
  });

  it("returns empty params when no responseText provided", () => {
    const result = parseFallbackActionBlocks(["START_CODING_TASK"]);
    expect(result).toHaveLength(1);
    expect(result[0].parameters).toEqual({});
  });

  it("handles multiple actions with mixed param availability", () => {
    const result = parseFallbackActionBlocks(
      ["REPLY", "START_CODING_TASK"],
      "<START_CODING_TASK><agents>claude:task1 | codex:task2</agents></START_CODING_TASK>",
    );
    expect(result).toHaveLength(2);
    const reply = result.find((a) => a.name === "REPLY");
    const coding = result.find((a) => a.name === "START_CODING_TASK");
    expect(reply?.parameters).toEqual({});
    expect(coding?.parameters.agents).toBe("claude:task1 | codex:task2");
  });

  it("normalizes action names to uppercase", () => {
    const result = parseFallbackActionBlocks(["start_coding_task"]);
    expect(result[0].name).toBe("START_CODING_TASK");
  });

  it("skips non-alphanumeric entries", () => {
    const result = parseFallbackActionBlocks([
      "valid_action",
      "not valid!",
      "",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("VALID_ACTION");
  });
});

// ---------------------------------------------------------------------------
// parseFallbackActionBlocks — XML action blocks (legacy format)
// ---------------------------------------------------------------------------

describe("parseFallbackActionBlocks with XML action blocks", () => {
  it("extracts action name and params from structured XML", () => {
    const xml =
      "<action><name>CHECK_BALANCE</name><params><chain>ethereum</chain></params></action>";
    const result = parseFallbackActionBlocks(xml);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("CHECK_BALANCE");
    expect(result[0].parameters.chain).toBe("ethereum");
  });

  it("handles multiple XML action blocks", () => {
    const xml =
      "<action><name>REPLY</name></action>" +
      "<action><name>START_CODING_TASK</name><params><repo>https://x.com/r</repo></params></action>";
    const result = parseFallbackActionBlocks(xml);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("REPLY");
    expect(result[1].parameters.repo).toBe("https://x.com/r");
  });
});
