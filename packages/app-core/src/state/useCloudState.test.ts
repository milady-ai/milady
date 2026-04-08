// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isElectrobunRuntimeMock } = vi.hoisted(() => ({
  isElectrobunRuntimeMock: vi.fn(() => false),
}));

vi.mock("../bridge", async () => {
  const actual = await vi.importActual("../bridge");
  return {
    ...actual,
    isElectrobunRuntime: isElectrobunRuntimeMock,
  };
});

import { shouldUseDirectCloudAuth } from "./useCloudState";

describe("shouldUseDirectCloudAuth", () => {
  beforeEach(() => {
    isElectrobunRuntimeMock.mockReset().mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses direct auth when there is no backend outside desktop", () => {
    expect(shouldUseDirectCloudAuth(false)).toBe(true);
  });

  it("keeps desktop on the local cloud route without a persisted backend", () => {
    isElectrobunRuntimeMock.mockReturnValue(true);
    expect(shouldUseDirectCloudAuth(false)).toBe(false);
  });

  it("does not use direct auth when a backend is already available", () => {
    expect(shouldUseDirectCloudAuth(true)).toBe(false);
  });
});
