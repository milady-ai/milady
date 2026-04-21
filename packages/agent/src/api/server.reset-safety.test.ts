import { describe, expect, it } from "vitest";
import { isSafeResetStateDir as isSafeResetStateDirFromServer } from "./server";
import { isSafeResetStateDir as isSafeResetStateDirFromServerAuth } from "./server-auth";

describe("isSafeResetStateDir", () => {
  const homeDir = "/Users/tester";
  const safeDirs = [
    "/Users/tester/.eliza/workspace",
    "/Users/tester/.milady/workspace",
    "/Users/tester/projects/milady/state",
  ];

  it.each([
    ["server", isSafeResetStateDirFromServer],
    ["server-auth", isSafeResetStateDirFromServerAuth],
  ] as const)("%s allows Milady and eliza namespaced state directories under home", (_label, fn) => {
    for (const safeDir of safeDirs) {
      expect(fn(safeDir, homeDir)).toBe(true);
    }
  });

  it.each([
    ["server", isSafeResetStateDirFromServer],
    ["server-auth", isSafeResetStateDirFromServerAuth],
  ] as const)("%s rejects unsafe directories", (_label, fn) => {
    expect(fn("/", homeDir)).toBe(false);
    expect(fn(homeDir, homeDir)).toBe(false);
    expect(fn("/tmp/milady", homeDir)).toBe(false);
    expect(fn("/Users/tester/Downloads/random", homeDir)).toBe(false);
  });
});
