import { describe, expect, it } from "vitest";

import { resolveMainWindowPartition } from "../main-window-session";

describe("resolveMainWindowPartition", () => {
  it("returns null by default", () => {
    expect(resolveMainWindowPartition({})).toBeNull();
  });

  it("returns the explicit desktop test partition override", () => {
    expect(
      resolveMainWindowPartition({
        MILADY_DESKTOP_TEST_PARTITION: "bootstrap-isolated",
      }),
    ).toBe("bootstrap-isolated");
  });

  it("ignores blank partition overrides", () => {
    expect(
      resolveMainWindowPartition({
        MILADY_DESKTOP_TEST_PARTITION: "   ",
      }),
    ).toBeNull();
  });
});
