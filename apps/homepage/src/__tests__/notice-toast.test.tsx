import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoticeToast } from "../components/NoticeToast";
import { useNoticeToast } from "../lib/useNoticeToast";

describe("NoticeToast", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders nothing when no notice is active", () => {
    const { container } = render(<NoticeToast notice={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    [
      "success",
      "agent ready",
      ["border-emerald-400/30", "bg-emerald-400/10", "text-emerald-100"],
    ],
    [
      "error",
      "delete failed",
      ["border-rose-400/30", "bg-rose-400/10", "text-rose-100"],
    ],
    ["info", "still looking", ["border-brand/30", "bg-brand/10", "text-brand"]],
  ] as const)("renders the %s notice tone", (tone, text, classes) => {
    render(<NoticeToast notice={{ tone, text }} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(text);
    expect(status).toHaveClass(...classes);
  });

  it("auto-dismisses active notices through the shared hook", () => {
    vi.useFakeTimers();

    function Probe() {
      const { notice, setNotice } = useNoticeToast(1000);
      return (
        <>
          <button
            type="button"
            onClick={() => setNotice({ tone: "info", text: "queued" })}
          >
            show notice
          </button>
          <NoticeToast notice={notice} />
        </>
      );
    }

    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "show notice" }));

    expect(screen.getByRole("status")).toHaveTextContent("queued");

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.getByRole("status")).toHaveTextContent("queued");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
