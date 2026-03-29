import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadElizaConfigMock, loggerWarnMock } = vi.hoisted(() => ({
  loadElizaConfigMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@miladyai/agent/config/config", () => ({
  loadElizaConfig: loadElizaConfigMock,
}));

vi.mock("@elizaos/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@elizaos/core")>()),
  logger: {
    info: vi.fn(),
    warn: loggerWarnMock,
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import { getConfiguredEndpoints } from "@miladyai/agent/services/registry-client";

describe("registry-client config warning", () => {
  beforeEach(() => {
    loadElizaConfigMock.mockReset();
    loggerWarnMock.mockReset();
  });

  it("warns and falls back to an empty endpoint list when config loading fails", () => {
    loadElizaConfigMock.mockImplementation(() => {
      throw new Error("config corrupted");
    });

    expect(getConfiguredEndpoints()).toEqual([]);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "[registry-client] Failed to load config for custom endpoints: config corrupted",
    );
  });
});
