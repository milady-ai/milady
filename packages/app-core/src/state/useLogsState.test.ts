// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetLogs = vi.fn();

vi.mock("../api", () => ({
  client: {
    getLogs: (...args: unknown[]) => mockGetLogs(...args),
  },
}));

import { useLogsState } from "./useLogsState";

describe("useLogsState", () => {
  beforeEach(() => {
    mockGetLogs.mockReset();
  });

  it("surfaces malformed log payloads instead of silently swallowing them", async () => {
    mockGetLogs.mockResolvedValue({
      entries: { unexpected: true },
      sources: [],
      tags: [],
    });

    const { result } = renderHook(() => useLogsState());

    await act(async () => {
      await result.current.loadLogs();
    });

    expect(result.current.state.logs).toEqual([]);
    expect(result.current.state.logLoadError).toBe(
      "Logs response contained invalid entries.",
    );
  });

  it("keeps previous valid data when a later request fails", async () => {
    mockGetLogs
      .mockResolvedValueOnce({
        entries: [
          {
            timestamp: 1712265600,
            level: "info",
            message: "Agent connected",
            source: "agent",
            tags: ["agent"],
          },
        ],
        sources: ["agent"],
        tags: ["agent"],
      })
      .mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useLogsState());

    await act(async () => {
      await result.current.loadLogs();
    });

    expect(result.current.state.logs).toHaveLength(1);
    expect(result.current.state.logLoadError).toBeNull();

    await act(async () => {
      await result.current.loadLogs();
    });

    expect(result.current.state.logs).toHaveLength(1);
    expect(result.current.state.logLoadError).toBe("network down");
  });
});
