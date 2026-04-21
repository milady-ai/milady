// @vitest-environment jsdom

import * as State from "@miladyai/app-core/state";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodingAgentControlChip } from "./CodingAgentControlChip";

vi.mock("@miladyai/app-core/state", () => ({
  useApp: vi.fn(),
  usePtySessions: vi.fn(),
}));

const stopCodingAgent = vi.fn().mockResolvedValue(true);

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    stopCodingAgent: (...args: Parameters<typeof stopCodingAgent>) =>
      stopCodingAgent(...args),
  },
}));

describe("CodingAgentControlChip", () => {
  beforeEach(() => {
    stopCodingAgent.mockClear();
    vi.mocked(State.useApp).mockReturnValue({
      t: (key: string, values?: Record<string, unknown>) => {
        const d = values?.defaultValue;
        if (typeof d === "string") {
          return d.replace(/\{\{(\w+)\}\}/g, (_m, tok: string) => {
            const v = values?.[tok];
            return v == null ? "" : String(v);
          });
        }
        return key;
      },
    } as ReturnType<typeof State.useApp>);
    vi.mocked(State.usePtySessions).mockReturnValue({ ptySessions: [] });
  });

  it("renders nothing when there are no PTY sessions", () => {
    const { container } = render(<CodingAgentControlChip />);
    expect(container.firstChild).toBeNull();
  });

  it("renders stop-all and calls stopCodingAgent for each session", () => {
    vi.mocked(State.usePtySessions).mockReturnValue({
      ptySessions: [
        {
          sessionId: "s1",
          agentType: "claude-code",
          label: "Task one",
          originalTask: "",
          workdir: "",
          status: "active",
          decisionCount: 0,
          autoResolvedCount: 0,
        },
        {
          sessionId: "s2",
          agentType: "gemini",
          label: "Task two",
          originalTask: "",
          workdir: "",
          status: "tool_running",
          decisionCount: 0,
          autoResolvedCount: 0,
        },
      ],
    });

    render(<CodingAgentControlChip />);

    const stopBtn = screen.getByRole("button", { name: /stop all/i });
    expect(stopBtn).toBeTruthy();
    fireEvent.click(stopBtn);

    expect(stopCodingAgent).toHaveBeenCalledTimes(2);
    expect(stopCodingAgent).toHaveBeenCalledWith("s1");
    expect(stopCodingAgent).toHaveBeenCalledWith("s2");
  });
});
