// @vitest-environment jsdom

import React from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PtySessionsCtx,
  usePtySessions,
  type PtySessionsValue,
} from "./PtySessionsContext";

describe("PtySessionsContext", () => {
  describe("usePtySessions", () => {
    it("returns default value with empty ptySessions array when no provider wraps the consumer", () => {
      const { result } = renderHook(() => usePtySessions());

      expect(result.current.ptySessions).toEqual([]);
    });

    it("returns the provided value when wrapped in PtySessionsCtx.Provider", () => {
      const customValue: PtySessionsValue = {
        ptySessions: [
          {
            sessionId: "session-1",
            agentType: "claude-code",
            label: "Fix bug",
            originalTask: "fix the bug",
            workdir: "/tmp/ws1",
            status: "active",
            decisionCount: 0,
            autoResolvedCount: 0,
          },
          {
            sessionId: "session-2",
            agentType: "gemini",
            label: "Write tests",
            originalTask: "write tests",
            workdir: "/tmp/ws2",
            status: "completed",
            decisionCount: 1,
            autoResolvedCount: 0,
          },
        ],
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <PtySessionsCtx.Provider value={customValue}>
          {children}
        </PtySessionsCtx.Provider>
      );

      const { result } = renderHook(() => usePtySessions(), { wrapper });

      expect(result.current.ptySessions).toHaveLength(2);
      expect(result.current.ptySessions[0]?.sessionId).toBe("session-1");
      expect(result.current.ptySessions[1]?.sessionId).toBe("session-2");
    });
  });
});
