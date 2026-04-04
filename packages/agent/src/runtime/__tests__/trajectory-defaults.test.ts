import { afterEach, describe, expect, it } from "vitest";

import { shouldEnableTrajectoryLoggingByDefault } from "../trajectory-persistence";

const ENV_KEYS = [
  "MILADY_TRAJECTORY_LOGGING",
  "TRAJECTORY_LOGGING_ENABLED",
  "ELIZA_TRAJECTORY_LOGGING",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("shouldEnableTrajectoryLoggingByDefault", () => {
  it("defaults on without explicit env overrides", () => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(true);
  });

  it("honors explicit disable overrides", () => {
    process.env.MILADY_TRAJECTORY_LOGGING = "false";

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(false);
  });

  it("honors explicit enable overrides", () => {
    process.env.TRAJECTORY_LOGGING_ENABLED = "1";

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(true);
  });
});
