import { describe, expect, it } from "vitest";
import { MILADY_ENV_ALIASES } from "./brand-env";

describe("MILADY_ENV_ALIASES", () => {
  it("includes the home port alias", () => {
    expect(MILADY_ENV_ALIASES).toContainEqual([
      "MILADY_HOME_PORT",
      "ELIZA_HOME_PORT",
    ]);
  });
});
