import { describe, expect, it } from "vitest";
import selfControlPlugin from "./index";

describe("@miladyai/plugin-selfcontrol", () => {
  it("exports the expected plugin shape", () => {
    expect(selfControlPlugin.name).toBe("@miladyai/plugin-selfcontrol");
    expect(selfControlPlugin.providers).toHaveLength(1);
    expect(selfControlPlugin.actions).toHaveLength(4);
    expect(selfControlPlugin.services).toHaveLength(1);
  });
});
