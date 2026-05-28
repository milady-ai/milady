import { expect, test } from "bun:test";
import { isRecord, requireString } from "../src/shared/validation";

test("validates records before crossing RPC boundary", () => {
  const input: unknown = { prompt: "Summarize this", mode: "dry-run" };
  expect(isRecord(input)).toBe(true);
  if (isRecord(input)) {
    expect(requireString(input, "prompt")).toBe("Summarize this");
  }
});
