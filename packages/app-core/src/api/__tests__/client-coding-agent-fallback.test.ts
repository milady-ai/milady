/**
 * Tests for mapPtySessionsToCodingAgentSessions — the pure function extracted
 * from MiladyClient.getCodingAgentStatus that maps raw PTY session data into
 * the CodingAgentSession format consumed by the UI.
 */

import { describe, expect, it, vi } from "vitest";
import {
  MiladyClient,
  type RawPtySession,
  mapPtySessionsToCodingAgentSessions,
} from "../client";

describe("mapPtySessionsToCodingAgentSessions", () => {
  it("maps basic PTY session fields correctly", () => {
    const ptySessions: RawPtySession[] = [
      {
        id: "pty-1",
        name: "gemini-session",
        agentType: "gemini",
        workdir: "/tmp/gemini",
        status: "busy",
        metadata: { label: "Gemini Agent" },
      },
      {
        id: "pty-2",
        agentType: "claude",
        workdir: "/tmp/claude",
        status: "ready",
      },
    ];

    const result = mapPtySessionsToCodingAgentSessions(ptySessions);

    expect(result).toHaveLength(2);

    // First session: label from metadata
    expect(result[0].sessionId).toBe("pty-1");
    expect(result[0].label).toBe("Gemini Agent");
    expect(result[0].agentType).toBe("gemini");
    expect(result[0].workdir).toBe("/tmp/gemini");
    expect(result[0].status).toBe("active"); // busy -> active

    // Second session: label falls back to agentType
    expect(result[1].sessionId).toBe("pty-2");
    expect(result[1].label).toBe("claude");
    expect(result[1].status).toBe("active"); // ready -> active
  });

  it("returns empty array for empty input", () => {
    const result = mapPtySessionsToCodingAgentSessions([]);
    expect(result).toHaveLength(0);
  });

  it("maps all terminal PTY states correctly", () => {
    const ptySessions: RawPtySession[] = [
      { id: "s-ready", status: "ready", agentType: "claude" },
      { id: "s-busy", status: "busy", agentType: "claude" },
      { id: "s-error", status: "error", agentType: "claude" },
      { id: "s-stopped", status: "stopped", agentType: "claude" },
      { id: "s-done", status: "done", agentType: "claude" },
      { id: "s-completed", status: "completed", agentType: "claude" },
      { id: "s-exited", status: "exited", agentType: "claude" },
      { id: "s-unknown", status: "something-else", agentType: "claude" },
    ];

    const result = mapPtySessionsToCodingAgentSessions(ptySessions);
    const statusMap = new Map(result.map((t) => [t.sessionId, t.status]));

    // "ready" and "busy" map to "active"
    expect(statusMap.get("s-ready")).toBe("active");
    expect(statusMap.get("s-busy")).toBe("active");

    // "error" maps to "error"
    expect(statusMap.get("s-error")).toBe("error");

    // Terminal states map to "stopped"
    expect(statusMap.get("s-stopped")).toBe("stopped");
    expect(statusMap.get("s-done")).toBe("stopped");
    expect(statusMap.get("s-completed")).toBe("stopped");
    expect(statusMap.get("s-exited")).toBe("stopped");

    // Unknown defaults to "active"
    expect(statusMap.get("s-unknown")).toBe("active");
  });

  it("applies label fallback chain: metadata.label > name > agentType > 'Agent'", () => {
    const ptySessions: RawPtySession[] = [
      {
        id: "with-metadata-label",
        agentType: "claude",
        name: "my-session",
        metadata: { label: "Custom Label" },
      },
      {
        id: "with-name",
        agentType: "claude",
        name: "my-session",
      },
      {
        id: "with-agent-type",
        agentType: "gemini",
      },
      {
        id: "bare-minimum",
      },
    ];

    const result = mapPtySessionsToCodingAgentSessions(ptySessions);

    expect(result[0].label).toBe("Custom Label");
    expect(result[1].label).toBe("my-session");
    expect(result[2].label).toBe("gemini");
    expect(result[3].label).toBe("Agent");
  });

  it("defaults agentType to 'claude' and workdir to '' when missing", () => {
    const result = mapPtySessionsToCodingAgentSessions([{ id: "bare" }]);

    expect(result[0].agentType).toBe("claude");
    expect(result[0].workdir).toBe("");
    expect(result[0].originalTask).toBe("");
    expect(result[0].decisionCount).toBe(0);
    expect(result[0].autoResolvedCount).toBe(0);
  });
});

describe("MiladyClient.listCodingAgentScratchWorkspaces", () => {
  it("warns and falls back to an empty list when the request fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = new MiladyClient("http://127.0.0.1:31337");
    const fetchSpy = vi.spyOn(
      client as unknown as {
        fetch: (path: string, init?: RequestInit) => Promise<unknown>;
      },
      "fetch",
    );
    fetchSpy.mockRejectedValueOnce(new Error("network down"));

    await expect(client.listCodingAgentScratchWorkspaces()).resolves.toEqual(
      [],
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[api-client] Failed to list coding agent scratch workspaces:",
      expect.objectContaining({ message: "network down" }),
    );
  });
});
