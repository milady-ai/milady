import { afterEach, describe, expect, it } from "vitest";

import { shouldEnableTrajectoryLoggingByDefault } from "../src/runtime/trajectory-persistence";

describe("shouldEnableTrajectoryLoggingByDefault", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMiladyCloudProvisioned = process.env.MILADY_CLOUD_PROVISIONED;
  const originalElizaCloudProvisioned = process.env.ELIZA_CLOUD_PROVISIONED;
  const originalEnableTrajectories = process.env.ENABLE_TRAJECTORIES;
  const originalMiladyTrajectoryLogging =
    process.env.MILADY_TRAJECTORY_LOGGING;
  const originalTrajectoryLoggingEnabled =
    process.env.TRAJECTORY_LOGGING_ENABLED;
  const originalElizaTrajectoryLogging =
    process.env.ELIZA_TRAJECTORY_LOGGING;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalMiladyCloudProvisioned === undefined) {
      delete process.env.MILADY_CLOUD_PROVISIONED;
    } else {
      process.env.MILADY_CLOUD_PROVISIONED = originalMiladyCloudProvisioned;
    }

    if (originalElizaCloudProvisioned === undefined) {
      delete process.env.ELIZA_CLOUD_PROVISIONED;
    } else {
      process.env.ELIZA_CLOUD_PROVISIONED = originalElizaCloudProvisioned;
    }

    if (originalEnableTrajectories === undefined) {
      delete process.env.ENABLE_TRAJECTORIES;
    } else {
      process.env.ENABLE_TRAJECTORIES = originalEnableTrajectories;
    }

    if (originalMiladyTrajectoryLogging === undefined) {
      delete process.env.MILADY_TRAJECTORY_LOGGING;
    } else {
      process.env.MILADY_TRAJECTORY_LOGGING = originalMiladyTrajectoryLogging;
    }

    if (originalTrajectoryLoggingEnabled === undefined) {
      delete process.env.TRAJECTORY_LOGGING_ENABLED;
    } else {
      process.env.TRAJECTORY_LOGGING_ENABLED =
        originalTrajectoryLoggingEnabled;
    }

    if (originalElizaTrajectoryLogging === undefined) {
      delete process.env.ELIZA_TRAJECTORY_LOGGING;
    } else {
      process.env.ELIZA_TRAJECTORY_LOGGING = originalElizaTrajectoryLogging;
    }
  });

  it("stays enabled in development", () => {
    process.env.NODE_ENV = "development";
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    delete process.env.ENABLE_TRAJECTORIES;
    delete process.env.MILADY_TRAJECTORY_LOGGING;
    delete process.env.TRAJECTORY_LOGGING_ENABLED;
    delete process.env.ELIZA_TRAJECTORY_LOGGING;

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(true);
  });

  it("remains enabled for non-cloud production runtimes unless explicitly disabled", () => {
    process.env.NODE_ENV = "production";
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    delete process.env.ENABLE_TRAJECTORIES;
    delete process.env.MILADY_TRAJECTORY_LOGGING;
    delete process.env.TRAJECTORY_LOGGING_ENABLED;
    delete process.env.ELIZA_TRAJECTORY_LOGGING;

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(true);
  });

  it("honors explicit ENABLE_TRAJECTORIES opt-out in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    process.env.ENABLE_TRAJECTORIES = "false";
    delete process.env.MILADY_TRAJECTORY_LOGGING;
    delete process.env.TRAJECTORY_LOGGING_ENABLED;
    delete process.env.ELIZA_TRAJECTORY_LOGGING;

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(false);
  });

  it("enables trajectory logging by default for Milady cloud-provisioned production containers", () => {
    process.env.NODE_ENV = "production";
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    delete process.env.ENABLE_TRAJECTORIES;
    delete process.env.MILADY_TRAJECTORY_LOGGING;
    delete process.env.TRAJECTORY_LOGGING_ENABLED;
    delete process.env.ELIZA_TRAJECTORY_LOGGING;

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(true);
  });

  it("enables trajectory logging by default for legacy Eliza cloud-provisioned production containers", () => {
    process.env.NODE_ENV = "production";
    delete process.env.MILADY_CLOUD_PROVISIONED;
    process.env.ELIZA_CLOUD_PROVISIONED = "1";
    delete process.env.ENABLE_TRAJECTORIES;
    delete process.env.MILADY_TRAJECTORY_LOGGING;
    delete process.env.TRAJECTORY_LOGGING_ENABLED;
    delete process.env.ELIZA_TRAJECTORY_LOGGING;

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(true);
  });

  it("still honors legacy trajectory env aliases", () => {
    process.env.NODE_ENV = "production";
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    delete process.env.ENABLE_TRAJECTORIES;
    process.env.MILADY_TRAJECTORY_LOGGING = "false";
    delete process.env.TRAJECTORY_LOGGING_ENABLED;
    delete process.env.ELIZA_TRAJECTORY_LOGGING;

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(false);
  });

  it("accepts the legacy ELIZA_TRAJECTORY_LOGGING enable flag", () => {
    process.env.NODE_ENV = "production";
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    delete process.env.ENABLE_TRAJECTORIES;
    delete process.env.MILADY_TRAJECTORY_LOGGING;
    delete process.env.TRAJECTORY_LOGGING_ENABLED;
    process.env.ELIZA_TRAJECTORY_LOGGING = "1";

    expect(shouldEnableTrajectoryLoggingByDefault()).toBe(true);
  });
});
