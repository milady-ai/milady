/**
 * Verifies CompanionSceneHost uses default React.memo (shallow comparison
 * of ALL props including children). A previous custom comparator that
 * ignored children broke tab navigation — this test prevents regression.
 */
import { describe, expect, it } from "vitest";

describe("CompanionSceneHost memo", () => {
  it("does NOT export a custom comparator (children must trigger re-render)", async () => {
    const mod = await import("../CompanionSceneHost");
    // The buggy export was `companionSceneHostAreEqual` — must not exist
    expect("companionSceneHostAreEqual" in mod).toBe(false);
  });
});
