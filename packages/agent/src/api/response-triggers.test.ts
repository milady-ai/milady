import { describe, expect, test } from "vitest";
import type { ElizaConfig } from "../config/config.js";
import { applyResponseTriggers } from "./response-triggers.js";

function configWithTriggers(responseTriggers: unknown): ElizaConfig {
  return {
    agents: {
      defaults: {
        responseTriggers,
      },
    },
  } as ElizaConfig;
}

describe("applyResponseTriggers", () => {
  test("appends configured text when the prompt contains a trigger", () => {
    const config = configWithTriggers([
      {
        trigger: "fish mode",
        append: "glub mode enabled",
      },
    ]);

    expect(
      applyResponseTriggers("Started.", "hey botdick fish mode please", config),
    ).toBe("Started.\nglub mode enabled");
  });

  test("does not append blocked slur-like output", () => {
    const config = configWithTriggers([
      {
        trigger: "bait",
        append: ["n", "ig", "ga"].join(""),
      },
    ]);

    expect(applyResponseTriggers("No.", "bait", config)).toBe("No.");
  });

  test("deduplicates repeated additions", () => {
    const config = configWithTriggers([
      { trigger: "one", append: "same" },
      { trigger: "two", append: "same" },
    ]);

    expect(applyResponseTriggers("Base", "one two", config)).toBe(
      "Base\nsame",
    );
  });
});
